/**
 * LRC 歌词解析（纯函数）
 *
 * 支持的格式：
 *   [00:12.34] 第一行歌词
 *   [00:12.340]带毫秒三位
 *   [ar:艺术家] / [ti:标题] 等元信息行会被忽略
 *   一行多个时间戳：[00:01.00][00:31.00]重复段
 *
 * 设计原则：
 *   - 解析失败**不抛异常**，无法识别的时间戳按普通文本处理
 *   - 输出按时间升序排序，渲染层可直接顺序消费
 */

export interface LrcLine {
  /** 起始时间（毫秒） */
  timeMs: number
  text: string
}

export interface LrcParseResult {
  lines: LrcLine[]
  /** 是否含时间轴：决定歌词能否与音频同步（§13.3） */
  timed: boolean
  /** 无法识别的元信息标签，保留供排查 */
  meta: Record<string, string>
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META_TAG = /^\[(ar|ti|al|by|offset|re|ve|length):(.*)\]$/i

/** 解析 LRC 文本 */
export function parseLrc(input: string): LrcParseResult {
  const lines: LrcLine[] = []
  const meta: Record<string, string> = {}
  let timed = false

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const metaMatch = META_TAG.exec(line)
    if (metaMatch) {
      meta[metaMatch[1]!.toLowerCase()] = (metaMatch[2] ?? '').trim()
      continue
    }

    // 收集该行所有时间标签
    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIME_TAG.exec(line)) !== null) {
      stamps.push(toMs(match[1] ?? '0', match[2] ?? '0', match[3]))
    }

    // 去掉时间标签后的正文
    const text = line.replace(TIME_TAG, '').trim()

    if (stamps.length === 0) {
      // 无时间轴的纯文本行：保留，但 timed 仍为 false
      if (text) lines.push({ timeMs: -1, text })
      continue
    }

    timed = true
    for (const timeMs of stamps) {
      // 纯音乐占位（如 [00:10.00] 后无文字）也要保留，否则同步会跳行
      lines.push({ timeMs, text: text || '♪' })
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs)
  return { lines, timed, meta }
}

/**
 * 是否为带时间轴的歌词文本。
 * 编辑器用它给出"已识别 N 行时间轴"的即时反馈。
 */
export function isLrc(input: string): boolean {
  return parseLrc(input).timed
}

/** 纯文本歌词 → 行数组（无时间轴） */
export function plainLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * 按当前播放时间定位歌词行。
 * 返回索引；早于第一行时返回 -1（用于"还没开始唱"的高亮逻辑）。
 */
export function findActiveLine(lines: readonly LrcLine[], currentMs: number): number {
  if (lines.length === 0) return -1

  let low = 0
  let high = lines.length - 1
  let result = -1

  while (low <= high) {
    const mid = (low + high) >> 1
    const line = lines[mid]
    if (!line) break

    if (line.timeMs <= currentMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

/**
 * 无时间轴时的估算同步（§13.3）：
 * 按行数均分总时长，并在 UI 上标注"估算同步"，避免用户误以为是精确同步。
 */
export function estimateLineDuration(totalMs: number, lineCount: number): number {
  if (lineCount <= 0) return 0
  return Math.max(500, Math.floor(totalMs / lineCount))
}

function toMs(minutes: string, seconds: string, fraction?: string): number {
  const min = Number.parseInt(minutes, 10) || 0
  const sec = Number.parseInt(seconds, 10) || 0
  const fracRaw = fraction ?? '0'
  // 1 位=十分之一秒，2 位=百分之一秒，3 位=毫秒
  const frac = Number.parseInt(fracRaw.padEnd(3, '0'), 10) || 0
  return min * 60_000 + sec * 1000 + frac
}
