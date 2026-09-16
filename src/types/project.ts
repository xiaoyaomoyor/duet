/**
 * 对奏 Duet — 领域类型（唯一真源，见 §6.1）
 *
 * 纪律：本目录只放类型与常量，禁止出现任何副作用代码。
 */

/**
 * 数据结构版本号。任何破坏性变更必须 +1 并在 db/schema.ts 补迁移。
 *
 * v2（M6）：新增行高（`Row.height`）与工具卡片显示开关（`Side.show*` / `Side.iconAssetId`）。
 *   这些字段都是可选的，v1 代码读到也不会崩——但 v1 代码**保存时会丢掉它们**
 *   （命令层按已知字段重建对象）。所以这里必须升版本，
 *   让 v1 应用在导入 v2 文件时明确拒绝，而不是静默吃掉用户的布局设置。
 *
 * v3（M7）：模块归纳——`cover` → `image`、`stars` → `score`、`note` → `text`。
 *   这是**破坏性**变更：旧 type 的实现已从注册表删除，
 *   不迁移就会命中"模块类型未注册"分支、表现为内容消失。
 */
export const SCHEMA_VERSION = 3

// ——————————————————————————————————————————————————————————
// 工具（生产源）
// ——————————————————————————————————————————————————————————

export type ToolKind = 'builtin' | 'custom'

export type ToolCategory =
  | 'music'
  | 'image'
  | 'video'
  | 'audio-tts'
  | 'model-3d'
  | 'llm'
  | 'code'
  | 'product'
  | 'game'
  | 'other'

export interface Tool {
  id: string
  kind: ToolKind
  name: string
  vendor?: string
  category: ToolCategory
  /** 自定义图标（Asset 引用） */
  iconAssetId?: string
  /** 程序化生成图标所需的品牌色；缺省时由名称哈希决定 */
  color?: string
  homepage?: string
  /** 搜索关键词，如 ['kling', '可灵AI'] */
  aliases: string[]
  /** 内置工具的唯一键，用于版本升级时合并用户库 */
  builtinKey?: string
  createdAt: number
}

/** 对比页中引用一个工具的方式 */
export type ToolRef =
  | { kind: 'builtin'; toolId: string }
  | { kind: 'custom'; toolId: string }
  /** 临时工具：不入库，仅存在于当前对比页 */
  | { kind: 'inline'; name: string; iconAssetId?: string }

// ——————————————————————————————————————————————————————————
// 资源（媒体）
// ——————————————————————————————————————————————————————————

export type AssetKind = 'image' | 'audio' | 'video' | 'text' | 'icon' | 'model3d'

export interface AssetDerived {
  width?: number
  height?: number
  durationMs?: number
  thumbAssetId?: string
  /** 降采样到 480 点的归一化振幅 0~1 */
  waveform?: number[]
}

export interface AssetOrigin {
  url: string
  /** link = 仅引用不缓存；mirror = 已镜像到本地 */
  mode: 'link' | 'mirror'
  fetchedAt?: number
  etag?: string
}

export interface Asset {
  /** 内容哈希（sha-256 前 16 字节 hex），天然去重 */
  id: string
  kind: AssetKind
  mime: string
  size: number
  name: string
  createdAt: number
  blob: Blob
  origin?: AssetOrigin
  derived?: AssetDerived
}

/** 媒体来源：本地资源或外链 */
export type MediaSource =
  | { kind: 'asset'; assetId: string }
  | { kind: 'url'; url: string; mirror?: boolean }

// ——————————————————————————————————————————————————————————
// 对比项目
// ——————————————————————————————————————————————————————————

export type SideId = string
export type ModuleTypeId = string

export interface Side {
  id: SideId
  toolRef: ToolRef
  /** 主题色 hex，默认左紫右青 */
  accent: string
  /** 覆盖工具名，如「可灵 · 1.6 大师版」 */
  labelOverride?: string
  /** 模型子名称/版本号 */
  modelVersion?: string
  /** 一句话备注 */
  note?: string
  /**
   * 本侧专用的图标，覆盖工具自带的图标。
   *
   * 为什么不直接改工具库里的图标：同一个工具可能被两个对比页用出不同含义，
   * 而且内置工具是共享的、不该被单页修改。放在 Side 上，
   * 生命周期跟着对比页走，导出/分享时也自然带上。
   */
  iconAssetId?: string
  /**
   * 工具卡片上各元素的显示开关。
   * 统一约定：**省略或 true = 显示**，只有显式 false 才隐藏。
   * 这样旧数据（没有这些字段）天然是全显示的，无需迁移。
   */
  showIcon?: boolean
  showName?: boolean
  showVersion?: boolean
  showNote?: boolean
}

export interface ModuleInstance {
  id: string
  type: ModuleTypeId
  /** 用户可改写的标题（如把「文字」改成「价格」） */
  title: string
  /** 有内容但不想在展示视图显示 */
  hidden: boolean
  data: unknown
  props: Record<string, unknown>
  /** 锁定后不可删除（模板预置行使用） */
  locked?: boolean
}

export interface Cell {
  modules: ModuleInstance[]
  /** 整格隐藏：另一方仍然显示 */
  hidden: boolean
  background?: 'none' | 'panel' | 'accent-soft'
}

export interface Row {
  id: string
  /** paired = 左右各一格；full = 单格跨两列 */
  kind: 'paired' | 'full'
  /** 行级标题，显示在两格上方居中的胶囊标签 */
  label?: string
  cells: Record<SideId, Cell>
  collapsed: boolean
  /**
   * 行内容区的最小高度（px）。由用户拖动行间分界线设定。
   *
   * 语义是**最小高度**而不是固定高度：内容比它高时行仍然会长高，
   * 否则用户会看到被裁掉的内容，那比不能调高度更糟。
   */
  height?: number
}

export interface LayoutConfig {
  /** 两侧宽度比例 */
  ratio: [number, number]
  /** 中轴间距 px */
  gutter: number
  density: 'compact' | 'normal' | 'comfy'
  showAxis: boolean
  background: 'solid' | 'grid' | 'dots'
  maxWidth: number
}

export interface Sheet {
  id: string
  /** v1 固定 2 侧；v2 允许 >2，渲染层按 sides.length 自适应列数 */
  sides: [Side, Side]
  rows: Row[]
  layout: LayoutConfig
}

export interface ProjectUiState {
  mode: 'edit' | 'present'
  toolbarCollapsed: boolean
  sidebarCollapsed: boolean
  /** 0.5 ~ 1.5 */
  zoom: number
}

export interface Project {
  id: string
  schemaVersion: number
  title: string
  createdAt: number
  updatedAt: number
  tags: string[]
  pinned: boolean
  /** v1 一个项目 = 一张对比页；v2 改为 sheets: Sheet[] */
  sheet: Sheet
  ui: ProjectUiState
}

// ——————————————————————————————————————————————————————————
// 应用设置
// ——————————————————————————————————————————————————————————

/**
 * 主题 id。
 *
 * `system` 不是一个"配色"，而是一个**解析规则**：按 `prefers-color-scheme`
 * 落到 `dark` 或 `light`。这样做的理由是用户对"跟随系统"的期待是
 * "白天白、晚上黑"，而不是"选了一个叫系统的颜色"。
 * 实际写入 `<html data-theme>` 的永远是解析后的具体主题。
 */
export type ThemeId = 'system' | 'dark' | 'light' | 'violet-dark'

/** 会真正应用到 <html data-theme> 的主题（system 会被解析成其中之一） */
export type ResolvedThemeId = Exclude<ThemeId, 'system'>

/**
 * 全部合法主题 id。
 *
 * 刻意的运行时白名单：它出现在这里（而不是只在类型里）是为了让
 * "从 IndexedDB 读回来的脏数据"能被校验——类型在运行时不存在，
 * 而设置是用户可以直接改数据库的。
 */
export const THEME_IDS: readonly ThemeId[] = ['system', 'dark', 'light', 'violet-dark']
export type LanguageCode = 'zh-CN' | 'en-US'

export interface AccentPreset {
  name: string
  colors: [string, string]
}

export interface AppSettings {
  themeId: ThemeId
  language: LanguageCode
  /** 保持位置：重开应用时恢复上次的项目与视图 */
  restoreLastPosition: boolean
  lastProjectId?: string
  lastMode?: 'edit' | 'present'
  defaultAccent: [string, string]
  accentPresets: AccentPreset[]
  autosaveDebounceMs: number
  /** 外链媒体默认处理策略 */
  mediaImportMode: 'ask' | 'mirror' | 'link'
  maxMirrorSizeMB: number
  sidebarWidth: number
  /** 编辑视图是否显示空模块占位 */
  editorShowEmptyModules: boolean
  exportScale: 1 | 2
  reducedMotion: 'auto' | 'always' | 'never'
  /** 已停用的内置工具 id */
  disabledBuiltinTools: string[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  // 默认跟随系统：新用户第一次打开时，界面亮度就已经符合他的系统偏好
  themeId: 'system',
  language: 'zh-CN',
  restoreLastPosition: true,
  defaultAccent: ['#a78bfa', '#22d3ee'],
  accentPresets: [
    { name: '紫青', colors: ['#a78bfa', '#22d3ee'] },
    { name: '粉蓝', colors: ['#f472b6', '#60a5fa'] },
    { name: '橙绿', colors: ['#fb923c', '#34d399'] },
    { name: '红灰', colors: ['#f87171', '#94a3b8'] },
    { name: '金银', colors: ['#fbbf24', '#cbd5e1'] },
  ],
  autosaveDebounceMs: 300,
  mediaImportMode: 'mirror',
  maxMirrorSizeMB: 200,
  sidebarWidth: 260,
  editorShowEmptyModules: true,
  exportScale: 2,
  reducedMotion: 'auto',
  disabledBuiltinTools: [],
}

// ——————————————————————————————————————————————————————————
// 便捷类型
// ——————————————————————————————————————————————————————————

/** 模块在文档树中的定位坐标 */
export interface ModuleRef {
  rowId: string
  sideId: SideId
  moduleId: string
}

export interface CellRef {
  rowId: string
  sideId: SideId
}

/** 数据库中的设置记录 */
export interface SettingsRecord {
  key: 'app'
  value: AppSettings
  updatedAt: number
}
