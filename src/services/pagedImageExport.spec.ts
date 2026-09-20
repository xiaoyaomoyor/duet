import { describe, expect, it } from 'vitest'
import { planImagePages } from './pagedImageExport'
import { externalMediaCount } from './projectBundle'
describe('R5 pagination and offline boundaries', () => {
  it('keeps scene boundaries and covers the report without gaps', () => {
    expect(planImagePages(8500, 4000, [1000, 3500, 6000])).toEqual([
      { start: 0, height: 3500 },
      { start: 3500, height: 2500 },
      { start: 6000, height: 2500 },
    ])
    const pages = planImagePages(19000, 4000)
    expect(pages.every((p) => p.height <= 4000)).toBe(true)
    expect(pages.reduce((n, p) => n + p.height, 0)).toBe(19000)
    expect(pages.at(-1)).toEqual({ start: 16000, height: 3000 })
  })
  it('limits page count and rejects invalid dimensions', () => {
    expect(() => planImagePages(500000, 4000)).toThrow('40 页')
    expect(() => planImagePages(10, 0)).toThrow()
  })
  it('moves a long-scene cut above text lines without losing pixels', () => {
    expect(
      planImagePages(
        700,
        400,
        [],
        [
          { top: 390, bottom: 412 },
          { top: 385, bottom: 405 },
        ],
      ),
    ).toEqual([
      { start: 0, height: 385 },
      { start: 385, height: 315 },
    ])
  })
  it('counts relative media and embedded pages once, excluding ordinary links', () => {
    expect(
      externalMediaCount([
        { sourceUrl: '/music.wav' },
        { sourceUrl: '/music.wav' },
        { type: 'iframe', data: { url: 'https://example.com' } },
        { type: 'link', data: { url: 'https://link.test' } },
      ]),
    ).toBe(2)
  })
  it('distinguishes playable externals from provenance and local media', () => {
    expect(
      externalMediaCount({
        origin: { url: 'https://example.com' },
        assetId: 'local',
        sourceUrl: 'https://original.com',
        cover: { kind: 'asset', assetId: 'cover' },
      }),
    ).toBe(0)
    expect(
      externalMediaCount([
        { sourceUrl: 'https://audio.test/a' },
        { cover: { kind: 'url', url: 'https://image.test/x' } },
        { sourceUrl: 'data:audio/wav;base64,a' },
        { sourceUrl: 'blob:expired' },
      ]),
    ).toBe(3)
  })
})
