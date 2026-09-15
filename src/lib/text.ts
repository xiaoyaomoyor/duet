/**
 * 文本工具（纯函数）
 */

/** 安全截断，超出部分以省略号收尾 */
export function truncate(input: string, max: number, ellipsis = '…'): string {
  if (max <= 0) return ''
  const chars = Array.from(input)
  if (chars.length <= max) return input
  return chars.slice(0, Math.max(0, max - ellipsis.length)).join('') + ellipsis
}

/** 输入是否算"未填写"（空白字符视为空） */
export function isBlank(input: string | null | undefined): boolean {
  return input == null || input.trim() === ''
}

/** 取名称首字，用于程序化图标（中文取第一个字，英文取首字母，最多 2 个字符） */
export function initials(name: string, max = 2): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'

  const chars = Array.from(trimmed)
  const first = chars[0] ?? '?'

  // 纯 ASCII 字母/数字：优先取每个单词首字母
  if (/^[\x20-\x7e]+$/.test(trimmed)) {
    const words = trimmed.split(/[\s\-_·.]+/).filter(Boolean)
    if (words.length >= 2) {
      return words
        .slice(0, max)
        .map((w) => (w[0] ?? '').toUpperCase())
        .join('')
    }
    return trimmed.slice(0, max).toUpperCase()
  }

  // 中日韩：取前 max 个字
  return chars.slice(0, max).join('') || first
}

/** 统计字数（按字符计，忽略首尾空白） */
export function charCount(input: string): number {
  return Array.from(input.trim()).length
}

/** 生成用于搜索匹配的归一化键：小写、去空白与常见分隔符 */
export function normalizeForSearch(input: string): string {
  return input.toLowerCase().replace(/[\s\-_·.]+/g, '')
}

/** 简单的高亮片段切分：返回 [{text, hit}] 数组，供搜索结果渲染使用 */
export function highlightSegments(
  source: string,
  query: string,
): Array<{ text: string; hit: boolean }> {
  const q = query.trim()
  if (!q) return [{ text: source, hit: false }]

  const lowerSource = source.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const segments: Array<{ text: string; hit: boolean }> = []

  let cursor = 0
  let index = lowerSource.indexOf(lowerQuery, cursor)

  while (index !== -1) {
    if (index > cursor) {
      segments.push({ text: source.slice(cursor, index), hit: false })
    }
    segments.push({ text: source.slice(index, index + q.length), hit: true })
    cursor = index + q.length
    index = lowerSource.indexOf(lowerQuery, cursor)
  }

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), hit: false })
  }

  return segments.length > 0 ? segments : [{ text: source, hit: false }]
}
