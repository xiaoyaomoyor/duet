import { describe, expect, it } from 'vitest'
import {
  charCount,
  highlightSegments,
  initials,
  isBlank,
  normalizeForSearch,
  stripMediaExtension,
  truncate,
} from './text'

describe('stripMediaExtension', () => {
  it('去掉常见的媒体扩展名', () => {
    expect(stripMediaExtension('Song.mp3')).toBe('Song')
    expect(stripMediaExtension('take-01.WAV')).toBe('take-01')
    expect(stripMediaExtension('demo.flac')).toBe('demo')
    expect(stripMediaExtension('clip.m4a')).toBe('clip')
    expect(stripMediaExtension('shot.png')).toBe('shot')
  })

  it('只去掉**最后一个**扩展名', () => {
    expect(stripMediaExtension('a.b.flac')).toBe('a.b')
  })

  /*
   * 这条是防"砍过头"的：曲名里带小数的很常见（`Song 2.5`），
   * 2.5 不是扩展名，砍掉就成了另一个名字。
   */
  it('不把名字里的数字小数点当扩展名', () => {
    expect(stripMediaExtension('Song 2.5')).toBe('Song 2.5')
    expect(stripMediaExtension('v1.22')).toBe('v1.22')
  })

  it('没有扩展名时原样返回', () => {
    expect(stripMediaExtension('no-extension')).toBe('no-extension')
    expect(stripMediaExtension('中文曲名')).toBe('中文曲名')
  })

  it('过长或过短的后缀都不动', () => {
    // 6 位以上多半是名字的一部分（不是任何一种媒体扩展名）
    expect(stripMediaExtension('backup.backup')).toBe('backup.backup')
    // 单字符后缀不是媒体扩展名
    expect(stripMediaExtension('track.a')).toBe('track.a')
  })

  it('空串与纯空白返回空串（不抛错）', () => {
    expect(stripMediaExtension('')).toBe('')
    expect(stripMediaExtension('   ')).toBe('')
  })

  it('去掉首尾空白（文件名常带空格）', () => {
    expect(stripMediaExtension(' Song.mp3 ')).toBe('Song')
  })
})

describe('truncate', () => {
  it('未超长时原样返回', () => {
    expect(truncate('abc', 5)).toBe('abc')
    expect(truncate('abc', 3)).toBe('abc')
  })

  it('超长时截断并加省略号', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
  })

  it('按字符而非 UTF-16 码元计数（emoji 与中文安全）', () => {
    expect(truncate('🎵🎶🎼🎤', 3)).toBe('🎵🎶…')
  })

  it('max <= 0 返回空串', () => {
    expect(truncate('abc', 0)).toBe('')
    expect(truncate('abc', -1)).toBe('')
  })
})

describe('isBlank', () => {
  it('空白字符视为空', () => {
    expect(isBlank('')).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank('\n\t ')).toBe(true)
    expect(isBlank(null)).toBe(true)
    expect(isBlank(undefined)).toBe(true)
  })

  it('有实际内容时为 false', () => {
    expect(isBlank('0')).toBe(false) // 关键：'0' 是有效内容
    expect(isBlank('假')).toBe(false)
  })
})

describe('initials', () => {
  it('英文取单词首字母，最多两位', () => {
    expect(initials('Stable Diffusion')).toBe('SD')
    expect(initials('Suno')).toBe('SU')
  })

  it('中文取前两个字', () => {
    expect(initials('可灵')).toBe('可灵')
    expect(initials('海螺 AI')).toBe('海螺')
  })

  it('空名与纯符号有兜底', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})

describe('charCount', () => {
  it('忽略首尾空白', () => {
    expect(charCount('  abc  ')).toBe(3)
  })

  it('emoji 与中文按字符计', () => {
    expect(charCount('🎵🎶')).toBe(2)
    expect(charCount('歌词')).toBe(2)
  })
})

describe('normalizeForSearch', () => {
  it('去除空白与常见分隔符并小写', () => {
    expect(normalizeForSearch('GPT - So VITS')).toBe('gptsovits')
  })
})

describe('highlightSegments', () => {
  it('空查询返回单段且不命中', () => {
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }])
  })

  it('单个命中被正确切分', () => {
    expect(highlightSegments('Suno vs Lyria', 'vs')).toEqual([
      { text: 'Suno ', hit: false },
      { text: 'vs', hit: true },
      { text: ' Lyria', hit: false },
    ])
  })

  it('多个命中全部标记', () => {
    const segments = highlightSegments('aXbXc', 'x')
    expect(segments.filter((s) => s.hit)).toHaveLength(2)
  })

  it('无命中原样返回', () => {
    expect(highlightSegments('abc', 'z')).toEqual([{ text: 'abc', hit: false }])
  })
})
