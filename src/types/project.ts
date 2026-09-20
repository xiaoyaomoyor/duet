import type { ComparisonContent, MigrationSnapshot } from './presentation'
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
export const SCHEMA_VERSION = 10

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
  { kind: 'asset'; assetId: string } | { kind: 'url'; url: string; mirror?: boolean }

// ——————————————————————————————————————————————————————————
// 对比项目
// ——————————————————————————————————————————————————————————

export type SideId = string
export type ModuleTypeId = string

export interface Side {
  id: SideId
  /** Stable catalogue label; sorting never renumbers participant identities. */
  catalogueLabel?: string
  toolRef: ToolRef
  /**
   * 主题色 hex。
   *
   * M8 起它降级为**回退值**：正常情况下应该是 `accentPreset` 生效
   * （见 data/accentPresets.ts —— 预设会按当前主题解析成深浅两套色值，
   * 而 hex 是死的，切到亮色主题就会变成"浅色压白底"）。
   * 保留它是为了兼容 v3 及更早的工程，以及将来可能的"自定义颜色"。
   */
  accent: string
  /** 配色预设 id（violet / cyan / pink …）；有值时优先于 accent */
  accentPreset?: string
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
  /**
   * 匿名处理（v0.3.5）：把工具名 / 版本号 / LOGO 遮住，用于分享未公开的对比。
   *
   * 与上面四个"显示开关"的区别：那几个是**不显示**（内容消失），
   * 这几个是**打码**（内容还在，只是被黑框/马赛克盖住）。
   * 观感上刻意不同，因为语义不同：一个是"我没放这个信息"，
   * 另一个是"这里有信息，但我暂时不给你看"。
   *
   * 持久化在工程里：这样导出的长图、只读 HTML 里同样是打码的。
   * 交付演示时点一下黑框可以临时显现（那次点击不写数据）。
   */
  anonymizeName?: boolean
  anonymizeVersion?: boolean
  anonymizeIcon?: boolean
  /**
   * 名称 / 版本的字号倍率（1 = 默认）。
   *
   * 为什么用倍率而不是像素：工具名长度差异极大（"MJ" 与
   * "可灵 · 1.6 大师版"），同一个像素值在一侧合适、另一侧就溢出。
   * 倍率让用户按"我这边的名字有多长"来调，而不是去猜 px。
   * 上下限在 SideHeader 里夹取（0.6 ~ 2），越界的数据不会撑破版面。
   */
  nameScale?: number
  versionScale?: number
}

export interface ModuleInstance {
  id: string
  type: ModuleTypeId
  /** 用户可改写的标题（如把「文字」改成「价格」） */
  title: string
  /** 有内容但不想在演示视图显示 */
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
  /** R2 additive presentation settings; v8 content stays intact, no model migration. */
  presentation?: { enabled: boolean; theme: 'ink' | 'paper' } | undefined
  /**
   * 中轴间距 px。
   *
   * 这里曾经还有一个 `ratio`（左右宽度比），v0.5.5 随"拖动中轴调比例"
   * 一并删除（用户："删除工具之间的分界拖动的设计，实用性不强"）——
   * 两侧恒为等宽，聚光灯的"比例强调"在渲染时临时加权。
   * 老工程里的 `ratio` 由 v7→v8 迁移清掉。
   */
  gutter: number
  /**
   * 密度曾经是可选的三档（紧凑 / 标准 / 宽松）。
   *
   * v0.4.0 把它整档删掉了（用户："删除密度选项，默认为紧凑的布局，
   * 无需用户调整"）。留一个只有一种取值、又没有界面的开关，
   * 只会让下一个读代码的人以为它还能用。
   */
  showAxis: boolean
  background: 'solid' | 'grid' | 'dots'
  maxWidth: number

  // ————————————————————————————————————————————————————————
  // M8 新增（对比配置面板）
  //
  // 全部可选：旧工程文件里没有这些字段，**省略即取默认值**。
  // 这样 v0.2.5 的 .duet 不需要迁移就能打开（migrate 只在字段被改写过时才动）。
  // ————————————————————————————————————————————————————————

  /**
   * 是否在行/模块左上角显示序号（行 = 1、2、3…；模块 = 2.1、2.2…）。
   *
   * 默认关：默认新建的对比页大多是两三条内容，序号是噪音；
   * 而"十几行的长对比"才是它的用武之地——用户自己开。
   */
  showRowNumbers?: boolean | undefined

  /**
   * 演示视图里是否保留背景图案。
   *
   * 默认**关**：成稿要的是内容本身，编辑器里的网格/圆点是"对齐辅助线"，
   * 出现在成稿里只会显得脏。开着是为了做"整页填充"那种视觉稿。
   */
  backgroundInPresent?: boolean | undefined

  /** 图案密度：格子/点的边长 px（8 ~ 96） */
  backgroundScale?: number | undefined

  /**
   * 图案颜色。
   *
   * 留空 = 跟随主题（用 --border-subtle / --border-default）；
   * 有值 = 用户指定的 hex。存 hex 而不是 token 名，
   * 是因为它要跟着工程文件走，而 token 名会随主题定义变化。
   *
   * 写成 `| undefined` 是刻意的：`layout/patch` 的命令类型是
   * `Partial<LayoutConfig>`，而 exactOptionalPropertyTypes 下
   * "把这一项恢复成默认"就是显式传 undefined，不允许的话
   * 面板上那个"跟随主题"按钮根本写不回来。
   */
  backgroundTint?: string | undefined

  /**
   * 背景**底色**（v0.5.3）。
   *
   * 与 `backgroundTint`（图案颜色）是两件事：这一项铺的是整块背景，
   * 那一项画的是网格/点阵的线。留空 = 跟随主题。
   *
   * 编辑视图与演示模式都生效——它是"这份对比页长什么样"的一部分，
   * 不是编辑期的辅助线。
   */
  backgroundBase?: string | undefined

  /**
   * 通用模块的强调色（v0.5.7）。
   *
   * 通用行（横跨两栏）不属于任何一侧，套用某一边的颜色会误导。
   * 留空 = **自动取两侧的中间色**（见 lib/color.ts 的 mixHex）——
   * 它既不属于谁，又明显与两侧同源。想指定一个别的颜色就写在这里。
   */
  commonAccent?: string | undefined

  /**
   * 填充形式（v0.5.0 改语义）：
   *   content 图案只铺在内容区（默认）
   *   page    图案充满**整个对比页**；演示全屏时充满整个屏幕
   *
   * 此前这一项叫 `'solid'`，做的是"整页铺一层实心底色"——
   * 而用户要的是"网格/点阵充满整页"（原话："让填充形式图案可用整页填充的
   * 意思是，网格或者点阵充满整个对比页，而不只作为模块的背景"）。
   * 理解错了就改语义，而不是在错的名字上继续加分支。
   * 旧值由 v5→v6 迁移映射过来：pattern→content、solid→page。
   */
  backgroundFill?: 'content' | 'page' | undefined

  /**
   * 连锁匿名（v0.5.0）。
   *
   * 开启后，点击任意一处被匿名的内容会**同时**切换这一侧的全部匿名项
   * （名称 / 版本 / LOGO）。演示时很实用：讲到"这是哪家的模型"时
   * 一键全露，讲完一键全遮，不必点三次。
   *
   * 存在工程里而不是设置里：它描述的是"这份对比该怎么讲"，
   * 换一台机器打开同一份对比，讲法应该是一样的。
   */
  chainAnonymize?: boolean | undefined

  /**
   * 聚光灯：只有一侧在播放时，如何让"正在听的那一边"更突出。
   *
   *   off   关闭——两侧完全一样
   *   ratio 比例强调——正在播放的一侧占据更大比例（在用户设的比例上加权）
   *   dim   色彩弱化——没在播放的一侧降低不透明度、去饱和
   */
  spotlight?: 'off' | 'ratio' | 'dim' | undefined
}

export interface Sheet {
  id: string
  /** v1 固定 2 侧；v2 允许 >2，渲染层按 sides.length 自适应列数 */
  sides: [Side, Side, ...Side[]]
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
  /** v9 content. Optional only for in-memory legacy factories and fixtures before normalization. */
  comparison?: ComparisonContent
  migrationSnapshot?: MigrationSnapshot
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
  /**
   * 停用的工具（v0.3.5 起统一为一个列表）。
   *
   * 内置工具记 `builtinKey`（如 `deepseek`），自定义工具记工具 id。
   * 此前只有一个 `disabledBuiltinTools`，自定义工具根本没有"停用"这个概念；
   * 用户要求两者在界面上完全同等对待，数据层也就没有必要分两份。
   */
  disabledTools: string[]
  /**
   * 被用户删除的内置工具（按 builtinKey 记）。
   *
   * 内置工具来自代码里的种子表，删不掉，只能"屏蔽"。
   * 这跟"停用"是两件事：停用是"暂时别出现在选择器里"（可一键恢复），
   * 删除是"我不要这个工具了"（要去工具库里找回来才重新出现）。
   */
  removedBuiltinTools: string[]
  /**
   * 内置工具的本地改写（按 builtinKey 记）。
   *
   * 为什么需要它：内置工具不落库（随版本更新），所以"改一个内置工具"
   * 不能像自定义工具那样直接写一行，只能记下"相对于种子的差异"，
   * 渲染时叠加。只存改过的字段，没改的继续跟着版本走。
   */
  builtinToolOverrides: Record<string, BuiltinToolOverride>
  sidebarWidth: number
  /**
   * 对比配置面板宽度（px）。
   *
   * 与 sidebarWidth 同源的做法：分界处可拖拽调节，松手才落盘。
   * 上限比侧栏大一些——配置项里有配色色板与滑块，太窄会挤成两行。
   */
  inspectorWidth: number
  /** 编辑视图是否显示空模块占位 */
  editorShowEmptyModules: boolean
  exportScale: 1 | 2
  reducedMotion: 'auto' | 'always' | 'never'
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
  inspectorWidth: 280,
  editorShowEmptyModules: true,
  exportScale: 2,
  reducedMotion: 'auto',
  disabledTools: [],
  removedBuiltinTools: [],
  builtinToolOverrides: {},
}

// ——————————————————————————————————————————————————————————
// 便捷类型
// ——————————————————————————————————————————————————————————

/**
 * 内置工具的本地改写（只存"改过的字段"）。
 *
 * 全部可选：没改的字段继续跟着内置种子表走，
 * 因此应用升级时内置工具的厂商、分类、主页这些仍会更新，
 * 只有用户明确改过的那几项被固定下来。
 */
export interface BuiltinToolOverride {
  name?: string
  vendor?: string
  category?: ToolCategory
  color?: string
  homepage?: string
  aliases?: string[]
  /** 覆盖图标；显式 null 表示"清掉图标"，与"没改过"区分开 */
  iconAssetId?: string | null
}

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
