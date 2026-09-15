/**
 * 时间工具（纯函数）
 */

/** 毫秒 → "mm:ss" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${pad(minutes)}:${pad(seconds)}`
}

/** 毫秒 → "mm:ss.mmm"，音频对比场景需要毫秒级 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00.000'
  const base = formatDuration(ms)
  const millis = Math.floor(ms % 1000)
  return `${base}.${String(millis).padStart(3, '0')}`
}

/** 毫秒 → "h:mm:ss"（超过 1 小时时使用） */
export function formatDurationLong(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  if (hours === 0) return formatDuration(ms)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

/** 相对时间："刚刚 / 3 分钟前 / 昨天 / 2026-09-15" */
export function formatRelative(
  timestamp: number,
  now = Date.now(),
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  const diff = now - timestamp
  if (!Number.isFinite(diff)) return ''

  const zh = locale === 'zh-CN'
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < 0) return formatDate(timestamp, locale)
  if (diff < minute) return zh ? '刚刚' : 'just now'
  if (diff < hour) {
    const n = Math.floor(diff / minute)
    return zh ? `${n} 分钟前` : `${n} min ago`
  }
  if (diff < day) {
    const n = Math.floor(diff / hour)
    return zh ? `${n} 小时前` : `${n} h ago`
  }
  if (diff < 2 * day) return zh ? '昨天' : 'yesterday'
  if (diff < 7 * day) {
    const n = Math.floor(diff / day)
    return zh ? `${n} 天前` : `${n} d ago`
  }
  return formatDate(timestamp, locale)
}

/** "YYYY-MM-DD" */
export function formatDate(timestamp: number, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  return locale === 'zh-CN' ? `${y}-${m}-${day}` : `${y}-${m}-${day}`
}

/** "YYYY-MM-DD HH:mm" */
export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDate(timestamp)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 秒 → 毫秒，负数归零 */
export function secondsToMs(seconds: number): number {
  return Math.max(0, seconds) * 1000
}

function pad(value: number): string {
  return String(Math.floor(value)).padStart(2, '0')
}
