/**
 * 命令定义（唯一写入口，见施工文档 §8.3）
 *
 * 纪律：任何对项目数据的修改都必须表达为一条 Command，经 dispatch 应用。
 * 组件里禁止直接改 project.rows / module.data —— 否则会同时失去
 * 撤销重做、自动保存与可测试性。
 *
 * 每条命令都会在 applyCommand 中以**不可变**方式生成新项目对象，
 * 因此同一条命令天然可逆（撤销栈据此工作）。
 */

import type {
  CellRef,
  LayoutConfig,
  ModuleInstance,
  ModuleRef,
  ModuleTypeId,
  Project,
  ProjectUiState,
  Row,
  Side,
  SideId,
} from './project'

export type Command =
  // —— 项目级 ——
  | { t: 'project/patch'; patch: Partial<Pick<Project, 'title' | 'tags' | 'pinned'>> }
  | { t: 'ui/patch'; patch: Partial<ProjectUiState> }
  | { t: 'layout/patch'; patch: Partial<LayoutConfig> }
  // —— 侧（对比双方） ——
  | { t: 'side/patch'; sideId: SideId; patch: Partial<Omit<Side, 'id'>> }
  // —— 行 ——
  | { t: 'row/add'; row: Row; at?: number }
  | { t: 'row/remove'; rowId: string }
  | { t: 'row/move'; rowId: string; to: number }
  | { t: 'row/patch'; rowId: string; patch: Partial<Omit<Row, 'id' | 'cells'>> }
  | { t: 'row/toggleCollapsed'; rowId: string }
  // —— 格 ——
  | { t: 'cell/patch'; ref: CellRef; patch: Partial<Pick<CellPatchTarget, 'hidden' | 'background'>> }
  // —— 模块 ——
  | { t: 'module/add'; ref: CellRef; module: ModuleInstance; at?: number }
  | { t: 'module/remove'; ref: ModuleRef }
  | { t: 'module/move'; from: ModuleRef; to: CellRef; toIndex: number }
  | {
      t: 'module/patch'
      ref: ModuleRef
      patch: Partial<Pick<ModuleInstance, 'title' | 'hidden' | 'locked' | 'props'>>
    }
  | { t: 'module/data'; ref: ModuleRef; patch: Record<string, unknown> }

/** cell/patch 允许修改的字段（单独抽出便于类型收窄） */
export interface CellPatchTarget {
  hidden: boolean
  background: 'none' | 'panel' | 'accent-soft'
}

/** 命令类型名（用于日志、历史合并键与调试） */
export const COMMAND_TYPES = [
  'project/patch',
  'ui/patch',
  'layout/patch',
  'side/patch',
  'row/add',
  'row/remove',
  'row/move',
  'row/patch',
  'row/toggleCollapsed',
  'cell/patch',
  'module/add',
  'module/remove',
  'module/move',
  'module/patch',
  'module/data',
] as const

export type CommandType = (typeof COMMAND_TYPES)[number]

/** 新增模块时的入参（比完整 ModuleInstance 少几个由工厂补齐的字段） */
export interface NewModuleInput {
  type: ModuleTypeId
  title: string
  data?: unknown
  props?: Record<string, unknown>
  hidden?: boolean
}
