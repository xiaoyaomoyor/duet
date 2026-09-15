/**
 * 命令应用器（纯函数，可脱离 DOM 与 Pinia 单测）
 *
 * 约定：
 *   - **不可变**：返回新的 Project 对象，绝不修改入参
 *   - **不静默失败**：目标不存在时原样返回（并可通过 applyCommandResult 取到错误）
 *   - **不校验业务规则**：例如"最后一侧不能删"这类规则由 store 层负责
 */

import { deepClone } from '@/lib/clone'
import { err, ok, type Result } from '@/lib/result'
import { uuid } from '@/lib/id'
import type { Command, NewModuleInput } from '@/types/commands'
import type {
  Cell,
  CellRef,
  ModuleInstance,
  ModuleRef,
  Project,
  Row,
  SideId,
} from '@/types/project'

/** 应用一条命令；失败时原样返回项目（配合 applyCommandResult 获取原因） */
export function applyCommand(project: Project, command: Command): Project {
  const result = applyCommandResult(project, command)
  return result.ok ? result.value : project
}

/** 应用一条命令并返回 Result，便于 store 层把失败原因暴露给 UI */
export function applyCommandResult(project: Project, command: Command): Result<Project, string> {
  switch (command.t) {
    case 'project/patch':
      return ok({ ...project, ...deepClone(command.patch) })

    case 'ui/patch':
      return ok({ ...project, ui: { ...project.ui, ...deepClone(command.patch) } })

    case 'layout/patch':
      return ok({
        ...project,
        sheet: { ...project.sheet, layout: { ...project.sheet.layout, ...deepClone(command.patch) } },
      })

    case 'side/patch':
      return patchSide(project, command.sideId, command.patch)

    case 'row/add': {
      const rows = [...project.sheet.rows]
      const at = clampIndex(command.at, rows.length)
      rows.splice(at, 0, deepClone(command.row))
      return ok(withRows(project, rows))
    }

    case 'row/remove': {
      const index = project.sheet.rows.findIndex((row) => row.id === command.rowId)
      if (index === -1) return err(`行不存在：${command.rowId}`)
      const rows = [...project.sheet.rows]
      rows.splice(index, 1)
      return ok(withRows(project, rows))
    }

    case 'row/move': {
      const rows = [...project.sheet.rows]
      const from = rows.findIndex((row) => row.id === command.rowId)
      if (from === -1) return err(`行不存在：${command.rowId}`)
      const [moved] = rows.splice(from, 1)
      if (!moved) return err(`行不存在：${command.rowId}`)
      rows.splice(clampIndex(command.to, rows.length), 0, moved)
      return ok(withRows(project, rows))
    }

    case 'row/patch': {
      const rows = project.sheet.rows.map((row) =>
        row.id === command.rowId ? { ...row, ...deepClone(command.patch) } : row,
      )
      return ok(withRows(project, rows))
    }

    case 'row/toggleCollapsed': {
      const rows = project.sheet.rows.map((row) =>
        row.id === command.rowId ? { ...row, collapsed: !row.collapsed } : row,
      )
      return ok(withRows(project, rows))
    }

    case 'cell/patch':
      return patchCell(project, command.ref, command.patch)

    case 'module/add':
      return addModule(project, command.ref, command.module, command.at)

    case 'module/remove':
      return removeModule(project, command.ref)

    case 'module/move':
      return moveModule(project, command.from, command.to, command.toIndex)

    case 'modules/reorder':
      return reorderModules(project, command.ref, command.moduleIds)

    case 'module/patch':
      return patchModule(project, command.ref, command.patch)

    case 'module/data':
      return patchModuleData(project, command.ref, command.patch)

    default: {
      // 穷尽性检查：新增命令类型时这里会编译报错
      const never: never = command
      return err(`未知命令：${JSON.stringify(never)}`)
    }
  }
}

// ——————————————————————————————————————————————————————————
// 内部实现
// ——————————————————————————————————————————————————————————

function withRows(project: Project, rows: Row[]): Project {
  return { ...project, sheet: { ...project.sheet, rows } }
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined || !Number.isFinite(index)) return length
  return Math.min(length, Math.max(0, Math.trunc(index)))
}

function patchSide(project: Project, sideId: SideId, patch: Record<string, unknown>): Result<Project, string> {
  if (!project.sheet.sides.some((side) => side.id === sideId)) {
    return err(`对比侧不存在：${sideId}`)
  }
  const sides = project.sheet.sides.map((side) =>
    side.id === sideId ? { ...side, ...deepClone(patch) } : side,
  ) as Project['sheet']['sides']
  return ok({ ...project, sheet: { ...project.sheet, sides } })
}

function patchCell(
  project: Project,
  ref: CellRef,
  patch: Record<string, unknown>,
): Result<Project, string> {
  const row = project.sheet.rows.find((item) => item.id === ref.rowId)
  if (!row) return err(`行不存在：${ref.rowId}`)
  if (!row.cells[ref.sideId]) return err(`格子不存在：${ref.rowId} / ${ref.sideId}`)

  const rows = project.sheet.rows.map((item) =>
    item.id === ref.rowId
      ? {
          ...item,
          cells: {
            ...item.cells,
            [ref.sideId]: { ...(item.cells[ref.sideId] as Cell), ...deepClone(patch) },
          },
        }
      : item,
  )
  return ok(withRows(project, rows))
}

function addModule(
  project: Project,
  ref: CellRef,
  module: ModuleInstance,
  at?: number,
): Result<Project, string> {
  const row = project.sheet.rows.find((item) => item.id === ref.rowId)
  if (!row) return err(`行不存在：${ref.rowId}`)
  const cell = row.cells[ref.sideId]
  if (!cell) return err(`格子不存在：${ref.rowId} / ${ref.sideId}`)

  const modules = [...cell.modules]
  modules.splice(clampIndex(at, modules.length), 0, deepClone(module))

  const rows = project.sheet.rows.map((item) =>
    item.id === ref.rowId
      ? { ...item, cells: { ...item.cells, [ref.sideId]: { ...cell, modules } } }
      : item,
  )
  return ok(withRows(project, rows))
}

function removeModule(project: Project, ref: ModuleRef): Result<Project, string> {
  const row = project.sheet.rows.find((item) => item.id === ref.rowId)
  if (!row) return err(`行不存在：${ref.rowId}`)
  const cell = row.cells[ref.sideId]
  if (!cell) return err(`格子不存在：${ref.rowId} / ${ref.sideId}`)
  if (!cell.modules.some((module) => module.id === ref.moduleId)) {
    return err(`模块不存在：${ref.moduleId}`)
  }

  const modules = cell.modules.filter((module) => module.id !== ref.moduleId)
  const rows = project.sheet.rows.map((item) =>
    item.id === ref.rowId
      ? { ...item, cells: { ...item.cells, [ref.sideId]: { ...cell, modules } } }
      : item,
  )
  return ok(withRows(project, rows))
}

function moveModule(
  project: Project,
  from: ModuleRef,
  to: CellRef,
  toIndex: number,
): Result<Project, string> {
  const sourceRow = project.sheet.rows.find((item) => item.id === from.rowId)
  if (!sourceRow) return err(`源行不存在：${from.rowId}`)
  const sourceCell = sourceRow.cells[from.sideId]
  if (!sourceCell) return err(`源格子不存在：${from.rowId} / ${from.sideId}`)

  const module = sourceCell.modules.find((item) => item.id === from.moduleId)
  if (!module) return err(`模块不存在：${from.moduleId}`)

  // 先移除
  const removed = applyCommandResult(project, { t: 'module/remove', ref: from })
  if (!removed.ok) return removed

  // 再插入到目标位置
  return addModule(removed.value, to, module, toIndex)
}

function patchModule(
  project: Project,
  ref: ModuleRef,
  patch: Record<string, unknown>,
): Result<Project, string> {
  return mapModule(project, ref, (module) => ({ ...module, ...deepClone(patch) }))
}

/**
 * 整格重排。
 *
 * 用于拖拽排序：一次命令替换整格顺序，因此只产生**一步撤销**。
 * 传入的 moduleIds 必须与现有模块集合完全一致（不允许丢失或凭空新增），
 * 否则视为调用方出错并拒绝执行——这能挡住"拖拽库返回了错误数组"这类问题。
 */
function reorderModules(
  project: Project,
  ref: CellRef,
  moduleIds: readonly string[],
): Result<Project, string> {
  const row = project.sheet.rows.find((item) => item.id === ref.rowId)
  if (!row) return err(`行不存在：${ref.rowId}`)
  const cell = row.cells[ref.sideId]
  if (!cell) return err(`格子不存在：${ref.rowId} / ${ref.sideId}`)

  const existing = new Map(cell.modules.map((module) => [module.id, module]))
  if (moduleIds.length !== cell.modules.length) {
    return err('重排失败：模块数量不一致')
  }

  const next: ModuleInstance[] = []
  for (const id of moduleIds) {
    const module = existing.get(id)
    if (!module) return err(`重排失败：模块不存在 ${id}`)
    next.push(module)
    existing.delete(id)
  }
  if (existing.size > 0) return err('重排失败：存在未列出的模块')

  const rows = project.sheet.rows.map((item) =>
    item.id === ref.rowId
      ? { ...item, cells: { ...item.cells, [ref.sideId]: { ...cell, modules: next } } }
      : item,
  )
  return ok(withRows(project, rows))
}

function patchModuleData(
  project: Project,
  ref: ModuleRef,
  patch: Record<string, unknown>,
): Result<Project, string> {
  return mapModule(project, ref, (module) => ({
    ...module,
    // data 为 unknown：按对象做浅合并（各模块的深层结构由模块自己的 schema 决定）
    data: { ...(module.data as Record<string, unknown>), ...deepClone(patch) },
  }))
}

function mapModule(
  project: Project,
  ref: ModuleRef,
  transform: (module: ModuleInstance) => ModuleInstance,
): Result<Project, string> {
  const row = project.sheet.rows.find((item) => item.id === ref.rowId)
  if (!row) return err(`行不存在：${ref.rowId}`)
  const cell = row.cells[ref.sideId]
  if (!cell) return err(`格子不存在：${ref.rowId} / ${ref.sideId}`)
  if (!cell.modules.some((module) => module.id === ref.moduleId)) {
    return err(`模块不存在：${ref.moduleId}`)
  }

  const modules = cell.modules.map((module) =>
    module.id === ref.moduleId ? transform(module) : module,
  )
  const rows = project.sheet.rows.map((item) =>
    item.id === ref.rowId
      ? { ...item, cells: { ...item.cells, [ref.sideId]: { ...cell, modules } } }
      : item,
  )
  return ok(withRows(project, rows))
}

// ——————————————————————————————————————————————————————————
// 模块工厂（命令层的配套工具，供 store 与模板共用）
// ——————————————————————————————————————————————————————————

/** 由入参构造一个模块实例（补齐 id 与默认值） */
export function createModule(input: NewModuleInput): ModuleInstance {
  return {
    id: uuid(),
    type: input.type,
    title: input.title,
    hidden: input.hidden ?? false,
    data: input.data ?? {},
    props: input.props ?? {},
  }
}

/** 构造一个空的格子 */
export function createEmptyCell(): Cell {
  return { modules: [], hidden: false }
}
