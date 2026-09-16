/**
 * 项目模板服务
 *
 * 职责：把"模板"实例化为一份完整的 Project 骨架（§17 M3-6）。
 * 纯函数为主，便于单测；不触碰数据库（落盘由 store 负责）。
 */

import { uuid } from '@/lib/id'
import { deepClone } from '@/lib/clone'
import { moduleTitle } from '@/i18n/helper'
import { presetIdOfColor } from '@/data/accentPresets'
import {
  SCHEMA_VERSION,
  type Cell,
  type LayoutConfig,
  type ModuleInstance,
  type ModuleTypeId,
  type Project,
  type Row,
  type Sheet,
  type Side,
  type SideId,
} from '@/types'

export type AccentPair = [string, string]

/** 默认配色（左紫右青，与 §11.2 的 --side-a / --side-b 一致） */
export const DEFAULT_ACCENT_PAIR: AccentPair = ['#a78bfa', '#22d3ee']

/**
 * 由 hex 反查出预设 id，包成可以直接展开进 Side 的字面量。
 *
 * 抽成函数是为了让"颜色 → 预设"这条规则只有一处：
 * 模板实例化与 v3→v4 迁移都要用它，两处各写一遍迟早会不一致。
 */
function presetField(color: string): { accentPreset?: string } {
  const id = presetIdOfColor(color)
  return id ? { accentPreset: id } : {}
}

/** 更多成对配色：两侧色相分离明显，保证"一眼能分清左右" */
export const ACCENT_PAIRS: ReadonlyArray<{ name: string; colors: AccentPair }> = [
  { name: 'violet-cyan', colors: ['#a78bfa', '#22d3ee'] },
  { name: 'pink-blue', colors: ['#f472b6', '#60a5fa'] },
  { name: 'orange-green', colors: ['#fb923c', '#34d399'] },
  { name: 'red-slate', colors: ['#f87171', '#94a3b8'] },
  { name: 'gold-silver', colors: ['#fbbf24', '#cbd5e1'] },
]

export const DEFAULT_LAYOUT: LayoutConfig = {
  ratio: [1, 1],
  gutter: 32,
  showAxis: true,
  background: 'solid',
  maxWidth: 1440,
}

/** 模板中预置的一个模块槽位 */
export interface TemplateField {
  /** 模块类型（对应 modules/registry.ts 中登记的类型） */
  type: ModuleTypeId
  /** 模块标题的 i18n key，形如 'modules.lyrics' */
  titleKey: string
  /** 默认是否在演示视图隐藏（例如"待补充"这类占位模块） */
  hidden?: boolean
  /** 该模块自由配置（透传到 ModuleInstance.props） */
  props?: Record<string, unknown>
}

export interface ProjectTemplate {
  id: string
  category: 'music' | 'image' | 'video' | 'blank' | 'generic'
  nameKey: string
  descKey: string
  accent: AccentPair
  /** paired = 左右各一格；full = 单格跨两列 */
  fields: Array<{ kind: 'paired' | 'full'; label?: string; field: TemplateField }>
}

/** 内置模板（不落库；用户自建模板走 templates 存储） */
export const BUILTIN_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'music',
    category: 'music',
    nameKey: 'template.musicName',
    descKey: 'template.musicDesc',
    accent: DEFAULT_ACCENT_PAIR,
    fields: [
      {
        kind: 'paired',
        field: {
          type: 'image',
          titleKey: 'modules.image',
          // 原「封面图」的默认观感：1:1 且裁切填满
          props: { fit: 'cover', ratio: '1/1' },
        },
      },
      {
        kind: 'paired',
        field: { type: 'audio', titleKey: 'modules.audio', props: { showWaveform: true } },
      },
      { kind: 'paired', field: { type: 'lyrics', titleKey: 'modules.lyrics' } },
      { kind: 'paired', field: { type: 'progress', titleKey: 'modules.progress' } },
    ],
  },
  {
    id: 'image',
    category: 'image',
    nameKey: 'template.imageName',
    descKey: 'template.imageDesc',
    accent: ['#f472b6', '#60a5fa'],
    fields: [
      {
        kind: 'paired',
        field: {
          type: 'image',
          titleKey: 'modules.image',
          // 原「封面图」的默认观感：1:1 且裁切填满
          props: { fit: 'cover', ratio: '1/1' },
        },
      },
      { kind: 'paired', field: { type: 'image', titleKey: 'modules.image' } },
      { kind: 'paired', field: { type: 'keyValue', titleKey: 'modules.keyValue' } },
    ],
  },
  {
    id: 'video',
    category: 'video',
    nameKey: 'template.videoName',
    descKey: 'template.videoDesc',
    accent: ['#fb923c', '#34d399'],
    fields: [
      {
        kind: 'paired',
        field: {
          type: 'image',
          titleKey: 'modules.image',
          // 原「封面图」的默认观感：1:1 且裁切填满
          props: { fit: 'cover', ratio: '1/1' },
        },
      },
      { kind: 'paired', field: { type: 'video', titleKey: 'modules.video' } },
      { kind: 'paired', field: { type: 'keyValue', titleKey: 'modules.keyValue' } },
    ],
  },
  {
    id: 'blank',
    category: 'blank',
    nameKey: 'template.blankName',
    descKey: 'template.blankDesc',
    accent: DEFAULT_ACCENT_PAIR,
    fields: [{ kind: 'paired', field: { type: 'text', titleKey: 'modules.text' } }],
  },
]

export function getTemplate(id: string): ProjectTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id)
}

export interface InstantiateOptions {
  name: string
  accent?: AccentPair
  now?: number
}

/**
 * 由模板生成一个完整的 Project。
 * 生成的骨架中所有模块都是"空模块"（data 为 schema.create() 的默认值），
 * 因此演示视图默认什么都不显示 —— 与 §7.4 的空模块规则一致。
 */
export function instantiateTemplate(
  template: ProjectTemplate,
  options: InstantiateOptions,
): Project {
  const now = options.now ?? Date.now()
  const accent = options.accent ?? template.accent

  const sideAId = uuid()
  const sideBId = uuid()

  /*
   * 两侧同时写入 preset 与 hex：
   *   preset 是**真源**（按当前主题解析成深浅两套色值），
   *   hex 只是给不认预设的老代码 / 老文件一个始终可用的回退值。
   * 认不出预设的（用户自定义色）就只写 hex，行为与 M8 之前一致。
   */
  const sides: [Side, Side] = [
    {
      id: sideAId,
      toolRef: { kind: 'inline', name: '工具 A' },
      accent: accent[0],
      ...presetField(accent[0]),
    },
    {
      id: sideBId,
      toolRef: { kind: 'inline', name: '工具 B' },
      accent: accent[1],
      ...presetField(accent[1]),
    },
  ]

  /*
   * 第一行固定是「标题」行（v0.5.0）。
   *
   * 工具名卡片从"画布顶部自动绘制"变成了一个普通模块：这样它能被拖动、
   * 能被删掉、也能在任意行重新添加（用户要求"可以进行移动等操作"）。
   * 模板把它放在第一行，与之前的位置在观感上一致。
   */
  const rows = [
    createTitleRow(sideAId, sideBId),
    ...template.fields.map((entry) => createRow(entry, sideAId, sideBId)),
  ]

  const sheet: Sheet = {
    id: uuid(),
    sides,
    rows,
    layout: deepClone(DEFAULT_LAYOUT),
  }

  return {
    id: uuid(),
    schemaVersion: SCHEMA_VERSION,
    title: options.name,
    createdAt: now,
    updatedAt: now,
    tags: [],
    pinned: false,
    sheet,
    ui: {
      mode: 'edit',
      toolbarCollapsed: false,
      sidebarCollapsed: false,
      zoom: 1,
    },
  }
}

/** 创建一个不含任何行的空白项目 */
export function createBlankProject(name: string, accent = DEFAULT_ACCENT_PAIR): Project {
  const blank = BUILTIN_TEMPLATES.find((t) => t.id === 'blank')
  if (blank) {
    const project = instantiateTemplate(blank, { name, accent })
    /*
     * 空白对比也保留「标题」行（v0.5.0）：工具名卡片现在是普通模块，
     * 连它一起清掉的话，新建的空白对比连"这是哪两个工具"都写不了。
     */
    project.sheet.rows = [createTitleRow(
      project.sheet.sides[0].id,
      project.sheet.sides[1].id,
    )]
    return project
  }

  // 理论上不会走到这里；保留兜底以避免非空断言
  return instantiateTemplate(BUILTIN_TEMPLATES[0] as ProjectTemplate, { name, accent })
}

/** 由模板字段创建一行（左右各一格，或单格跨两列） */
export function createRow(
  entry: ProjectTemplate['fields'][number],
  sideAId: SideId,
  sideBId: SideId,
): Row {
  const module = createModuleInstance(entry.field)

  const emptyCell = (): Cell => ({ modules: [], hidden: false })

  const cells: Record<SideId, Cell> =
    entry.kind === 'paired'
      ? {
          [sideAId]: { modules: [module], hidden: false },
          [sideBId]: { modules: [createModuleInstance(entry.field)], hidden: false },
        }
      : {
          [sideAId]: { modules: [module], hidden: false },
          [sideBId]: emptyCell(),
        }

  const row: Row = {
    id: uuid(),
    kind: entry.kind,
    cells,
    collapsed: false,
  }
  if (entry.label) row.label = entry.label
  return row
}

/**
 * 「标题」行（v0.5.0）：左右各一个 title 模块，用来显示工具名 / 版本 / LOGO。
 *
 * 它和别的行没有任何区别——所以能被拖动、被折叠、被删掉。
 * 抽成函数是因为模板实例化与老工程迁移都要用它，两处必须是同一个形状。
 */
export function createTitleRow(sideAId: SideId, sideBId: SideId): Row {
  const make = (): ModuleInstance => createModuleInstance({ type: 'title', titleKey: 'modules.title' })
  return {
    id: uuid(),
    kind: 'paired',
    cells: {
      [sideAId]: { modules: [make()], hidden: false },
      [sideBId]: { modules: [make()], hidden: false },
    },
    collapsed: false,
  }
}

/** 创建一个空内容的模块实例 */
export function createModuleInstance(field: TemplateField): ModuleInstance {
  const instance: ModuleInstance = {
    id: uuid(),
    type: field.type,
    // 默认标题取该模块类型的本地化名称；用户改写后 title 即成为唯一真源
    title: moduleTitle(field.type),
    hidden: field.hidden ?? false,
    data: {},
    props: field.props ? deepClone(field.props) : {},
  }
  return instance
}
