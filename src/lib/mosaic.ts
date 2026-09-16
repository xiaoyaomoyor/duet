/**
 * 马赛克占位图（纯函数，零资源）
 *
 * 用途：工具 LOGO 的"匿名处理"（§21.13 第 2 条）。
 * 用户的原话是"可以变成一个预制的马赛克图片（所有的 LOGO 都统一使用这个马赛克图片）"——
 * 关键在**统一**：一张打码图重复出现在左右两栏，观者一眼就知道
 * "这两个位置是被有意遮住的"，而不会去猜"为什么两边图案不一样"。
 *
 * 为什么程序化生成而不是放一张 PNG 进仓库：
 *   1. 少一个二进制资源，也就少一份"改主题时忘了同步它"的债；
 *   2. 颜色可以跟着主题走（深色主题下用浅一档的灰，否则黑块在黑底上看不见）；
 *   3. 结果**确定性**——同一个 seed 永远得到同一张图，
 *      因此导出长图、只读 HTML、编辑视图三处逐像素一致。
 */

/** 一贯的确定性伪随机：同名同色，重复渲染不会闪 */
function hashInt(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export interface MosaicOptions {
  /** 格子数（正方形网格边长），默认 6 */
  cells?: number
  /** 深色格 */
  dark?: string
  /** 浅色格 */
  light?: string
  /** 随机种子；同一个种子永远得到同一张图 */
  seed?: string
}

/**
 * 生成马赛克图的 SVG 源码。
 *
 * 每个格子从两档灰里确定性地挑一个——这正是"马赛克"的视觉本质：
 * 有规律的分块 + 无规律的明暗。用纯色块而不是模糊滤镜，
 * 是因为它在**缩放与导出**时都不会产生额外的重采样噪声。
 */
export function mosaicSvg(options: MosaicOptions = {}): string {
  const cells = options.cells ?? 6
  const dark = options.dark ?? '#4b5563'
  const light = options.light ?? '#9ca3af'
  const seed = options.seed ?? 'duet-mosaic'

  const size = 64
  const step = size / cells
  const rects: string[] = []

  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const pick = hashInt(`${seed}:${row}:${col}`) % 2 === 0
      rects.push(
        `<rect x="${round(col * step)}" y="${round(row * step)}" width="${round(step + 0.5)}" height="${round(step + 0.5)}" fill="${pick ? dark : light}"/>`,
      )
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`,
    `<rect width="${size}" height="${size}" fill="${light}"/>`,
    ...rects,
    '</svg>',
  ].join('')
}

/** 直接可用的 data URI（放进 <img src> 或 CSS 背景） */
export function mosaicDataUri(options: MosaicOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mosaicSvg(options))}`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
