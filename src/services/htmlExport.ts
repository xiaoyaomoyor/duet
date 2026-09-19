/**
 * 只读 HTML 导出（§8.7）
 *
 * 目标：产出一个**单文件网页**，对方双击就能看，无需安装任何东西。
 *
 * 实现方式：不打包一份运行时，而是直接复用**当前文档的样式** +
 * 服务端渲染出的静态 DOM。理由：
 *   1. 视觉与演示视图 100% 一致（同一套 CSS）
 *   2. 不用维护第二套渲染实现，也就不会出现"导出页与展示页不一样"
 *   3. 产物体积小（没有 Vue 运行时）
 *
 * 代价：音视频只能保留为原生控件（没有同步播放等高级交互），
 * 这对"给别人看结果"这个用途来说是合理取舍。
 */

import { getAsset } from '@/db/assetsRepo'
import { blobToDataUrl, shouldEmbed } from '@/lib/blob'
import { APP } from '@/app.config'
import { err, ok, type Result } from '@/lib/result'
import { isPresentable } from '@/modules/visibility'
import { getModuleMeta } from '@/modules/meta'
import type { Project } from '@/types/project'
import { t } from '@/i18n/helper'

export interface ExportHtmlOptions {
  /** 是否内嵌媒体（默认 true，小于上限的文件才内嵌） */
  embedMedia?: boolean
  /** 内嵌上限 */
  embedLimit?: number
  /** 由调用方提供的"已就绪的展示态 DOM"（避免这里再造一套渲染） */
  presentRoot: HTMLElement
  /**
   * 可选的补充 CSS；展示 DOM 就绪后仍会收集当前样式。
   */
  preCollectedCss?: string
  onProgress?: (label: string) => void
}

/**
 * 生成只读 HTML。
 *
 * 前置条件：调用方需要先把界面切到演示视图（与长图导出相同的做法），
 * 再把画布节点传进来——这样导出页与用户看到的内容天然一致。
 */
export async function exportReadonlyHtml(
  project: Project,
  options: ExportHtmlOptions,
): Promise<Result<string, string>> {
  const embedMedia = options.embedMedia !== false
  const embedLimit = options.embedLimit ?? 20 * 1024 * 1024

  try {
    options.onProgress?.('整理样式…')
    // 展示组件可能刚刚异步加载；必须在展示 DOM 就绪后再补收一遍样式。
    const css = [options.preCollectedCss, collectDocumentCss()].filter(Boolean).join('\n')

    options.onProgress?.('内嵌媒体…')
    const { html: bodyHtml, warnings } = await serializePresentRoot(options.presentRoot, {
      embedMedia,
      embedLimit,
    })

    options.onProgress?.('生成文件…')
    const title = project.title || '对奏'
    const embeddedCss = await inlineCssUrls(css, { embedMedia, embedLimit }, warnings)
    const document = buildDocument({
      title,
      css: embeddedCss,
      bodyHtml,
      warnings,
      project,
      root: options.presentRoot,
    })

    return ok(document)
  } catch (error) {
    return err(`生成只读网页失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 收集当前文档里所有样式表与 <style> 的内容 */
export function collectDocumentCss(): string {
  const chunks: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText)
    } catch {
      // 跨域样式表读不到规则，跳过（本地应用不会出现）
    }
  }

  return chunks.join('\n')
}

/**
 * 把展示态 DOM 序列化为可独立打开的 HTML 片段。
 *
 * 处理要点：
 *   - blob: URL 在别的文档里无效 → 必须换成 data URI
 *   - 保留 Vue 的 data-v-* 属性，作用域样式依赖这些选择器
 *   - 去掉交互残留（按钮、输入框），保证"只读"是结构性的
 */
async function serializePresentRoot(
  root: HTMLElement,
  options: { embedMedia: boolean; embedLimit: number },
): Promise<{ html: string; warnings: string[] }> {
  const clone = root.cloneNode(true) as HTMLElement
  const warnings: string[] = []

  // A scene export must not carry hidden scenes or their private media into the file.
  for (const scene of clone.querySelectorAll<HTMLElement>('.project-scene')) {
    if (scene.style.display === 'none') scene.remove()
  }
  for (const transport of clone.querySelectorAll('.stage-media__transport')) transport.remove()

  // 画布会继承演示容器的变量；脱离容器后仍应保持同样的尺寸和配色。
  const computed = getComputedStyle(root)
  for (const property of Array.from(computed)) {
    if (property.startsWith('--'))
      clone.style.setProperty(property, computed.getPropertyValue(property))
  }
  clone.style.zoom = '1'
  const wallpaper = root.closest('.present')?.querySelector<HTMLElement>('.present__pattern')
  if (wallpaper) {
    const style = getComputedStyle(wallpaper)
    clone.style.backgroundImage = style.backgroundImage
    clone.style.backgroundSize = style.backgroundSize
    clone.style.backgroundColor = style.backgroundColor
  }

  // 不保存临时揭晓的真实身份；保留同样的版式与遮罩，而非删掉整个标题。
  for (const node of clone.querySelectorAll<HTMLElement>('[data-export-mask]')) {
    node.textContent = node.dataset.exportMask === 'icon' ? '' : (node.dataset.exportLabel ?? '•••')
    node.removeAttribute('title')
    node.removeAttribute('aria-label')
    node.classList.add(
      node.dataset.exportMask === 'icon' ? 'side-head__logo--masked' : 'side-head__mask--hidden',
    )
    const replacement = document.createElement('span')
    for (const attr of Array.from(node.attributes)) {
      if (!['type', 'tabindex'].includes(attr.name)) replacement.setAttribute(attr.name, attr.value)
    }
    replacement.textContent = node.textContent
    node.replaceWith(replacement)
  }

  // 清掉所有可交互元素：只读页不应该有任何能点出行为的东西
  for (const selector of ['button', 'input', 'textarea', 'select', '.no-export']) {
    for (const node of Array.from(clone.querySelectorAll(selector))) {
      if (node.classList.contains('no-export')) {
        node.remove()
        continue
      }
      // 播放控件要保留（audio/video 是媒体元素不是按钮），其余按钮移除
      node.remove()
    }
  }

  // 只读文件没有 Vue 事件，原生播放器是可离线工作的播放入口。
  for (const media of clone.querySelectorAll<HTMLMediaElement>('audio, video')) {
    media.controls = true
    media.removeAttribute('autoplay')
    media.removeAttribute('hidden')
    media.classList.add('duet-export-media')
    if (media.tagName === 'AUDIO') {
      const audio = media.closest('.audio')
      audio?.querySelector('.player')?.remove()
      audio?.querySelector('.audio__body')?.append(media)
    }
  }

  // blob: → data URL
  const mediaNodes = Array.from(
    clone.querySelectorAll<HTMLMediaElement | HTMLImageElement>('img, audio, video, source'),
  )
  for (const node of mediaNodes) {
    const src = node.getAttribute('src')
    if (!src) continue

    if (src.startsWith('blob:')) {
      const inlined = options.embedMedia ? await blobUrlToDataUrl(src, options.embedLimit) : null
      if (inlined) {
        node.setAttribute('src', inlined)
      } else {
        node.removeAttribute('src')
        warnings.push('有媒体未能内嵌（体积超限或读取失败），只读页中不会显示它')
      }
      continue
    }

    if (!/^(data:|#)/i.test(src)) {
      // 本地品牌图片的相对 URL 也必须内嵌，否则 file:// 打开会丢图。
      const absolute = new URL(src, document.baseURI).href
      const embedded = options.embedMedia
        ? await blobUrlToDataUrl(absolute, options.embedLimit)
        : null
      node.setAttribute('src', embedded ?? absolute)
      if (embedded) continue
      warnings.push('只读页包含外链媒体，对方打开时需要联网；若对方站点有防盗链则可能加载失败')
    }
  }

  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('[style]')]) {
    node.setAttribute(
      'style',
      await inlineCssUrls(node.getAttribute('style') ?? '', options, warnings),
    )
  }
  for (const video of clone.querySelectorAll('video[poster]')) {
    const url = new URL(video.getAttribute('poster')!, document.baseURI).href
    const embedded = options.embedMedia ? await blobUrlToDataUrl(url, options.embedLimit) : null
    if (embedded) video.setAttribute('poster', embedded)
    else if (url.startsWith('blob:')) video.removeAttribute('poster')
    else video.setAttribute('poster', url)
  }

  return { html: clone.outerHTML, warnings: [...new Set(warnings)] }
}

async function inlineCssUrls(
  css: string,
  options: { embedMedia: boolean; embedLimit: number },
  warnings: string[],
): Promise<string> {
  const urls = new Map<string, string>()
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const src = match[2]?.trim()
    if (!src || /^(data:|#)/i.test(src) || urls.has(match[0])) continue
    const absolute = new URL(src, document.baseURI).href
    const embedded = options.embedMedia
      ? await blobUrlToDataUrl(absolute, options.embedLimit)
      : null
    urls.set(
      match[0],
      embedded
        ? `url("${embedded}")`
        : absolute.startsWith('blob:')
          ? 'none'
          : `url("${absolute}")`,
    )
    if (!embedded) warnings.push('部分背景、图标或字体未内嵌，离线打开时可能不可用')
  }
  for (const [from, to] of urls) css = css.split(from).join(to)
  return css
}

/** blob: URL → data URI（需要有对应的资源；这里直接从数据库按 id 反查） */
async function blobUrlToDataUrl(blobUrl: string, limit: number): Promise<string | null> {
  try {
    const response = await fetch(blobUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!shouldEmbed(blob.size, limit)) return null
    const result = await blobToDataUrl(blob)
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

/** 拼出最终的单文件 HTML */
function buildDocument(input: {
  title: string
  css: string
  bodyHtml: string
  warnings: string[]
  project: Project
  root: HTMLElement
}): string {
  const meta = describeProject(input.project, input.root)
  const theme = document.documentElement.dataset.theme ?? 'violet-dark'
  const designTheme =
    input.root.dataset.designTheme ??
    document.documentElement.dataset.designTheme ??
    (theme === 'light' ? 'paper' : 'ink')
  const language = document.documentElement.lang || 'zh-CN'
  const warningBlock =
    input.warnings.length > 0
      ? `<ul class="duet-warnings">${input.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
      : ''

  return `<!doctype html>
<html lang="${escapeHtml(language)}" data-theme="${escapeHtml(theme)}" data-design-theme="${escapeHtml(designTheme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="${designTheme === 'paper' ? 'light' : 'dark'}">
<title>${escapeHtml(input.title)} · ${APP.nameZh} ${APP.nameEn}</title>
<meta name="generator" content="${APP.nameZh} ${APP.nameEn} v${APP.version}">
<style>
${input.css.replace(/<\/style/gi, '<\\/style')}
/* —— 只读页专用：静态化所有动效，避免打开即播 —— */
[data-exporting] .no-export { display: none !important; }
body { overflow: auto !important; }
.duet-readonly-canvas *, .duet-readonly-canvas *::before, .duet-readonly-canvas *::after {
  animation: none !important; transition: none !important;
}
.duet-export-media { display: block !important; visibility: visible !important; width: 100% !important; grid-column: 1 / -1; }
audio.duet-export-media { height: 42px !important; min-height: 42px; margin-top: 8px; }
.duet-readonly-canvas [data-export-mask] { color: transparent !important; background: #18181b !important; }
.duet-readonly-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 20px; font-size: 12px; color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface);
}
.duet-readonly-bar a { color: var(--accent-500); }
.duet-warnings { margin: 12px 20px; padding-left: 18px; font-size: 12px; color: var(--warning); }
.duet-warnings li { margin: 2px 0; }
</style>
</head>
<body>
<div class="duet-readonly-bar">
  <span>${escapeHtml(meta)}</span>
  <span>${escapeHtml(APP.nameZh)} ${APP.nameEn} · ${escapeHtml(APP.repo)}</span>
</div>
${warningBlock}
<div class="duet-readonly-canvas">${input.bodyHtml}</div>
</body>
</html>`
}

/** 一行元信息：两侧工具与版本，让人一眼知道这是在比什么 */
function describeProject(project: Project, root: HTMLElement): string {
  const headers = Array.from(root.querySelectorAll<HTMLElement>('[data-side-id]'))
  const parts = project.sheet.sides.map((side, index) => {
    const header = headers.find((node) => node.dataset.sideId === side.id)
    const name =
      side.showName === false
        ? ''
        : side.anonymizeName
          ? t('compare.anonymousTool', { n: index + 1 })
          : (header?.dataset.exportName ??
            side.labelOverride ??
            (side.toolRef.kind === 'inline' ? side.toolRef.name : side.toolRef.toolId))
    const version =
      side.showVersion === false || side.anonymizeVersion
        ? ''
        : (header?.dataset.exportVersion ?? side.modelVersion)
    return [name, version].filter(Boolean).join(' ')
  })
  return [project.title, parts.join(' vs ')].filter(Boolean).join(' · ')
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 该资源是否值得内嵌（供 UI 预估体积用） */
export async function shouldEmbedAsset(
  assetId: string,
  limit = 20 * 1024 * 1024,
): Promise<boolean> {
  const asset = await getAsset(assetId)
  return asset ? shouldEmbed(asset.size, limit) : false
}

/** 供 UI 展示：项目里有哪些模块类型（用于导出前的自检提示） */
export function describeModules(project: Project): string[] {
  const types = new Set<string>()
  for (const row of project.sheet.rows) {
    for (const cell of Object.values(row.cells)) {
      for (const module of cell.modules) {
        if (isPresentable(module)) types.add(getModuleMeta(module.type)?.titleKey ?? module.type)
      }
    }
  }
  return Array.from(types)
}
