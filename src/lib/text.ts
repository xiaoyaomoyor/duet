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

/**
 * 去掉媒体文件名末尾的扩展名（v0.4.5）。
 *
 * 用户的原话是"不需要显示媒体与扩展名，比如 xxx.mp3"——
 * `.mp3` 这类后缀是文件系统的东西，不是内容的一部分，
 * 出现在对比页上只会让人觉得没做完。
 *
 * 只剥掉**最后一个点之后、以字母开头、共 2~5 位**的字母数字后缀：
 *   `Song.mp3`    → `Song`
 *   `a.b.flac`    → `a.b`
 *   `Song 2.5`    → `Song 2.5`（以数字开头，是版本号不是扩展名）
 *   `v1.22`       → `v1.22`（同上）
 *   `no-extension`→ 原样
 *
 * 为什么要求"以字母开头"：真实的媒体扩展名无一例外都是字母开头
 * （mp3 / wav / flac / m4a / png / jpeg / webp…），而曲名里的 `.5`、`.22`
 * 几乎总是版本号。第一版没加这条，`v1.22` 被砍成了 `v1`——测试当场抓到。
 */
export function stripMediaExtension(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.[a-z][a-z0-9]{1,4}$/i, '')
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
