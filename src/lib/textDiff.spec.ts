/**
 * 行级文本对比单测（纯函数）
 *
 * 对比算法的坑集中在三处，本文件按这三处组织：
 *   1. 公共前后缀的剪枝边界（重叠会丢行）
 *   2. 删除段与插入段的配对（不配对就没法并排看）
 *   3. 退化路径（超大输入不能卡死页面）
 */
import { describe, expect, it } from 'vitest'
import { diffLines, MAX_DP_CELLS, splitLines } from './textDiff'

function kinds(left: string, right: string): string[] {
  return diffLines(left, right).rows.map((row) => row.kind)
}

describe('splitLines', () => {
  it('空串得到零行（而不是一个空行）', () => {
    expect(splitLines('')).toEqual([])
  })

  it('兼容 LF / CRLF / CR', () => {
    expect(splitLines('a\nb')).toEqual(['a', 'b'])
    expect(splitLines('a\r\nb')).toEqual(['a', 'b'])
    expect(splitLines('a\rb')).toEqual(['a', 'b'])
  })

  it('保留末尾空行（否则最后一行会被悄悄吞掉）', () => {
    expect(splitLines('a\n')).toEqual(['a', ''])
  })
})

describe('diffLines —— 相同内容', () => {
  it('完全相同：全部 equal、无增删', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc')
    expect(result.rows.every((row) => row.kind === 'equal')).toBe(true)
    expect(result.stats).toEqual({ added: 0, removed: 0, unchanged: 3 })
    expect(result.truncated).toBe(false)
  })

  it('两侧都为空', () => {
    const result = diffLines('', '')
    expect(result.rows).toEqual([])
    expect(result.stats).toEqual({ added: 0, removed: 0, unchanged: 0 })
  })

  it('行号从 1 开始且逐行递增', () => {
    const result = diffLines('a\nb', 'a\nb')
    expect(result.rows.map((row) => row.leftNo)).toEqual([1, 2])
    expect(result.rows.map((row) => row.rightNo)).toEqual([1, 2])
  })
})

describe('diffLines —— 纯新增 / 纯删除', () => {
  it('右侧多出内容 → add 行，左侧为 null', () => {
    const result = diffLines('a\nb', 'a\nb\nc')
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'equal', 'add'])
    expect(result.rows[2]?.left).toBeNull()
    expect(result.rows[2]?.right).toBe('c')
    expect(result.rows[2]?.rightNo).toBe(3)
    expect(result.stats).toEqual({ added: 1, removed: 0, unchanged: 2 })
  })

  it('左侧多出内容 → remove 行，右侧为 null', () => {
    const result = diffLines('a\nb\nc', 'a\nb')
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'equal', 'remove'])
    expect(result.rows[2]?.right).toBeNull()
    expect(result.rows[2]?.left).toBe('c')
    expect(result.stats).toEqual({ added: 0, removed: 1, unchanged: 2 })
  })

  it('左侧为空 → 全部是 add', () => {
    const result = diffLines('', 'x\ny')
    expect(result.rows.map((row) => row.kind)).toEqual(['add', 'add'])
    expect(result.stats).toEqual({ added: 2, removed: 0, unchanged: 0 })
  })

  it('右侧为空 → 全部是 remove', () => {
    const result = diffLines('x\ny', '')
    expect(result.rows.map((row) => row.kind)).toEqual(['remove', 'remove'])
    expect(result.stats).toEqual({ added: 0, removed: 2, unchanged: 0 })
  })

  it('在开头插入', () => {
    const result = diffLines('b\nc', 'a\nb\nc')
    expect(result.rows[0]?.kind).toBe('add')
    expect(result.rows[0]?.right).toBe('a')
    expect(result.rows[1]?.kind).toBe('equal')
    // 行号必须反映真实位置：b 在两侧都是第 2 行
    expect(result.rows[1]?.leftNo).toBe(1)
    expect(result.rows[1]?.rightNo).toBe(2)
  })

  it('在末尾插入', () => {
    const result = diffLines('a\nb', 'a\nb\nc')
    expect(result.rows[2]?.kind).toBe('add')
  })
})

describe('diffLines —— 修改配对', () => {
  it('等量的替换配成 change 行（左右对齐）', () => {
    const result = diffLines('a\n旧\nc', 'a\n新\nc')
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'change', 'equal'])
    const changed = result.rows[1]
    expect(changed?.left).toBe('旧')
    expect(changed?.right).toBe('新')
    expect(changed?.leftNo).toBe(2)
    expect(changed?.rightNo).toBe(2)
  })

  it('不等量的替换：先配对，多出来的单独成行', () => {
    // 左边 2 行换成右边 1 行
    const result = diffLines('a\n旧1\n旧2\nz', 'a\n新\nz')
    expect(kinds('a\n旧1\n旧2\nz', 'a\n新\nz')).toEqual([
      'equal',
      'change',
      'remove',
      'equal',
    ])
    expect(result.rows[1]?.right).toBe('新')
    expect(result.rows[2]?.left).toBe('旧2')
    expect(result.rows[2]?.right).toBeNull()
  })

  it('左边 1 行换成右边 2 行', () => {
    expect(kinds('a\n旧\nz', 'a\n新1\n新2\nz')).toEqual(['equal', 'change', 'add', 'equal'])
  })

  it('change 行的统计里左右各算一次', () => {
    const result = diffLines('a\n旧\nc', 'a\n新\nc')
    expect(result.stats).toEqual({ added: 1, removed: 1, unchanged: 2 })
  })

  it('并排结果的左右两侧都完整保留了原文（不丢行）', () => {
    const left = '一\n二\n三\n四\n五'
    const right = '一\n二改\n三\n四\n五\n六'
    const result = diffLines(left, right)

    expect(result.rows.map((row) => row.left).filter((v) => v !== null)).toEqual([
      '一',
      '二',
      '三',
      '四',
      '五',
    ])
    expect(result.rows.map((row) => row.right).filter((v) => v !== null)).toEqual([
      '一',
      '二改',
      '三',
      '四',
      '五',
      '六',
    ])
  })
})

describe('diffLines —— 剪枝边界', () => {
  it('前后都有公共行时，中间差异照常识别', () => {
    const left = '头\nA\nB\n尾'
    const right = '头\nA2\nB\n尾'
    const result = diffLines(left, right)
    expect(result.rows.map((row) => row.kind)).toEqual(['equal', 'change', 'equal', 'equal'])
  })

  it('公共前后缀不重叠（只有一行且相同）', () => {
    const result = diffLines('同一行', '同一行')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.kind).toBe('equal')
  })

  it('只有一行且不同', () => {
    const result = diffLines('左', '右')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.kind).toBe('change')
  })

  it('重复行不会被剪枝吃掉（重复内容是 LCS 的经典陷阱）', () => {
    const left = 'a\na\na'
    const right = 'a\na'
    const result = diffLines(left, right)
    expect(result.stats.removed).toBe(1)
    expect(result.stats.unchanged).toBe(2)
    expect(result.rows.filter((row) => row.left !== null)).toHaveLength(3)
    expect(result.rows.filter((row) => row.right !== null)).toHaveLength(2)
  })

  it('全部行都不同时不会丢内容', () => {
    const left = '1\n2\n3'
    const right = '4\n5\n6'
    const result = diffLines(left, right)
    expect(result.rows.filter((row) => row.left !== null).map((row) => row.left)).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(result.rows.filter((row) => row.right !== null).map((row) => row.right)).toEqual([
      '4',
      '5',
      '6',
    ])
  })

  it('行号始终指向原文的真实位置', () => {
    const result = diffLines('只\n在\n左', '只\n在\n右')
    const lastRow = result.rows[result.rows.length - 1]
    expect(lastRow?.leftNo).toBe(3)
    expect(lastRow?.rightNo).toBe(3)
  })
})

describe('diffLines —— 规模保护', () => {
  it('超大输入退化为整段替换并标记 truncated（不卡死页面）', () => {
    const side = Math.ceil(Math.sqrt(MAX_DP_CELLS)) + 10
    const left = Array.from({ length: side }, (_v, i) => `L${i}`).join('\n')
    const right = Array.from({ length: side }, (_v, i) => `R${i}`).join('\n')

    const result = diffLines(left, right)
    expect(result.truncated).toBe(true)
    // 退化路径也必须保留全部内容
    expect(result.rows.filter((row) => row.left !== null)).toHaveLength(side)
    expect(result.rows.filter((row) => row.right !== null)).toHaveLength(side)
  })

  it('剥掉公共前后缀后即使原始输入很大也能精确对比', () => {
    // 5000 行里只有 1 行不同：剪枝后 DP 规模为 1，不会触发退化
    const body = Array.from({ length: 5000 }, (_v, i) => `行 ${i}`)
    const left = body.join('\n')
    const right = [...body.slice(0, 2500), '改过的一行', ...body.slice(2501)].join('\n')

    const result = diffLines(left, right)
    expect(result.truncated).toBe(false)
    expect(result.stats).toEqual({ added: 1, removed: 1, unchanged: 4999 })
  })

  it('正常规模的输入不会误判为 truncated', () => {
    const left = Array.from({ length: 200 }, (_v, i) => `a${i}`).join('\n')
    const right = Array.from({ length: 200 }, (_v, i) => `b${i}`).join('\n')
    expect(diffLines(left, right).truncated).toBe(false)
  })
})

describe('diffLines —— 辅助断言', () => {
  it('把两侧投影回去正好还原两份原文（并排视图的"不丢内容"不变量）', () => {
    const cases: Array<[string, string]> = [
      ['a\nb', 'a\nc'],
      ['一\n二\n三', '一\n三'],
      ['', 'x\ny'],
      ['x\ny', ''],
      ['头\nA\nB\n尾', '头\nA2\nB\n尾'],
      ['a\na\na', 'a\na'],
      ['1\n2\n3', '4\n5\n6'],
      ['同\n结尾', '同\n结尾'],
    ]

    for (const [left, right] of cases) {
      const rows = diffLines(left, right).rows
      expect(rows.map((row) => row.left).filter((v) => v !== null), `左：${left}`).toEqual(
        splitLines(left),
      )
      expect(rows.map((row) => row.right).filter((v) => v !== null), `右：${right}`).toEqual(
        splitLines(right),
      )
    }
  })

  it('两侧非空的列数一致（并排对齐的前提）', () => {
    const rows = diffLines('一\n二\n三\n四', '一\n二改\n四\n五').rows
    expect(rows.filter((row) => row.left !== null)).toHaveLength(4)
    expect(rows.filter((row) => row.right !== null)).toHaveLength(4)
  })

  it('不修改入参（纯函数）', () => {
    const left = 'a\nb'
    diffLines(left, 'a\nc')
    expect(left).toBe('a\nb')
  })
})
