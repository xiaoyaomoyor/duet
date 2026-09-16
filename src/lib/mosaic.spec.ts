/**
 * 马赛克占位图单测
 *
 * 这个模块被两个要求夹着：
 *   - "所有的 LOGO 都统一使用这个马赛克图片" → 不带 seed 时必须**逐字节稳定**
 *   - 它出现在导出长图 / 只读 HTML / 编辑视图三处 → 三处必须一致
 * 因此这里主要钉"确定性"，而不是像素长什么样。
 */
import { describe, expect, it } from 'vitest'
import { mosaicDataUri, mosaicSvg } from './mosaic'

describe('mosaicSvg', () => {
  it('产出合法的 SVG（有根元素与 viewBox）', () => {
    const svg = mosaicSvg()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('viewBox="0 0 64 64"')
  })

  it('**确定性**：同样参数永远得到同样的字符串', () => {
    // 这一条最重要——它保证"统一使用同一张马赛克图"，
    // 也保证导出稿与编辑视图逐像素一致
    expect(mosaicSvg()).toBe(mosaicSvg())
    expect(mosaicSvg({ cells: 8 })).toBe(mosaicSvg({ cells: 8 }))
  })

  it('格子数决定色块数量', () => {
    const count = (svg: string): number => (svg.match(/<rect/g) ?? []).length
    // 底色 1 块 + cells² 块
    expect(count(mosaicSvg({ cells: 4 }))).toBe(1 + 16)
    expect(count(mosaicSvg({ cells: 6 }))).toBe(1 + 36)
  })

  it('明暗两色都出现在图里（否则就是一块纯色，不像马赛克）', () => {
    const svg = mosaicSvg({ dark: '#111111', light: '#eeeeee' })
    expect(svg).toContain('#111111')
    expect(svg).toContain('#eeeeee')
  })

  it('不同 seed 得到不同图案（将来若要按工具区分，这条路是通的）', () => {
    expect(mosaicSvg({ seed: 'a' })).not.toBe(mosaicSvg({ seed: 'b' }))
  })

  it('极端格子数不崩', () => {
    expect(() => mosaicSvg({ cells: 1 })).not.toThrow()
    expect(() => mosaicSvg({ cells: 20 })).not.toThrow()
  })
})

describe('mosaicDataUri', () => {
  it('是可以直接塞进 <img src> 的 data URI', () => {
    const uri = mosaicDataUri()
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    // 必须被编码过，否则含 # 的色值会把 URL 截断
    expect(uri).not.toContain('#')
  })

  it('解码回来与源码一致（往返不丢字符）', () => {
    const uri = mosaicDataUri({ cells: 3 })
    const encoded = uri.slice('data:image/svg+xml;charset=utf-8,'.length)
    expect(decodeURIComponent(encoded)).toBe(mosaicSvg({ cells: 3 }))
  })
})
