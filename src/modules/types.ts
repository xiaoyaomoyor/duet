/**
 * 模块契约（§7.2）
 *
 * 这是本项目最关键的扩展点：
 *   新增一种模块 = 新增一个目录 + 在 registry 登记一行，
 *   **不需要改动任何既有代码**（禁止出现巨型 v-if/v-else 分支）。
 *
 * 三个契约的职责边界：
 *   - editor   ：编辑视图里的"怎么填"
 *   - renderer ：展示视图里的"怎么呈现"（含动效）
 *   - isEmpty  ：决定"是否算已填写"，直接驱动展示视图的空模块隐藏规则（§7.4）
 */

import type { Component } from 'vue'
import type { ModuleCategory } from '@/modules/meta'
import type { ModuleInstance } from '@/types/project'

/** 模块编辑器收到的统一 props */
export interface ModuleEditorProps {
  /** 当前模块实例（含 data / props / title / hidden） */
  module: ModuleInstance
  /** 所属对比方 id（模块可能需要知道自己属于左侧还是右侧） */
  sideId: string
  /** 是否为只读态（展示视图 / 只读导出） */
  readonly: boolean
  /** 写入内容：走 store 的命令层，带 coalesceKey 合并连续输入 */
  patchData: (patch: Record<string, unknown>) => void
  /** 写入模块自身配置（props） */
  patchProps: (patch: Record<string, unknown>) => void
}

/** 模块渲染器收到的统一 props */
export interface ModuleRendererProps {
  module: ModuleInstance
  sideId: string
  /** 所属侧的主题色（渲染器可据此着色，不必自己读 store） */
  accent: string
  /** 只读渲染（导出长图 / 只读 HTML）时为 true */
  readonly: boolean
}

/** 模块呈现选项（供 Inspector 通用渲染，避免每种模块自己写表单） */
export interface ModuleOption {
  key: string
  labelKey: string
  type: 'select' | 'number' | 'boolean' | 'text'
  /** select 的候选项 */
  values?: Array<{ value: string | number; labelKey: string }>
  min?: number
  max?: number
  step?: number
  default: unknown
}

export interface ModuleDefinition<TData = unknown, TProps = Record<string, unknown>> {
  /** 模块类型 id，必须与 modules/meta.ts 中的登记一致 */
  type: string
  meta: {
    /** 标题 i18n key，形如 'modules.cover' */
    titleKey: string
    icon: string
    category: ModuleCategory
    /** 模块选择器中的搜索关键词（中英混合，便于检索） */
    keywords?: string[]
  }
  /** 内容默认值与校验 */
  schema: {
    create: () => TData
    /** 运行时不变量：非法数据由编辑器兜底展示，不抛异常 */
    isData: (value: unknown) => value is TData
  }
  /** 默认 props（合并到 ModuleInstance.props） */
  defaultProps?: TProps
  /** 呈现选项（Inspector 动态渲染） */
  options?: ModuleOption[]
  editor: Component
  renderer: Component
  /** 是否"未填写"：直接决定展示视图是否隐藏（§7.4） */
  isEmpty: (data: TData, props: TProps) => boolean
  /** 可选：导出长图前的准备（等待图片解码等） */
  beforeExport?: (el: HTMLElement) => Promise<void>
}
