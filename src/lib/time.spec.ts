import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatDurationLong,
  formatDurationMs,
  formatRelative,
  secondsToMs,
} from './time'

describe('formatDuration', () => {
  it('毫秒转 mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(3_599_000)).toBe('59:59')
  })

  it('非法与负数输入不会崩', () => {
    expect(formatDuration(-1)).toBe('00:00')
    expect(formatDuration(Number.NaN)).toBe('00:00')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('00:00')
  })
})

describe('formatDurationMs', () => {
  it('带三位毫秒（音频对比需要毫秒级）', () => {
    expect(formatDurationMs(65_123)).toBe('01:05.123')
    expect(formatDurationMs(1_007)).toBe('00:01.007')
  })
})

describe('formatDurationLong', () => {
  it('不足一小时退回 mm:ss', () => {
    expect(formatDurationLong(65_000)).toBe('01:05')
  })

  it('超过一小时带小时位', () => {
    expect(formatDurationLong(3_725_000)).toBe('1:02:05')
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-09-15T12:00:00Z').getTime()

  it('一分钟内为"刚刚"', () => {
    expect(formatRelative(now - 5_000, now)).toBe('刚刚')
  })

  it('分钟与小时级', () => {
    expect(formatRelative(now - 3 * 60_000, now)).toBe('3 分钟前')
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe('2 小时前')
  })

  it('昨天与天数', () => {
    expect(formatRelative(now - 25 * 3_600_000, now)).toBe('昨天')
    expect(formatRelative(now - 3 * 86_400_000, now)).toBe('3 天前')
  })

  it('超过 7 天显示日期', () => {
    expect(formatRelative(now - 30 * 86_400_000, now)).toBe(formatDate(now - 30 * 86_400_000))
  })

  it('英文语境', () => {
    expect(formatRelative(now - 5_000, now, 'en-US')).toBe('just now')
    expect(formatRelative(now - 3 * 60_000, now, 'en-US')).toBe('3 min ago')
  })

  it('未来时间退回日期而非负数', () => {
    expect(formatRelative(now + 60_000, now)).toBe(formatDate(now + 60_000))
  })
})

describe('formatDateTime', () => {
  it('输出 YYYY-MM-DD HH:mm', () => {
    const ts = new Date(2026, 8, 15, 9, 5).getTime() // 本地时间 2026-09-15 09:05
    expect(formatDateTime(ts)).toBe('2026-09-15 09:05')
  })

  it('非法时间戳返回空串', () => {
    expect(formatDate(Number.NaN)).toBe('')
    expect(formatDateTime(Number.NaN)).toBe('')
  })
})

describe('secondsToMs', () => {
  it('秒转毫秒，负数归零', () => {
    expect(secondsToMs(1.5)).toBe(1500)
    expect(secondsToMs(-3)).toBe(0)
  })
})
