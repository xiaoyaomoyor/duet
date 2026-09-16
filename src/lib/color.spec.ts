/**
 * 颜色工具单测
 *
 * 关键断言来自施工文档 §14.2 的实测对比度表——这些数字是主题的验收依据，
 * 一旦有人改了 token 而没同步这里，测试就会失败。
 */
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  hexToSoft,
  meetsAaText,
  parseHex,
  readableTextOn,
  relativeLuminance,
  shade,
  sideTint,
  toHex,
} from './color'

describe('parseHex', () => {
  it('解析 6 位与 3 位十六进制', () => {
    expect(parseHex('#a78bfa')).toEqual({ r: 167, g: 139, b: 250 })
    expect(parseHex('a78bfa')).toEqual({ r: 167, g: 139, b: 250 })
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('非法输入返回 null 而不抛异常', () => {
    expect(parseHex('')).toBeNull()
    expect(parseHex('#xyz')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('rgb(1,2,3)')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('黑白对比度为 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('同色对比度为 1:1', () => {
    expect(contrastRatio('#8c82aa', '#8c82aa')).toBeCloseTo(1, 5)
  })

  it('与顺序无关', () => {
    expect(contrastRatio('#f3effb', '#150f26')).toBeCloseTo(
      contrastRatio('#150f26', '#f3effb'),
      5,
    )
  })

  // —— 紫夜主题的验收基线（对应 §14.2 实测表） ——
  const SURFACE = '#150f26'
  const cases: Array<[string, string, number]> = [
    ['text-primary', '#f3effb', 16.44],
    ['text-secondary', '#c4b9e0', 10.07],
    ['text-muted', '#8c82aa', 5.22],
    ['accent-500', '#a78bfa', 6.84],
    ['side-b', '#22d3ee', 10.3],
    ['success', '#34d399', 9.68],
    ['warning', '#fbbf24', 11.15],
    ['danger', '#f87171', 6.73],
    ['info', '#60a5fa', 7.32],
  ]

  it.each(cases)('%s 在卡片底色上的对比度为 %s:1（实测值 ±0.05）', (_name, hex, expected) => {
    expect(contrastRatio(hex, SURFACE)).toBeCloseTo(expected, 1)
  })

  it('所有正文色都达到 WCAG AA（4.5:1）', () => {
    for (const [, hex] of cases) {
      expect(meetsAaText(hex, SURFACE)).toBe(true)
    }
  })

  it('交互控件描边达到 WCAG 1.4.11 的 3:1', () => {
    expect(contrastRatio('#6b57b5', SURFACE)).toBeGreaterThanOrEqual(3)
  })

  it('装饰性弱描边不满足 3:1（这正是它们只能用于分隔的原因）', () => {
    expect(contrastRatio('#241b3d', SURFACE)).toBeLessThan(3)
    expect(contrastRatio('#2f2450', SURFACE)).toBeLessThan(3)
  })
})

describe('relativeLuminance', () => {
  it('白色为 1，黑色为 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('接受 Rgb 对象', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
  })
})

describe('hexToSoft', () => {
  it('生成带透明度的 rgb 颜色', () => {
    expect(hexToSoft('#a78bfa', 12)).toBe('rgb(167 139 250 / 12%)')
  })

  it('非法色值返回 transparent', () => {
    expect(hexToSoft('nope')).toBe('transparent')
  })

  it('透明度被限制在 0~100', () => {
    expect(hexToSoft('#ffffff', 999)).toBe('rgb(255 255 255 / 100%)')
    expect(hexToSoft('#ffffff', -5)).toBe('rgb(255 255 255 / 0%)')
  })
})

/**
 * 卡片底色（v0.4.0 统一）。
 *
 * 工具卡片原先走 color-mix(accent 10%)、模块卡片走 hexToSoft(accent, 8)——
 * 两条路径两个浓度，并排看就是两种颜色（用户实测反馈）。
 * 现在两边都走 sideTint，浓度只有一个数字。
 */
describe('sideTint', () => {
  it('默认 10%——与工具卡片原本的浓度一致', () => {
    expect(sideTint('#a78bfa')).toBe('rgb(167 139 250 / 10%)')
  })

  it('与工具卡片、模块卡片共用同一个实现（不会各写一套）', () => {
    // 同一个输入，两边拿到的必须是同一个字符串
    expect(sideTint('#22d3ee')).toBe(hexToSoft('#22d3ee', 10))
  })

  it('非法色值退回 transparent，而不是抛错', () => {
    expect(sideTint('')).toBe('transparent')
    expect(sideTint('nope')).toBe('transparent')
  })
})

describe('shade', () => {
  it('正数变亮、负数变暗', () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0')
    expect(shade('#808080', -0.5)).toBe('#404040')
  })

  it('0 与非法 amount 都原样返回（不做无意义的取整往返）', () => {
    expect(shade('#a78bfa', 0)).toBe('#a78bfa')
    expect(shade('#a78bfa', Number.NaN)).toBe('#a78bfa')
  })

  it('非法色值原样返回，不静默变成黑色', () => {
    // 注意：'bad' 其实是合法的三位简写（#bbaadd），不能拿来当非法输入
    expect(shade('nope', 0.5)).toBe('nope')
    expect(shade('#12345', 0.5)).toBe('#12345')
    expect(shade('', 0.5)).toBe('')
  })

  it('结果始终落在合法范围内', () => {
    expect(shade('#ffffff', 1)).toBe('#ffffff')
    expect(shade('#000000', -1)).toBe('#000000')
  })
})

describe('readableTextOn', () => {
  it('深色底返回浅色字，浅色底返回深色字', () => {
    expect(readableTextOn('#150f26')).toBe('#f3effb')
    expect(readableTextOn('#f3effb')).toBe('#150f26')
  })

  it('选出的前景色对比度高于另一种选择', () => {
    for (const background of ['#a78bfa', '#22d3ee', '#fbbf24', '#34d399', '#4c1d95']) {
      const chosen = readableTextOn(background)
      const other = chosen === '#f3effb' ? '#150f26' : '#f3effb'
      expect(contrastRatio(chosen, background)).toBeGreaterThanOrEqual(
        contrastRatio(other, background),
      )
    }
  })
})

describe('toHex', () => {
  it('把 Rgb 转回十六进制', () => {
    expect(toHex({ r: 167, g: 139, b: 250 })).toBe('#a78bfa')
  })

  it('越界通道被截断', () => {
    expect(toHex({ r: 300, g: -20, b: 128 })).toBe('#ff0080')
  })
})
