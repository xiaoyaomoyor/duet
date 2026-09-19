/**
 * 长图导出（§8.6）
 *
 * 已知风险与对策（每一条都对应线上真实会发生的失败）：
 *   1. 网络字体未就绪 → 截图里字体回退     → 导出前 await document.fonts.ready
 *   2. 图片未解码完 → 大片空白             → 导出前等待所有 <img> 的 load/error
 *   3. 外链图片跨域 → canvas 被污染、直接失败 → 导出前把外链内联为 data URI
 *   4. 尺寸超过浏览器上限（约 16384px）     → 自动降倍率并告知用户
 *   5. 隐藏滚动容器导致只截到首屏          → 导出期临时解除高度限制
 */

import { toBlob, toPng } from 'html-to-image'
import { blobToDataUrl } from '@/lib/blob'
import { err, ok, type Result } from '@/lib/result'

/** 浏览器 canvas 单边上限（Chrome/Firefox 约 16384，Safari 更低一些） */
const MAX_CANVAS_EDGE = 16384

/** 单个资源等待上限：外链挂了也不该让导出永远卡住 */
const MEDIA_WAIT_TIMEOUT_MS = 8000

/**
 * 整张图渲染的上限。
 *
 * 比 MEDIA_WAIT_TIMEOUT_MS 宽松得多：真实的整页光栅化在内容多时确实要几秒，
 * 我们要拦的是"永久挂起"，不是"慢"。30 秒还没出来就一定出问题了。
 */
const EXPORT_RENDER_TIMEOUT_MS = 30_000

export interface ExportImageOptions {
  /** 像素倍率 */
  scale?: 1 | 2
  /** 背景色（不传则读取 CSS 变量 --bg-base） */
  backgroundColor?: string
  /** 进度回调 */
  onProgress?: (label: string) => void
}

export interface ExportImageResult {
  blob: Blob
  width: number
  height: number
  /** 实际使用的倍率（可能因尺寸上限被降低） */
  scale: number
  /** 导出前发现的风险提示（如外链图片可能失败） */
  warnings: string[]
}

/** 导出前的就绪检查结果 */
export interface PrepareReport {
  /** 仍然无法内联的外链图片数量（可能导致导出失败或空白） */
  riskyExternalImages: number
  /** 加载失败的图片数量 */
  brokenImages: number
  warnings: string[]
}

/**
 * 等待元素内的媒体就绪，并把外链图片内联。
 * 返回风险报告——调用方应把它展示给用户，而不是静默导出。
 */
export async function prepareForExport(root: HTMLElement): Promise<PrepareReport> {
  const warnings: string[] = []
  let riskyExternalImages = 0

  // ① 字体先就绪，避免字体回退
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }

  // ② 所有图片加载完成（成功的与失败的都算完成）
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(images.map((img) => waitForImage(img)))

  // ③ 外链图片内联：否则 canvas 会被跨域污染
  const externalImages = images.filter((img) => /^https?:/i.test(img.currentSrc || img.src))
  for (const img of externalImages) {
    const inlined = await tryInlineImage(img)
    if (!inlined) riskyExternalImages += 1
  }

  const brokenImages = images.filter((img) => img.complete && img.naturalWidth === 0).length

  if (riskyExternalImages > 0) {
    warnings.push(
      `有 ${riskyExternalImages} 张外链图片无法内联（对方站点未开放跨域访问），导出的图片中它们可能是空白。建议先"镜像"这些图片。`,
    )
  }
  if (brokenImages > 0) {
    warnings.push(`有 ${brokenImages} 张图片加载失败，导出结果中不会显示。`)
  }

  return { riskyExternalImages, brokenImages, warnings }
}

/**
 * 把元素导出为 PNG。
 *
 * 重要：调用方需通过 `document.body.dataset.exporting = '1'` 切换导出态样式
 * （隐藏工具栏等 .no-export 元素、解除滚动容器高度限制）。
 */
export async function exportElementToPng(
  root: HTMLElement,
  options: ExportImageOptions = {},
): Promise<Result<ExportImageResult, string>> {
  const warnings: string[] = []

  options.onProgress?.('检查媒体…')
  const report = await prepareForExport(root)
  warnings.push(...report.warnings)

  // 尺寸与倍率
  const rect = root.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(root.scrollWidth || rect.width))
  const height = Math.max(1, Math.ceil(root.scrollHeight || rect.height))

  let scale = options.scale ?? 2
  const maxScale = Math.min(MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height)
  if (maxScale < scale) {
    const adjusted = Math.max(1, Math.floor(maxScale * 10) / 10)
    scale = adjusted as 1 | 2
    warnings.push(`内容尺寸 ${width}×${height} 超过浏览器画布上限，倍率已自动降到 ${scale}×。`)
  }

  const backgroundColor = options.backgroundColor ?? readBackgroundColor(root)

  options.onProgress?.('渲染画布…')

  const asBlob = await safeToBlob(root, { width, height, backgroundColor, scale })
  if (!asBlob.ok) return asBlob

  options.onProgress?.('完成')
  return ok({
    blob: asBlob.value,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
    warnings,
  })
}

/** 把元素导出为 data URL（只读 HTML 导出时复用同一套准备逻辑） */
export async function exportElementToDataUrl(
  root: HTMLElement,
  options: ExportImageOptions = {},
): Promise<Result<string, string>> {
  const report = await prepareForExport(root)
  if (report.brokenImages > 0) return err(report.warnings.join('；'))

  const rect = root.getBoundingClientRect()
  const scale = options.scale ?? 2
  try {
    const dataUrl = await toPng(root, {
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      backgroundColor: options.backgroundColor ?? readBackgroundColor(root),
      style: { margin: '0', border: '0' },
      pixelRatio: scale,
      cacheBust: true,
    })
    return ok(dataUrl)
  } catch (error) {
    return err(`生成图片失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

// ——————————————————————————————————————————————————————————
// 内部工具
// ——————————————————————————————————————————————————————————

async function safeToBlob(
  root: HTMLElement,
  options: { width: number; height: number; backgroundColor: string; scale: number },
): Promise<Result<Blob, string>> {
  try {
    /*
     * 给 html-to-image 加一道超时兜底。
     *
     * 原因（实测踩到）：它内部的图片加载写成
     *     img.onload = () => { img.decode().then(() => rAF(() => resolve())) }
     * `decode()` **没有 catch**：一旦它 reject，这个 Promise 永不 settle，
     * 整个导出会**无限挂起**——不抛异常、不报错、不下载，
     * 用户只看到一个卡住的对话框，完全无从判断出了什么事。
     *
     * 库内部修不了，但可以在外面兜底：超时后明确告知失败，
     * 至少让用户知道是导出这一步的问题，而不是以为应用死了。
     */
    const blob = await Promise.race([
      toBlob(root, {
        width: options.width,
        height: options.height,
        backgroundColor: options.backgroundColor,
        pixelRatio: options.scale,
        cacheBust: true,
        // Computed auto margins become pixel offsets when cloned into an SVG.
        // The exported image starts at the canvas edge, not its position in the workspace.
        style: { margin: '0', border: '0' },
        /*
         * 过滤掉不该出现在导出图里的节点。
         *
         * 除了显式的 .no-export，这里还要**剔除所有注释节点**——
         * 原因是踩过的真实故障：导出会把 DOM 序列化成 SVG 再用 <img> 加载，
         * 而 XML 规定注释里不得出现连续两个短横线（"--"）。
         * 模板注释里只要写了 CSS 变量名（如 --col-frac），
         * 整张 SVG 就会解析失败，表现是"导出失败"且原因极难定位。
         * 注释本来就不参与渲染，去掉它既修了这个坑，也让产物更干净
         * （顺带清掉 Vue 的 <!--v-if--> 与 teleport 标记）。
         */
        filter: (node) =>
          node.nodeType !== Node.COMMENT_NODE &&
          !(node instanceof Element && node.classList.contains('no-export')),
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`渲染超过 ${EXPORT_RENDER_TIMEOUT_MS / 1000} 秒仍未完成`)),
          EXPORT_RENDER_TIMEOUT_MS,
        )
      }),
    ])

    if (!blob) return err('导出失败：未能生成图片数据（可能是画布被跨域资源污染）')
    if (blob.size === 0) return err('导出失败：生成的图片为空')
    return ok(blob)
  } catch (error) {
    return err(
      `导出失败：${describeExportError(error)}。若内容包含外链图片，请先"镜像"为本地资源后重试。`,
    )
  }
}

/**
 * 把导出过程中抛出的东西变成人能看懂的一句话。
 *
 * 为什么需要：html-to-image 内部的图片加载失败时，
 * `img.onerror = reject` 直接把**原始 Event 对象**抛出来，
 * `String(event)` 得到的就是毫无信息量的 `[object Event]`——
 * 用户看到"导出失败：[object Event]"，完全无从下手。
 * 这里把事件目标上的信息挖出来（是哪个资源、什么类型）。
 */
function describeExportError(error: unknown): string {
  if (error instanceof Event) {
    const target = error.target as (HTMLImageElement & { href?: { baseVal?: string } }) | null
    const src = target?.currentSrc || target?.src || target?.href?.baseVal || ''
    return src
      ? `渲染时资源加载失败（${error.type}）：${src.slice(0, 120)}`
      : `渲染时资源加载失败（${error.type}）`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function waitForImage(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve()

  return new Promise<void>((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    const timer = setTimeout(done, MEDIA_WAIT_TIMEOUT_MS)
    img.addEventListener('load', done)
    img.addEventListener('error', done)
  })
}

/** 尝试把外链图片转成 data URI（失败返回 false，由调用方计入风险） */
async function tryInlineImage(img: HTMLImageElement): Promise<boolean> {
  const src = img.currentSrc || img.src
  try {
    const response = await fetch(src, { mode: 'cors' })
    if (!response.ok) return false
    const blob = await response.blob()
    const dataUrl = await blobToDataUrl(blob)
    if (!dataUrl.ok) return false

    img.src = dataUrl.value
    await waitForImage(img)
    return true
  } catch {
    return false
  }
}

/** 读取当前主题的底色，避免导出图透明或泛白 */
function readBackgroundColor(root: HTMLElement = document.documentElement): string {
  if (typeof document === 'undefined') return '#0b0714'
  const value = getComputedStyle(root).getPropertyValue('--bg-base').trim()
  return value || '#0b0714'
}

/** 让某段异步工作期间处于"导出态"（切换 CSS、解除滚动限制） */
export async function withExportingState<T>(fn: () => Promise<T>): Promise<T> {
  const { body } = document
  body.dataset.exporting = '1'
  try {
    // 等一帧，让导出态样式（.no-export 隐藏、容器解限高）生效后再截图
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    return await fn()
  } finally {
    delete body.dataset.exporting
  }
}

/**
 * 在演示视图之外进行截图：临时把画布交给离屏容器渲染。
 *
 * 为什么需要：编辑视图里每个模块都带编辑器，直接截会把编辑器也截进去。
 * 而演示视图是**用户可感知地切换视图**，导出时闪一下并不礼貌。
 * 这里选择"临时切换 UI 状态 → 等渲染 → 截图 → 还原"，
 * 因此调用方必须传入一对 enter/exit 回调。
 */
export async function captureWithPresentMode(options: {
  enter: () => Promise<void>
  exit: () => Promise<void>
  target: () => HTMLElement | null
  exportOptions: ExportImageOptions
}): Promise<Result<ExportImageResult, string>> {
  await options.enter()
  try {
    // 等两帧：第一帧完成视图切换，第二帧完成渲染器内部的媒体解析
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const root = options.target()
    if (!root) return err('未找到要导出的内容区域')

    return await withExportingState(() => exportElementToPng(root, options.exportOptions))
  } finally {
    await options.exit()
  }
}
