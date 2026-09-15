/**
 * 图标注册表（对奏 Duet）
 *
 * 纪律：新增图标 = 在 assets/icons/ 放一个 .svg + 在下方登记一行。
 * 图标统一为 24×24 viewBox、stroke="currentColor" 的线性风格，
 * 因此颜色与粗细由 CSS 控制，多主题下无需替换资源。
 */

const files = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 文件名 → SVG 源码 */
const raw: Record<string, string> = {}
for (const [path, svg] of Object.entries(files)) {
  const name = path.split('/').pop()?.replace('.svg', '')
  if (name) raw[name] = svg
}

/** 已登记的图标名（供开发期校验与文档使用） */
export const ICON_NAMES = Object.keys(raw).sort()

export const EMPTY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"></svg>'

const warned = new Set<string>()

/** 取图标的 SVG 源码；未知名称返回空图标并（开发期）告警一次 */
export function getIconSvg(name: string): string {
  const svg = raw[name]
  if (svg) return svg

  if (import.meta.env.DEV && !warned.has(name)) {
    warned.add(name)
    console.warn(`[duet/icons] 未登记的图标："${name}"，请在 src/assets/icons/ 下添加 ${name}.svg`)
  }
  return EMPTY_ICON
}

/** 是否已登记该图标 */
export function hasIcon(name: string): boolean {
  return name in raw
}
