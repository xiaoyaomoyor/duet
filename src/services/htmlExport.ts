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

export interface ExportHtmlOptions {
  /** 是否内嵌媒体（默认 true，小于上限的文件才内嵌） */
  embedMedia?: boolean
  /** 内嵌上限 */
  embedLimit?: number
  /** 由调用方提供的"已就绪的展示态 DOM"（避免这里再造一套渲染） */
  presentRoot: HTMLElement
  /**
   * 调用方预先收集好的 CSS。
   * 为什么要在外面收集：导出会临时切换视图，切换期间部分样式表规则可能读不到；
   * 由调用方在切换前收集更可靠。
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
    const css = options.preCollectedCss ?? collectDocumentCss()

    options.onProgress?.('内嵌媒体…')
    const { html: bodyHtml, warnings } = await serializePresentRoot(options.presentRoot, {
      embedMedia,
      embedLimit,
    })

    options.onProgress?.('生成文件…')
    const title = project.title || '对奏'
    const document = buildDocument({ title, css, bodyHtml, warnings, project })

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
 *   - 去掉 Vue 的 data-v-* 属性（无意义且让文件变大）
 *   - 去掉交互残留（按钮、输入框），保证"只读"是结构性的
 */
async function serializePresentRoot(
  root: HTMLElement,
  options: { embedMedia: boolean; embedLimit: number },
): Promise<{ html: string; warnings: string[] }> {
  const clone = root.cloneNode(true) as HTMLElement
  const warnings: string[] = []

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

  // blob: → data URL
  const mediaNodes = Array.from(clone.querySelectorAll<HTMLMediaElement | HTMLImageElement>('img, audio, video, source'))
  for (const node of mediaNodes) {
    const src = node.getAttribute('src')
    if (!src) continue

    if (src.startsWith('blob:')) {
      const inlined = options.embedMedia
        ? await blobUrlToDataUrl(src, options.embedLimit)
        : null
      if (inlined) {
        node.setAttribute('src', inlined)
      } else {
        node.removeAttribute('src')
        warnings.push('有媒体未能内嵌（体积超限或读取失败），只读页中不会显示它')
      }
      continue
    }

    if (/^https?:/i.test(src)) {
      warnings.push('只读页包含外链媒体，对方打开时需要联网；若对方站点有防盗链则可能加载失败')
    }
  }

  // 清掉 Vue 的 scope 属性
  for (const node of Array.from(clone.querySelectorAll('*'))) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith('data-v-')) node.removeAttribute(attr.name)
    }
  }

  return { html: clone.innerHTML, warnings: [...new Set(warnings)] }
}

/** blob: URL → data URI（需要有对应的资源；这里直接从数据库按 id 反查） */
async function blobUrlToDataUrl(blobUrl: string, limit: number): Promise<string | null> {
  try {
    const response = await fetch(blobUrl)
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
}): string {
  const meta = describeProject(input.project)
  const warningBlock =
    input.warnings.length > 0
      ? `<ul class="duet-warnings">${input.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
      : ''

  return `<!doctype html>
<html lang="zh-CN" data-theme="violet-dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(input.title)} · ${APP.nameZh} ${APP.nameEn}</title>
<meta name="generator" content="${APP.nameZh} ${APP.nameEn} v${APP.version}">
<style>
${input.css}
/* —— 只读页专用：静态化所有动效，避免打开即播 —— */
[data-exporting] .no-export { display: none !important; }
body { overflow: auto !important; }
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
function describeProject(project: Project): string {
  const parts = project.sheet.sides.map((side) => {
    const name =
      side.labelOverride ??
      (side.toolRef.kind === 'inline' ? side.toolRef.name : side.toolRef.toolId)
    return side.modelVersion ? `${name} ${side.modelVersion}` : name
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
export async function shouldEmbedAsset(assetId: string, limit = 20 * 1024 * 1024): Promise<boolean> {
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
