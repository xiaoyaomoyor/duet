/**
 * 模块元数据注册表
 *
 * 与 modules/registry.ts 的关系：
 *   - 本文件只登记**元数据**（类型名、分类、图标、标题 i18n key），用于模块选择器与模板实例化，
 *     体积小、无组件依赖，服务层可以安全引用。
 *   - modules/registry.ts 登记**实现**（editor / renderer / schema / isEmpty），
 *     依赖 Vue 组件，只允许 UI 层引用。
 *
 * 两者的 type 必须一一对应，由 modules/registry.spec.ts 断言（M2 落地）。
 *
 * M7 归纳：`cover` → `image`、`stars` → `score`、`note` → `text`。
 * 三组都是"同一份数据、只差观感"的重复；合并后由各自的选项区分，
 * 旧工程文件由 v2→v3 迁移自动转换。
 *
 * `scope`（适用范围）**不在这里**，而在各模块的实现里：
 * 选择器通过 getModule(type).scope 查询，避免同一件事有两个真源。
 */

export type ModuleCategory = 'media' | 'text' | 'data' | 'layout' | 'advanced'

/**
 * 模块的成熟度（展示给用户看的一句话）。
 *
 *   stable       可用 —— 作者本人实测过，可以放心用
 *   experimental 实验 —— 能选、能用，但作者还没实测，行为可能还会变
 *   planned      规划中 —— 连实现都还没有，选择器里禁用
 *
 * 为什么值得单列一个字段而不是复用 `priority`：
 *   priority 是**开发计划**（这个模块属于哪个里程碑），
 *   maturity 是**作者对它的信心**。两者经常不一致——
 *   一个 P0 模块也可能还没被真人用过。
 *   用户要的恰恰是后者："因为我还没有进行实测"。
 */
export type ModuleMaturity = 'stable' | 'experimental'

export interface ModuleMeta {
  type: string
  /** 标题与说明的 i18n key（形如 'modules.image'） */
  titleKey: string
  descKey: string
  icon: string
  category: ModuleCategory
  /** 是否属于 §7.3 的 P0 必做清单 */
  priority: 'p0' | 'p1' | 'p3'
  /**
   * 成熟度。省略 = 'experimental'（保守默认）——
   * 让"标成可用"成为一个需要**主动写出来**的动作，
   * 而不是忘了写就自动变成"可用"。
   */
  maturity?: ModuleMaturity
  /**
   * 模块选择器的搜索关键词（中英混合）。
   * 放在这里而非 ModuleDefinition.meta：选择器只读取元数据，
   * 不应为了搜索而加载模块实现（那会破坏代码分割）。
   */
  keywords?: string[]
}

/** 已被作者实测、标为"可用"的模块类型（v0.5.0 起含标题） */
export const STABLE_MODULE_TYPES: readonly string[] = [
  'image',
  'text',
  'audio',
  'lyrics',
  'title',
]

/** 某个模块类型是否已实测 */
export function moduleMaturity(type: string): ModuleMaturity {
  const meta = MODULE_META.find((item) => item.type === type)
  if (!meta) return 'experimental'
  return meta.maturity ?? (STABLE_MODULE_TYPES.includes(type) ? 'stable' : 'experimental')
}

export const MODULE_META: readonly ModuleMeta[] = [
  // —— 媒体 ——
  {
    type: 'image',
    titleKey: 'modules.image',
    descKey: 'modules.image',
    icon: 'image',
    category: 'media',
    priority: 'p0',
    keywords: ['image', '图片', '照片', '生图', '封面', 'cover', '主图'],
  },
  {
    type: 'audio',
    titleKey: 'modules.audio',
    descKey: 'modules.audio',
    icon: 'music',
    category: 'media',
    priority: 'p0',
  },
  {
    type: 'video',
    titleKey: 'modules.video',
    descKey: 'modules.video',
    icon: 'video',
    category: 'media',
    priority: 'p0',
  },
  {
    type: 'gallery',
    titleKey: 'modules.gallery',
    descKey: 'modules.gallery',
    icon: 'gallery',
    category: 'media',
    priority: 'p3',
  },
  {
    type: 'model3d',
    titleKey: 'modules.model3d',
    descKey: 'modules.model3d',
    icon: 'cube',
    category: 'media',
    priority: 'p3',
  },

  // —— 文本 ——
  {
    type: 'text',
    titleKey: 'modules.text',
    descKey: 'modules.text',
    icon: 'text',
    category: 'text',
    priority: 'p0',
    keywords: ['text', '文字', '文案', '评语', '价格', '备注', 'note', '结论'],
  },
  {
    type: 'lyrics',
    titleKey: 'modules.lyrics',
    descKey: 'modules.lyrics',
    icon: 'lyrics',
    category: 'text',
    priority: 'p0',
  },
  {
    type: 'markdown',
    titleKey: 'modules.markdown',
    descKey: 'modules.markdown',
    icon: 'markdown',
    category: 'text',
    priority: 'p1',
  },
  {
    type: 'richText',
    titleKey: 'modules.richText',
    descKey: 'modules.richText',
    icon: 'richText',
    category: 'text',
    priority: 'p1',
  },

  // —— 数据 ——
  {
    type: 'keyValue',
    titleKey: 'modules.keyValue',
    descKey: 'modules.keyValue',
    icon: 'table',
    category: 'data',
    priority: 'p0',
  },
  {
    type: 'progress',
    titleKey: 'modules.progress',
    descKey: 'modules.progress',
    icon: 'progress',
    category: 'data',
    priority: 'p0',
  },
  {
    type: 'link',
    titleKey: 'modules.link',
    descKey: 'modules.link',
    icon: 'link',
    category: 'data',
    priority: 'p0',
  },
  {
    type: 'score',
    titleKey: 'modules.score',
    descKey: 'modules.score',
    icon: 'score',
    category: 'data',
    priority: 'p1',
    keywords: ['score', '评分', '打分', '星级', 'stars'],
  },
  {
    type: 'tagList',
    titleKey: 'modules.tagList',
    descKey: 'modules.tagList',
    icon: 'tag',
    category: 'data',
    priority: 'p1',
  },
  {
    type: 'timeline',
    titleKey: 'modules.timeline',
    descKey: 'modules.timeline',
    icon: 'timeline',
    category: 'data',
    priority: 'p3',
  },
  {
    type: 'audioConsole',
    titleKey: 'modules.audioConsole',
    descKey: 'modules.audioConsole',
    icon: 'play',
    category: 'data',
    priority: 'p1',
    keywords: ['sync', '同步', '对轨', 'solo', '独听', '静音', '音频控制台'],
  },

  // —— 布局 ——
  {
    type: 'title',
    titleKey: 'modules.title',
    descKey: 'modules.title',
    icon: 'heading',
    category: 'layout',
    priority: 'p0',
    keywords: ['title', 'header', 'tool', '标题', '工具名', '名称', 'logo'],
  },
  {
    type: 'divider',
    titleKey: 'modules.divider',
    descKey: 'modules.divider',
    icon: 'divider',
    category: 'layout',
    priority: 'p0',
  },
  {
    type: 'placeholder',
    titleKey: 'modules.placeholder',
    descKey: 'modules.placeholder',
    icon: 'placeholder',
    category: 'layout',
    priority: 'p1',
  },

  // —— 高级 ——
  {
    type: 'code',
    titleKey: 'modules.code',
    descKey: 'modules.code',
    icon: 'code',
    category: 'advanced',
    priority: 'p3',
  },
  {
    type: 'diff',
    titleKey: 'modules.diff',
    descKey: 'modules.diff',
    icon: 'diff',
    category: 'advanced',
    priority: 'p3',
  },
  {
    type: 'iframe',
    titleKey: 'modules.iframe',
    descKey: 'modules.iframe',
    icon: 'iframe',
    category: 'advanced',
    priority: 'p3',
  },
]

const META_BY_TYPE = new Map(MODULE_META.map((meta) => [meta.type, meta]))

export function getModuleMeta(type: string): ModuleMeta | undefined {
  return META_BY_TYPE.get(type)
}

/** 模块选择器的分组顺序 */
export const MODULE_CATEGORY_ORDER: readonly ModuleCategory[] = [
  'media',
  'text',
  'data',
  'layout',
  'advanced',
]

/** 按分类分组，供模块选择器渲染（保持 MODULE_CATEGORY_ORDER 的顺序） */
export function groupModuleMeta(
  metas: readonly ModuleMeta[] = MODULE_META,
): Array<{ category: ModuleCategory; items: ModuleMeta[] }> {
  return MODULE_CATEGORY_ORDER.map((category) => ({
    category,
    items: metas.filter((meta) => meta.category === category),
  })).filter((group) => group.items.length > 0)
}
