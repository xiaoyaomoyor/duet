/**
 * 颜色工具（纯函数，无副作用）
 *
 * 用途：
 *   - 由对比双方的主题色派生柔和的半透明底色（hexToSoft）
 *   - 生成程序化工具图标（proceduralIcon 的底色选取）
 *   - 主题 token 的对比度校验（check-contrast.mjs 使用同一套数学）
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** 解析 #rgb / #rrggbb；失败返回 null（不抛异常） */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '')
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

function channelToLinear(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度 0~1 */
export function relativeLuminance(color: string | Rgb): number {
  const rgb = typeof color === 'string' ? parseHex(color) : color
  if (!rgb) return 0
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  )
}

/** WCAG 对比度，1~21 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** 是否达到 WCAG AA 正文标准（4.5:1） */
export function meetsAaText(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5
}

/**
 * 把主题色转成可直接用于 CSS 变量的柔和底色。
 * 优先使用 color-mix（现代浏览器），不可用时降级为 rgb() + alpha。
 */
export function hexToSoft(hex: string, percent = 12): string {
  const rgb = parseHex(hex)
  if (!rgb) return 'transparent'
  const alpha = Math.max(0, Math.min(100, percent)) / 100
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${Math.round(alpha * 100)}%)`
}

/**
 * 对比双方主题色派生出的卡片底色（**全应用唯一**的实现）。
 *
 * 为什么要抽出来（M9 实测反馈"全部的模块卡片背景使用统一的背景着色，
 * 对齐工具名卡片的"）：工具卡片走的是 `color-mix(accent 10%)`，
 * 模块卡片走的是 `hexToSoft(accent, 8)` —— 两条路径、两个浓度，
 * 并排看就是两种颜色。现在两边都调这一个函数，浓度只剩一个数字。
 *
 * 浓度取 10%：它是工具卡片原本的取值，也是两者中更"看得见"的一档；
 * 要以它为准去对齐模块卡片，而不是反过来。
 */
export function sideTint(accent: string, percent = 10): string {
  return hexToSoft(accent, percent)
}

/** 更亮 / 更暗（amount 为 -1 ~ 1） */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  // 非法色值原样返回，不猜、不静默替换成黑色
  if (!rgb) return hex
  if (!Number.isFinite(amount) || amount === 0) return hex

  const target = amount < 0 ? 0 : 255
  const t = Math.min(1, Math.abs(amount))
  const mix = (c: number) => Math.round(c + (target - c) * t)
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) })
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/**
 * 与文字颜色配合：给定背景色，返回可读的前景色（黑或白）。
 * 用于程序化图标中的首字颜色。
 */
export function readableTextOn(background: string): string {
  const light = '#f3effb'
  const dark = '#150f26'
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark
}
