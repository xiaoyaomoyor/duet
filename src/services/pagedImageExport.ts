import { exportElementToPng, type ExportImageOptions } from './imageExport'
import { createZip } from '@/lib/zip'
import { err, ok, type Result } from '@/lib/result'
export interface ImagePage {
  start: number
  height: number
}
export function planImagePages(
  height: number,
  limit: number,
  boundaries: number[] = [],
  protectedRanges: { top: number; bottom: number }[] = [],
): ImagePage[] {
  if (!Number.isFinite(height) || !Number.isFinite(limit) || height < 1 || limit < 1)
    throw new Error('图片尺寸无效')
  const pages: ImagePage[] = []
  let start = 0
  while (start < height) {
    const end = Math.min(height, start + limit)
    const candidates = boundaries.filter((b) => b > start && b <= end)
    let stop = end === height ? end : (candidates.at(-1) ?? end)
    // If one scene is taller than a page, move the cut above intersecting text lines/images.
    if (end !== height && !candidates.length) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const crossing = protectedRanges.filter(
          (r) => r.top > start + 1 && r.top < stop && r.bottom > stop,
        )
        if (!crossing.length) break
        stop = Math.floor(Math.min(...crossing.map((r) => r.top)))
      }
    }
    pages.push({ start, height: stop - start })
    start = stop
    if (pages.length > 40) throw new Error('报告超过 40 页，请按测试题分别导出')
  }
  return pages
}
/** Each page owns a bounded canvas; never allocate a full report canvas and crop afterwards. */
export async function exportPagedPng(
  root: HTMLElement,
  options: ExportImageOptions & { paginate?: boolean } = {},
): Promise<Result<{ blob: Blob; extension: 'png' | 'zip'; warnings: string[] }, string>> {
  const width = Math.ceil(root.scrollWidth || root.getBoundingClientRect().width),
    height = Math.ceil(root.scrollHeight || root.getBoundingClientRect().height),
    scale = options.scale ?? 2
  const limit = Math.floor(Math.min(8192 / scale, 16_000_000 / (width * scale * scale)))
  if (width * scale > 8192 || limit < 1) return err('画面过宽，请降低图片倍率或缩窄窗口后重试')
  if (height <= limit && !options.paginate) {
    const result = await exportElementToPng(root, options)
    return result.ok ? ok({ ...result.value, extension: 'png' }) : result
  }
  let host: HTMLElement | undefined
  try {
    const top = root.getBoundingClientRect().top
    const scenes = [...root.querySelectorAll<HTMLElement>('.project-scene')].filter(
      (s) => s.getBoundingClientRect().height > 0,
    )
    const boundaries = scenes
      .map((s) => Math.round(s.getBoundingClientRect().bottom - top))
      .filter((n) => n > 0 && n < height)
      .sort((a, b) => a - b)
    const protectedRanges: { top: number; bottom: number }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      range = document.createRange()
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue
      range.selectNodeContents(node)
      for (const rect of range.getClientRects())
        if (rect.height > 0)
          protectedRanges.push({ top: rect.top - top, bottom: rect.bottom - top })
    }
    for (const media of root.querySelectorAll('img,video')) {
      const rect = media.getBoundingClientRect()
      if (rect.height > 0 && rect.height < limit)
        protectedRanges.push({ top: rect.top - top, bottom: rect.bottom - top })
    }
    const pages =
      options.paginate && boundaries.length
        ? boundaries.concat(height).flatMap((end, i) => {
            const start = i ? boundaries[i - 1]! : 0
            return planImagePages(
              end - start,
              limit,
              [],
              protectedRanges.map((r) => ({ top: r.top - start, bottom: r.bottom - start })),
            ).map((p) => ({
              start: p.start + start,
              height: p.height,
            }))
          })
        : planImagePages(height, limit, boundaries, protectedRanges)
    if (pages.length > 40) return err('报告超过 40 页，请按测试题分别导出')
    host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;overflow:hidden;pointer-events:none;`
    host.setAttribute('aria-hidden', 'true')
    // Keep the same inherited theme, typography and container dimensions as the source.
    const computed = getComputedStyle(root)
    for (const key of Array.from(computed))
      if (key.startsWith('--')) host.style.setProperty(key, computed.getPropertyValue(key))
    root.parentElement!.appendChild(host)
    const clone = root.cloneNode(true) as HTMLElement
    clone.style.width = `${width}px`
    clone.style.margin = '0'
    clone.style.height = `${height}px`
    clone.style.maxHeight = 'none'
    clone.removeAttribute('id')
    host.appendChild(clone)
    const files: { name: string; blob: Blob }[] = [],
      warnings = new Set<string>()
    for (const [index, page] of pages.entries()) {
      options.onProgress?.(`渲染第 ${index + 1} / ${pages.length} 页…`)
      host.style.height = `${page.height}px`
      clone.style.position = 'absolute'
      clone.style.top = `${-page.start}px`
      // The viewport's scrollHeight includes overflow. Render a bounded viewport explicitly.
      const result = await exportElementToPng(host, {
        ...options,
        captureHeight: page.height,
        captureWidth: width,
        onProgress: () => {},
      })
      if (!result.ok) return result
      result.value.warnings.forEach((w) => warnings.add(w))
      files.push({
        name: `page-${String(index + 1).padStart(3, '0')}.png`,
        blob: result.value.blob,
      })
    }
    const split = pages.some((p) => p.start > 0 && !boundaries.includes(p.start))
    if (split) warnings.add('超长场景已连续分段，请按页码顺序阅读；分段处可能跨越文字或媒体。')
    files.push({
      name: 'manifest.json',
      blob: new Blob([
        JSON.stringify(
          {
            version: 1,
            scale,
            width: width * scale,
            pages: pages.map((p, i) => ({
              file: files[i]!.name,
              sourceTop: p.start,
              height: p.height * scale,
            })),
          },
          null,
          2,
        ),
      ]),
    })
    files.push({
      name: 'README.txt',
      blob: new Blob([
        `Duet 分页图片 · ${pages.length} 页\n按 page-001.png 起顺序阅读。优先在场景边界分页，超过单页上限的场景连续分段。\n每页不超过 8192 像素单边 / 1600 万像素。保留 ${scale}× 倍率。\n${[...warnings].join('\n')}`,
      ]),
    })
    return ok({ blob: await createZip(files), extension: 'zip', warnings: [...warnings] })
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  } finally {
    host?.remove()
  }
}
