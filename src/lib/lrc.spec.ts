/**
 * 歌词解析单测（纯函数）
 *
 * 这是音乐对比场景的核心解析器：LRC 的容错能力直接决定
 * 用户能不能顺利导入自己手上的歌词文件。
 */
import { describe, expect, it } from 'vitest'
import { estimateLineDuration, findActiveLine, isLrc, parseLrc, plainLines } from './lrc'

describe('parseLrc', () => {
  it('解析标准 LRC（两位小数）', () => {
    const result = parseLrc('[00:12.34]第一行\n[00:15.00]第二行')
    expect(result.timed).toBe(true)
    expect(result.lines).toEqual([
      { timeMs: 12_340, text: '第一行' },
      { timeMs: 15_000, text: '第二行' },
    ])
  })

  it('解析三位毫秒', () => {
    const result = parseLrc('[00:01.007]精确到毫秒')
    expect(result.lines[0]?.timeMs).toBe(1007)
  })

  it('解析一位小数（十分之一秒）', () => {
    const result = parseLrc('[01:02.5]半秒')
    expect(result.lines[0]?.timeMs).toBe(62_500)
  })

  it('一行多个时间戳会展开为多行', () => {
    const result = parseLrc('[00:01.00][00:31.00]副歌')
    expect(result.lines).toHaveLength(2)
    expect(result.lines.map((line) => line.text)).toEqual(['副歌', '副歌'])
    expect(result.lines[0]?.timeMs).toBe(1000)
    expect(result.lines[1]?.timeMs).toBe(31_000)
  })

  it('识别并收集元信息标签', () => {
    const result = parseLrc('[ar:某歌手]\n[ti:某歌名]\n[00:01.00]正文')
    expect(result.meta).toEqual({ ar: '某歌手', ti: '某歌名' })
    expect(result.lines).toHaveLength(1)
  })

  it('无时间戳的纯文本行被保留，但 timed 为 false', () => {
    const result = parseLrc('第一行\n第二行')
    expect(result.timed).toBe(false)
    expect(result.lines.map((line) => line.text)).toEqual(['第一行', '第二行'])
    expect(result.lines.every((line) => line.timeMs === -1)).toBe(true)
  })

  it('只有时间戳没有文字时填入 ♪（纯音乐段落不能被跳过）', () => {
    const result = parseLrc('[00:10.00]\n[00:20.00]有人声')
    expect(result.lines[0]?.text).toBe('♪')
    expect(result.lines[1]?.text).toBe('有人声')
  })

  it('输出按时间升序排列', () => {
    const result = parseLrc('[00:30.00]后\n[00:10.00]前')
    expect(result.lines.map((line) => line.text)).toEqual(['前', '后'])
  })

  it('空文本与空白行不产生内容', () => {
    expect(parseLrc('').lines).toEqual([])
    expect(parseLrc('\n\n   \n').lines).toEqual([])
    expect(parseLrc('').timed).toBe(false)
  })

  it('CRLF 换行同样可解析', () => {
    const result = parseLrc('[00:01.00]甲\r\n[00:02.00]乙')
    expect(result.lines).toHaveLength(2)
  })

  it('异常格式不会抛异常（容错优先）', () => {
    expect(() => parseLrc('[abc]怪东西\n[[[00:xx]]]\n[99:99.999]越界')).not.toThrow()
  })
})

describe('isLrc', () => {
  it('有时间轴为 true，纯文本为 false', () => {
    expect(isLrc('[00:01.00]x')).toBe(true)
    expect(isLrc('只是普通文本')).toBe(false)
  })
})

describe('plainLines', () => {
  it('按行切分并去掉空白行', () => {
    expect(plainLines(' 甲 \n\n乙\n   \n丙 ')).toEqual(['甲', '乙', '丙'])
  })
})

describe('findActiveLine', () => {
  const lines = [
    { timeMs: 1000, text: 'a' },
    { timeMs: 3000, text: 'b' },
    { timeMs: 5000, text: 'c' },
  ]

  it('找到当前时间对应的行', () => {
    expect(findActiveLine(lines, 0)).toBe(-1)
    expect(findActiveLine(lines, 1000)).toBe(0)
    expect(findActiveLine(lines, 2999)).toBe(0)
    expect(findActiveLine(lines, 3000)).toBe(1)
    expect(findActiveLine(lines, 9999)).toBe(2)
  })

  it('空数组返回 -1', () => {
    expect(findActiveLine([], 5000)).toBe(-1)
  })
})

describe('estimateLineDuration', () => {
  it('按行数均分总时长', () => {
    expect(estimateLineDuration(120_000, 40)).toBe(3000)
  })

  it('行数为 0 时返回 0', () => {
    expect(estimateLineDuration(120_000, 0)).toBe(0)
  })

  it('结果不低于 500ms（避免高亮闪烁过快）', () => {
    expect(estimateLineDuration(1000, 100)).toBe(500)
  })
})
