/**
 * 程序化工具图标（纯函数）
 *
 * 版权纪律（§10.2）：本项目不内置任何第三方品牌 Logo。
 * 内置工具统一使用「品牌色 + 名称首字」生成图标，风格一致且零版权风险。
 */

import { hashInt } from './hash'
import { initials } from './text'
import { contrastRatio, hexToSoft, readableTextOn, shade } from './color'

/** 缺省品牌色板：工具未指定 color 时，按名称确定性选取（同名永远同色） */
export const FALLBACK_TOOL_COLORS = [
  '#a78bfa',
  '#22d3ee',
  '#f472b6',
  '#60a5fa',
  '#fb923c',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#c084fc',
  '#38bdf8',
] as const

/** 由名称确定性地挑选一个缺省色 */
export function pickToolColor(name: string): string {
  const index = hashInt(name) % FALLBACK_TOOL_COLORS.length
  return FALLBACK_TOOL_COLORS[index] ?? FALLBACK_TOOL_COLORS[0]
}

export interface ProceduralIcon {
  /** 显示用的 1~2 个字符 */
  text: string
  /** 背景色（hex） */
  background: string
  /** 文字色（保证可读） */
  foreground: string
  /** 可直接作为 CSS background 使用的渐变 */
  gradient: string
  /** 可渲染的 SVG 源码（含圆角矩形与首字） */
  svg: string
}

export interface ProceduralIconOptions {
  /** 指定品牌色；缺省时按名称哈希选取 */
  color?: string
  /** 圆角比例，默认 0.22（接近方形图标的观感） */
  radiusRatio?: number
  /** 渐变方向，默认左上到右下 */
  angle?: number
}

/**
 * 生成一个程序化图标。
 * 输出同时包含 SVG 源码与 CSS 渐变，便于 img 与 div 两种渲染方式复用。
 */
export function proceduralIcon(
  name: string,
  options: ProceduralIconOptions = {},
): ProceduralIcon {
  const background = options.color ?? pickToolColor(name)
  const foreground = readableTextOn(background)
  const angle = options.angle ?? 135
  const radiusRatio = options.radiusRatio ?? 0.22

  // 渐变：本色的亮部 → 暗部，制造轻微立体感
  const light = shade(background, 0.18)
  const dark = shade(background, -0.22)
  const gradient = `linear-gradient(${angle}deg, ${light} 0%, ${background} 55%, ${dark} 100%)`

  const text = initials(name)
  const svg = buildIconSvg({ text, background, light, dark, foreground, radiusRatio, angle })

  return { text, background, foreground, gradient, svg }
}

interface BuildIconArgs {
  text: string
  background: string
  light: string
  dark: string
  foreground: string
  radiusRatio: number
  angle: number
}

function buildIconSvg(args: BuildIconArgs): string {
  const size = 64
  const radius = size * args.radiusRatio
  // 渐变方向的端点（按角度做简单线性映射，足够视觉自然）
  const rad = ((args.angle - 90) * Math.PI) / 180
  const cx = size / 2
  const cy = size / 2
  const dx = (Math.cos(rad) * size) / 2
  const dy = (Math.sin(rad) * size) / 2

  const fontSize = args.text.length > 1 ? size * 0.44 : size * 0.52
  const gradientId = `g${Math.abs(hashInt(args.text + args.background)).toString(36)}`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`,
    '<defs>',
    `<linearGradient id="${gradientId}" x1="${round(cx - dx)}" y1="${round(cy - dy)}" x2="${round(cx + dx)}" y2="${round(cy + dy)}" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${args.light}"/>`,
    `<stop offset="0.55" stop-color="${args.background}"/>`,
    `<stop offset="1" stop-color="${args.dark}"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect width="${size}" height="${size}" rx="${round(radius)}" fill="url(#${gradientId})"/>`,
    `<text x="50%" y="50%" fill="${args.foreground}" font-family="Inter, 'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif" font-size="${round(fontSize)}" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(args.text)}</text>`,
    '</svg>',
  ].join('')
}

/** 转为 data URI，可直接放进 <img src> 或导出长图（避免外链与 CORS） */
export function proceduralIconDataUri(name: string, options?: ProceduralIconOptions): string {
  const { svg } = proceduralIcon(name, options)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 生成柔和底色，用于工具头背景等（委托给 color 模块，保持单一实现） */
export function toolSoftBackground(color: string, percent = 10): string {
  return hexToSoft(color, percent)
}

/**
 * 为对比双方挑选一对颜色：
 * 若两侧品牌色过于接近（对比度 < 1.25），第二侧回退到缺省青色，
 * 避免"两边看起来一个颜色"这种最伤对比可读性的情况。
 */
export function ensureDistinctPair(a: string, b: string): [string, string] {
  if (contrastRatio(a, b) >= 1.25) return [a, b]
  return [a, '#22d3ee']
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
