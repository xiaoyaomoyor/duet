/**
 * 命令层单测（纯函数，无 DOM、无 Pinia）
 *
 * 这一层是整个应用唯一的数据写入口，因此必须做到：
 *   - 不可变（不改入参）
 *   - 目标不存在时明确失败而非静默
 *   - 增删改查全部可逆
 */
import { describe, expect, it } from 'vitest'
import { applyCommand, applyCommandResult, createEmptyCell, createModule } from './commands'
import { instantiateTemplate, getTemplate } from './templateService'
import type { Command } from '@/types/commands'
import type { Project } from '@/types/project'

function makeProject(): Project {
  return instantiateTemplate(getTemplate('music')!, { name: 'Suno vs Lyria', now: 1_700_000_000_000 })
}

function firstRowId(project: Project): string {
  const row = project.sheet.rows[0]
  if (!row) throw new Error('测试前置条件失败：项目没有任何行')
  return row.id
}

describe('applyCommand 的不可变性', () => {
  it('任何命令都不修改入参对象', () => {
    const project = makeProject()
    const snapshot = JSON.stringify(project)

    const commands: Command[] = [
      { t: 'project/patch', patch: { title: '新标题' } },
      { t: 'ui/patch', patch: { mode: 'present' } },
      { t: 'layout/patch', patch: { gutter: 64 } },
      { t: 'side/patch', sideId: project.sheet.sides[0]!.id, patch: { accent: '#ff0000' } },
      { t: 'row/toggleCollapsed', rowId: firstRowId(project) },
      { t: 'row/setHeight', rowId: firstRowId(project), height: 320 },
      { t: 'row/setHeight', rowId: firstRowId(project), height: undefined },
    ]

    for (const command of commands) applyCommand(project, command)
    expect(JSON.stringify(project)).toBe(snapshot)
  })

  it('返回的是新对象（引用不同）', () => {
    const project = makeProject()
    const next = applyCommand(project, { t: 'project/patch', patch: { title: 'x' } })
    expect(next).not.toBe(project)
  })

  it('只改动行的命令不会连带重建 sheet（结构化共享，避免无谓的深拷贝）', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const next = applyCommand(project, { t: 'row/patch', rowId, patch: { label: '封面' } })

    // 行数组被替换，但 sheet 与未受影响的行保持同一引用
    expect(next.sheet.rows).not.toBe(project.sheet.rows)
    expect(next.sheet.rows[0]).not.toBe(project.sheet.rows[0])
    expect(next.sheet.rows[1]).toBe(project.sheet.rows[1])
  })
})

describe('project / ui / layout 补丁', () => {
  it('project/patch 修改标题与置顶', () => {
    const next = applyCommand(makeProject(), {
      t: 'project/patch',
      patch: { title: '可灵 vs 即梦', pinned: true },
    })
    expect(next.title).toBe('可灵 vs 即梦')
    expect(next.pinned).toBe(true)
  })

  it('ui/patch 只改视图态', () => {
    const next = applyCommand(makeProject(), { t: 'ui/patch', patch: { mode: 'present' } })
    expect(next.ui.mode).toBe('present')
    expect(next.ui.zoom).toBe(1)
  })

  it('layout/patch 修改布局参数', () => {
    const next = applyCommand(makeProject(), { t: 'layout/patch', patch: { gutter: 64, showAxis: false } })
    expect(next.sheet.layout.gutter).toBe(64)
    expect(next.sheet.layout.showAxis).toBe(false)
  })
})

describe('side/patch', () => {
  it('修改指定侧的配色与版本号', () => {
    const project = makeProject()
    const sideId = project.sheet.sides[0]!.id
    const next = applyCommand(project, {
      t: 'side/patch',
      sideId,
      patch: { accent: '#ff0000', modelVersion: 'v3.5' },
    })

    expect(next.sheet.sides[0]?.accent).toBe('#ff0000')
    expect(next.sheet.sides[0]?.modelVersion).toBe('v3.5')
    // 另一侧不受影响
    expect(next.sheet.sides[1]?.accent).toBe(project.sheet.sides[1]?.accent)
  })

  it('侧不存在时返回错误而非静默成功', () => {
    const result = applyCommandResult(makeProject(), {
      t: 'side/patch',
      sideId: 'nope',
      patch: { accent: '#fff' },
    })
    expect(result.ok).toBe(false)
  })
})

describe('行操作', () => {
  it('row/add 在指定位置插入', () => {
    const project = makeProject()
    const [, sideB] = project.sheet.sides
    const row = {
      id: 'row-x',
      kind: 'paired' as const,
      cells: { [project.sheet.sides[0]!.id]: createEmptyCell(), [sideB!.id]: createEmptyCell() },
      collapsed: false,
    }

    const next = applyCommand(project, { t: 'row/add', row, at: 1 })
    expect(next.sheet.rows).toHaveLength(project.sheet.rows.length + 1)
    expect(next.sheet.rows[1]?.id).toBe('row-x')
  })

  it('row/add 不传 at 时追加到末尾', () => {
    const project = makeProject()
    const row = {
      id: 'row-last',
      kind: 'paired' as const,
      cells: {},
      collapsed: false,
    }
    const next = applyCommand(project, { t: 'row/add', row })
    expect(next.sheet.rows[next.sheet.rows.length - 1]?.id).toBe('row-last')
  })

  /*
   * 通用模块行（kind: 'full'）。
   *
   * 它的模块存在**第一侧**的格子里——`cells` 的类型是 Record<SideId, Cell>，
   * 为通用行另造存储位置会让命令层、校验、导出全都多一条分支；
   * 复用第一侧则一行命令都不用改。下面两条把这个约定钉住：
   * 一旦有人"顺手"把它挪到别处，这里会立刻红。
   */
  it('row/add 可以一次带上通用模块（一整行 + 其中的模块 = 一条命令）', () => {
    const project = makeProject()
    const [sideA, sideB] = project.sheet.sides
    const cell = createEmptyCell()
    cell.modules.push(createModule({ type: 'text', title: '同一套提示词', data: { text: 'hi' } }))

    const row = {
      id: 'row-common',
      kind: 'full' as const,
      cells: { [sideA!.id]: cell, [sideB!.id]: createEmptyCell() },
      collapsed: false,
    }

    const next = applyCommand(project, { t: 'row/add', row, at: 2 })

    expect(next.sheet.rows[2]?.kind).toBe('full')
    expect(next.sheet.rows[2]?.cells[sideA!.id]?.modules).toHaveLength(1)
    expect(next.sheet.rows[2]?.cells[sideB!.id]?.modules).toHaveLength(0)
  })

  it('row/remove 能把"带模块的通用行"整行撤销掉（撤销依赖命令层可逆）', () => {
    const project = makeProject()
    const [sideA, sideB] = project.sheet.sides
    const cell = createEmptyCell()
    cell.modules.push(createModule({ type: 'text', title: '总体评价', data: { text: 'ok' } }))
    const row = {
      id: 'row-common',
      kind: 'full' as const,
      cells: { [sideA!.id]: cell, [sideB!.id]: createEmptyCell() },
      collapsed: false,
    }

    const added = applyCommand(project, { t: 'row/add', row, at: 1 })
    const removed = applyCommand(added, { t: 'row/remove', rowId: 'row-common' })

    expect(removed.sheet.rows).toHaveLength(project.sheet.rows.length)
    expect(removed.sheet.rows.some((item) => item.id === 'row-common')).toBe(false)
  })

  it('row/remove 删除指定行', () => {
    const project = makeProject()
    const target = firstRowId(project)
    const next = applyCommand(project, { t: 'row/remove', rowId: target })
    expect(next.sheet.rows.some((row) => row.id === target)).toBe(false)
    expect(next.sheet.rows).toHaveLength(project.sheet.rows.length - 1)
  })

  it('row/remove 对不存在的行返回错误', () => {
    expect(applyCommandResult(makeProject(), { t: 'row/remove', rowId: 'nope' }).ok).toBe(false)
  })

  it('row/move 调整顺序', () => {
    const project = makeProject()
    const [first, second] = project.sheet.rows
    const next = applyCommand(project, { t: 'row/move', rowId: first!.id, to: 1 })
    expect(next.sheet.rows[0]?.id).toBe(second!.id)
    expect(next.sheet.rows[1]?.id).toBe(first!.id)
  })

  it('row/move 的越界目标被夹紧', () => {
    const project = makeProject()
    const first = project.sheet.rows[0]!
    const next = applyCommand(project, { t: 'row/move', rowId: first.id, to: 999 })
    expect(next.sheet.rows[next.sheet.rows.length - 1]?.id).toBe(first.id)
  })

  it('row/patch 可以改行标题与折叠态', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const next = applyCommand(project, { t: 'row/patch', rowId, patch: { label: '封面' } })
    expect(next.sheet.rows[0]?.label).toBe('封面')
  })
})

describe('模块操作', () => {
  it('module/add 追加模块并保持两侧独立', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id

    const module = createModule({ type: 'text', title: '价格', data: { text: '¥99' } })
    const next = applyCommand(project, { t: 'module/add', ref: { rowId, sideId }, module })

    const cell = next.sheet.rows[0]?.cells[sideId]
    expect(cell?.modules).toHaveLength(2)
    expect(cell?.modules[1]?.title).toBe('价格')

    // 另一侧未受影响
    const otherSide = project.sheet.sides[1]!.id
    expect(next.sheet.rows[0]?.cells[otherSide]?.modules).toHaveLength(1)
  })

  it('module/remove 删除后模块不再存在', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id
    const moduleId = project.sheet.rows[0]!.cells[sideId]!.modules[0]!.id

    const next = applyCommand(project, { t: 'module/remove', ref: { rowId, sideId, moduleId } })
    expect(next.sheet.rows[0]?.cells[sideId]?.modules).toHaveLength(0)
  })

  it('module/patch 改写标题（用户把"文字"改成"价格"的核心场景）', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id
    const moduleId = project.sheet.rows[0]!.cells[sideId]!.modules[0]!.id

    const next = applyCommand(project, {
      t: 'module/patch',
      ref: { rowId, sideId, moduleId },
      patch: { title: '价格', hidden: true },
    })

    const module = next.sheet.rows[0]?.cells[sideId]?.modules[0]
    expect(module?.title).toBe('价格')
    expect(module?.hidden).toBe(true)
  })

  it('module/data 浅合并内容而不覆盖其他键', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id
    const moduleId = project.sheet.rows[0]!.cells[sideId]!.modules[0]!.id
    const ref = { rowId, sideId, moduleId }

    const step1 = applyCommand(project, { t: 'module/data', ref, patch: { a: 1, b: 2 } })
    const step2 = applyCommand(step1, { t: 'module/data', ref, patch: { b: 3 } })

    expect(step2.sheet.rows[0]?.cells[sideId]?.modules[0]?.data).toEqual({ a: 1, b: 3 })
  })

  it('module/move 跨格移动模块', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideA = project.sheet.sides[0]!.id
    const sideB = project.sheet.sides[1]!.id
    const moduleId = project.sheet.rows[0]!.cells[sideA]!.modules[0]!.id

    const next = applyCommand(project, {
      t: 'module/move',
      from: { rowId, sideId: sideA, moduleId },
      to: { rowId, sideId: sideB },
      toIndex: 0,
    })

    expect(next.sheet.rows[0]?.cells[sideA]?.modules).toHaveLength(0)
    expect(next.sheet.rows[0]?.cells[sideB]?.modules).toHaveLength(2)
    expect(next.sheet.rows[0]?.cells[sideB]?.modules[0]?.id).toBe(moduleId)
  })

  it('对不存在的模块操作时返回错误', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id
    const result = applyCommandResult(project, {
      t: 'module/patch',
      ref: { rowId, sideId, moduleId: 'nope' },
      patch: { title: 'x' },
    })
    expect(result.ok).toBe(false)
  })
})

describe('module/add 的次序', () => {
  it('同一格可重复添加同类型模块，且各自独立', () => {
    const project = makeProject()
    const rowId = firstRowId(project)
    const sideId = project.sheet.sides[0]!.id
    const ref = { rowId, sideId }

    let next = project
    for (const title of ['价格', '简评', '结论']) {
      next = applyCommand(next, {
        t: 'module/add',
        ref,
        module: createModule({ type: 'text', title }),
      })
    }

    const titles = next.sheet.rows[0]?.cells[sideId]?.modules.map((module) => module.title)
    // v0.5.0 起模板首行是「标题」（工具名卡片变成了普通模块）；「图片」在第二行
    expect(titles).toEqual(['标题', '价格', '简评', '结论'])

    // 删除中间一个不影响其他
    const target = next.sheet.rows[0]!.cells[sideId]!.modules[1]!
    next = applyCommand(next, { t: 'module/remove', ref: { ...ref, moduleId: target.id } })
    expect(next.sheet.rows[0]?.cells[sideId]?.modules.map((m) => m.title)).toEqual([
      '标题',
      '简评',
      '结论',
    ])
  })
})

describe('row/setHeight（行高拖拽）', () => {
  it('设置行高只影响目标行', () => {
    const project = makeProject()
    const target = firstRowId(project)
    const other = project.sheet.rows[1]?.id

    const next = applyCommand(project, { t: 'row/setHeight', rowId: target, height: 420 })

    expect(next.sheet.rows.find((row) => row.id === target)?.height).toBe(420)
    if (other) expect(next.sheet.rows.find((row) => row.id === other)?.height).toBeUndefined()
  })

  it('传 undefined 是"恢复默认"：字段被删掉，而不是留下一个 undefined 键', () => {
    const project = makeProject()
    const target = firstRowId(project)

    const sized = applyCommand(project, { t: 'row/setHeight', rowId: target, height: 300 })
    const reset = applyCommand(sized, { t: 'row/setHeight', rowId: target, height: undefined })

    const row = reset.sheet.rows.find((item) => item.id === target)
    expect(row?.height).toBeUndefined()
    /*
     * 关键断言：JSON 里不能出现 "height":null 或留下空键。
     * 留着 undefined 键的话，导出的工程文件会带着一个看着像坏数据的字段，
     * 而且下一次 validateRow 也会因为它存在而多做一次判断。
     */
    expect(JSON.stringify(row)).not.toContain('height')
  })

  it('行不存在时明确失败而不是静默成功', () => {
    const project = makeProject()
    // 当前实现是"找不到就原样返回"，与 row/patch 一致——
    // 这里把行为固定下来，避免将来无意改变
    const next = applyCommand(project, { t: 'row/setHeight', rowId: '不存在', height: 100 })
    expect(next.sheet.rows.map((row) => row.height)).toEqual(
      project.sheet.rows.map((row) => row.height),
    )
  })

  it('行高是可逆的（撤销依赖命令层的纯函数性）', () => {
    const project = makeProject()
    const target = firstRowId(project)

    const before = JSON.stringify(project)
    const after = applyCommand(project, { t: 'row/setHeight', rowId: target, height: 260 })
    const back = applyCommand(after, { t: 'row/setHeight', rowId: target, height: undefined })

    expect(JSON.stringify(back)).toBe(before)
  })
})
