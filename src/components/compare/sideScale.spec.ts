/**
 * 工具卡片字号倍率（纯函数）
 *
 * 这个范围被**两个**地方共用：弹窗里的滑块（写入）和卡片上的 calc()（读取）。
 * 两边一旦不一致，用户就会看到"滑块动了、字不再变大"这种最难查的一类 bug，
 * 因此范围与夹取逻辑放在同一个模块里，并由这里钉住它的边界行为。
 */
import { describe, expect, it } from 'vitest'
import { clampScale, SCALE_MAX, SCALE_MIN } from './sideScale'

describe('clampScale', () => {
  it('区间内的值原样返回', () => {
    expect(clampScale(1)).toBe(1)
    expect(clampScale(1.5)).toBe(1.5)
    expect(clampScale(SCALE_MIN)).toBe(SCALE_MIN)
    expect(clampScale(SCALE_MAX)).toBe(SCALE_MAX)
  })

  it('越界值被夹到区间端点', () => {
    expect(clampScale(99)).toBe(SCALE_MAX)
    expect(clampScale(0.7)).toBe(0.7)
    expect(clampScale(0.1)).toBe(SCALE_MIN)
  })

  /*
   * 兜底路径不是"防御性编程"的摆设：nameScale 来自项目文件，
   * 而工程文件是用户可以手改的 JSON。一个 NaN 或 "abc" 写进 CSS
   * 会让整条 font-size 声明失效，表现为"这个名字突然变回默认大小"，
   * 而用户完全不知道为什么。
   *
   * 0 与负数走同一条路（退回 1）而不是夹到 0.6：
   * "字号 0 倍"没有任何合理解释，它只可能是缺省值被序列化成了 0。
   */
  it('非数值一律退回默认 1，而不是 NaN 或字符串', () => {
    expect(clampScale(undefined)).toBe(1)
    expect(clampScale(null)).toBe(1)
    expect(clampScale('')).toBe(1)
    expect(clampScale('abc')).toBe(1)
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampScale(0)).toBe(1)
    expect(clampScale(-3)).toBe(1)
  })

  it('数字字符串按数值处理', () => {
    expect(clampScale('1.4')).toBe(1.4)
    expect(clampScale('5')).toBe(SCALE_MAX)
  })
})
