/**
 * 行级文本对比（纯函数，零依赖）
 *
 * 为什么自己写：本项目只需要"并排显示两段代码/文案的差异"，
 * 不需要生成可应用的 patch。引入 diff 库会带来供应链与体积成本，
 * 而 LCS 本身只有几十行。
 *
 * 做法（经典的"剪枝 + LCS + 配对"三步）：
 *   ① 先剥掉公共前缀与后缀——真实对比里绝大部分行是相同的，
 *      剥掉之后 DP 的规模通常只剩几十行
 *   ② 对剩下的中段求最长公共子序列（DP）
 *   ③ 把"删除段 + 插入段"按位置配对成"修改行"，让并排视图左右对齐
 *
 * 规模保护：DP 是 O(n·m) 的，超限时退化为"整段替换"并标记 truncated。
 * 宁可告诉用户"差异太大，只显示为整体替换"，也不要卡死页面。
 */

export type DiffKind = 'equal' | 'change' | 'add' | 'remove'

/** 并排视图的一行：左右各自可能为空 */
export interface DiffRow {
  kind: DiffKind
  /** 左侧行号（1 起；该侧没有内容时为 null） */
  leftNo: number | null
  rightNo: number | null
  left: string | null
  right: string | null
}

export interface DiffResult {
  rows: DiffRow[]
  stats: { added: number; removed: number; unchanged: number }
  /** 规模超限、退化为整体替换时为 true */
  truncated: boolean
}

/** DP 单元上限：约 400 万格，实测在中端笔记本上 < 100ms */
export const MAX_DP_CELLS = 4_000_000

/** 归一化换行并切行（同时兼容 \r\n 与 \r） */
export function splitLines(input: string): string[] {
  if (input === '') return []
  return input.replace(/\r\n?/g, '\n').split('\n')
}

/**
 * 对比两段文本。
 * @returns 逐行对齐的结果（行号从 1 开始）
 */
export function diffLines(leftText: string, rightText: string): DiffResult {
  const left = splitLines(leftText)
  const right = splitLines(rightText)

  // ① 剥公共前缀
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1
  }

  // ① 剥公共后缀（不能与前缀重叠）
  let suffix = 0
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const leftMiddle = left.slice(prefix, left.length - suffix)
  const rightMiddle = right.slice(prefix, right.length - suffix)

  const rows: DiffRow[] = []

  // 公共前缀
  for (let i = 0; i < prefix; i += 1) {
    rows.push({
      kind: 'equal',
      leftNo: i + 1,
      rightNo: i + 1,
      left: left[i] ?? '',
      right: right[i] ?? '',
    })
  }

  // ② 中段
  let truncated = false
  if (leftMiddle.length === 0 && rightMiddle.length === 0) {
    // 完全相同，无需处理
  } else if (leftMiddle.length === 0) {
    pushRun(rows, 'add', [], rightMiddle, prefix, prefix)
  } else if (rightMiddle.length === 0) {
    pushRun(rows, 'remove', leftMiddle, [], prefix, prefix)
  } else if ((leftMiddle.length + 1) * (rightMiddle.length + 1) > MAX_DP_CELLS) {
    truncated = true
    pushRun(rows, 'change', leftMiddle, rightMiddle, prefix, prefix)
  } else {
    const ops = lcsOps(leftMiddle, rightMiddle, prefix, prefix)
    rows.push(...ops)
  }

  // 公共后缀
  const tailStart = left.length - suffix
  for (let i = 0; i < suffix; i += 1) {
    const leftIndex = tailStart + i
    const rightIndex = right.length - suffix + i
    rows.push({
      kind: 'equal',
      leftNo: leftIndex + 1,
      rightNo: rightIndex + 1,
      left: left[leftIndex] ?? '',
      right: right[rightIndex] ?? '',
    })
  }

  return { rows, stats: countStats(rows), truncated }
}

/**
 * LCS 动态规划 → 逐行差异。
 *
 * 方向约定：从右下角往左上角回溯，因此得到的是"从后往前"的序列，
 * 最后 reverse。这样写可以避免先构造整个 DP 表的方向矩阵。
 */
function lcsOps(a: string[], b: string[], aOffset: number, bOffset: number): DiffRow[] {
  const n = a.length
  const m = b.length

  // lengths[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const width = m + 1
  const lengths = new Uint32Array((n + 1) * width)

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const index = i * width + j
      if (a[i] === b[j]) {
        lengths[index] = (lengths[(i + 1) * width + (j + 1)] ?? 0) + 1
      } else {
        const down = lengths[(i + 1) * width + j] ?? 0
        const right = lengths[i * width + (j + 1)] ?? 0
        lengths[index] = down >= right ? down : right
      }
    }
  }

  // 回溯，产出中间序列（含 equal / del / ins 三种原子操作）
  type Op =
    | { kind: 'equal'; left: string; right: string; leftNo: number; rightNo: number }
    | { kind: 'del'; left: string; leftNo: number }
    | { kind: 'ins'; right: string; rightNo: number }

  const ops: Op[] = []
  let i = 0
  let j = 0

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({
        kind: 'equal',
        left: a[i] ?? '',
        right: b[j] ?? '',
        leftNo: aOffset + i + 1,
        rightNo: bOffset + j + 1,
      })
      i += 1
      j += 1
      continue
    }

    const down = lengths[(i + 1) * width + j] ?? 0
    const right = lengths[i * width + (j + 1)] ?? 0

    if (down >= right) {
      ops.push({ kind: 'del', left: a[i] ?? '', leftNo: aOffset + i + 1 })
      i += 1
    } else {
      ops.push({ kind: 'ins', right: b[j] ?? '', rightNo: bOffset + j + 1 })
      j += 1
    }
  }

  while (i < n) {
    ops.push({ kind: 'del', left: a[i] ?? '', leftNo: aOffset + i + 1 })
    i += 1
  }
  while (j < m) {
    ops.push({ kind: 'ins', right: b[j] ?? '', rightNo: bOffset + j + 1 })
    j += 1
  }

  return pairOps(ops)
}

/**
 * 把原子操作配对成并排的行。
 *
 * 关键点：一段连续的"删除"紧跟一段连续的"插入"时按位置配对成 change 行，
 * 这样并排视图左右才会对齐（否则左边一大块、右边一大块，读者得自己数行）。
 */
function pairOps(
  ops: Array<
    | { kind: 'equal'; left: string; right: string; leftNo: number; rightNo: number }
    | { kind: 'del'; left: string; leftNo: number }
    | { kind: 'ins'; right: string; rightNo: number }
  >,
): DiffRow[] {
  const rows: DiffRow[] = []
  let index = 0

  while (index < ops.length) {
    const op = ops[index]
    if (!op) break

    if (op.kind === 'equal') {
      rows.push({
        kind: 'equal',
        leftNo: op.leftNo,
        rightNo: op.rightNo,
        left: op.left,
        right: op.right,
      })
      index += 1
      continue
    }

    // 收集连续的 del 与 ins
    const dels: Array<{ left: string; leftNo: number }> = []
    const inss: Array<{ right: string; rightNo: number }> = []

    while (index < ops.length && ops[index]?.kind === 'del') {
      const current = ops[index] as { kind: 'del'; left: string; leftNo: number }
      dels.push({ left: current.left, leftNo: current.leftNo })
      index += 1
    }
    while (index < ops.length && ops[index]?.kind === 'ins') {
      const current = ops[index] as { kind: 'ins'; right: string; rightNo: number }
      inss.push({ right: current.right, rightNo: current.rightNo })
      index += 1
    }

    const paired = Math.min(dels.length, inss.length)
    for (let k = 0; k < paired; k += 1) {
      rows.push({
        kind: 'change',
        leftNo: dels[k]?.leftNo ?? null,
        rightNo: inss[k]?.rightNo ?? null,
        left: dels[k]?.left ?? '',
        right: inss[k]?.right ?? '',
      })
    }
    for (let k = paired; k < dels.length; k += 1) {
      rows.push({
        kind: 'remove',
        leftNo: dels[k]?.leftNo ?? null,
        rightNo: null,
        left: dels[k]?.left ?? '',
        right: null,
      })
    }
    for (let k = paired; k < inss.length; k += 1) {
      rows.push({
        kind: 'add',
        leftNo: null,
        rightNo: inss[k]?.rightNo ?? null,
        left: null,
        right: inss[k]?.right ?? '',
      })
    }
  }

  return rows
}

/** 整段替换（用于退化路径与"一侧为空"的简单情形） */
function pushRun(
  rows: DiffRow[],
  kind: 'add' | 'remove' | 'change',
  a: string[],
  b: string[],
  aOffset: number,
  bOffset: number,
): void {
  if (kind === 'add') {
    for (const [k, line] of b.entries()) {
      rows.push({ kind: 'add', leftNo: null, rightNo: bOffset + k + 1, left: null, right: line })
    }
    return
  }
  if (kind === 'remove') {
    for (const [k, line] of a.entries()) {
      rows.push({ kind: 'remove', leftNo: aOffset + k + 1, rightNo: null, left: line, right: null })
    }
    return
  }

  const length = Math.max(a.length, b.length)
  for (let k = 0; k < length; k += 1) {
    const left = a[k]
    const right = b[k]
    rows.push({
      kind: left === right ? 'equal' : 'change',
      leftNo: left === undefined ? null : aOffset + k + 1,
      rightNo: right === undefined ? null : bOffset + k + 1,
      left: left ?? null,
      right: right ?? null,
    })
  }
}

function countStats(rows: DiffRow[]): DiffResult['stats'] {
  let added = 0
  let removed = 0
  let unchanged = 0

  for (const row of rows) {
    if (row.kind === 'equal') unchanged += 1
    else if (row.kind === 'add') added += 1
    else if (row.kind === 'remove') removed += 1
    else {
      // change 行左右各算一次
      added += 1
      removed += 1
    }
  }

  return { added, removed, unchanged }
}

/** 差异摘要文案（"3 增 2 删"），供 UI 展示 */
export function describeDiff(stats: DiffResult['stats']): { added: number; removed: number } {
  return { added: stats.added, removed: stats.removed }
}
