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
 */

export type ModuleCategory = 'media' | 'text' | 'data' | 'layout' | 'advanced'

export interface ModuleMeta {
  type: string
  /** 标题与说明的 i18n key（形如 'modules.cover'） */
  titleKey: string
  descKey: string
  icon: string
  category: ModuleCategory
  /** 是否属于 §7.3 的 P0 必做清单 */
  priority: 'p0' | 'p1' | 'p3'
}

export const MODULE_META: readonly ModuleMeta[] = [
  // —— 媒体 ——
  {
    type: 'cover',
    titleKey: 'modules.cover',
    descKey: 'modules.cover',
    icon: 'image',
    category: 'media',
    priority: 'p0',
  },
  {
    type: 'image',
    titleKey: 'modules.image',
    descKey: 'modules.image',
    icon: 'image',
    category: 'media',
    priority: 'p0',
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
    icon: 'image',
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
  },
  {
    type: 'lyrics',
    titleKey: 'modules.lyrics',
    descKey: 'modules.lyrics',
    icon: 'music',
    category: 'text',
    priority: 'p0',
  },
  {
    type: 'note',
    titleKey: 'modules.note',
    descKey: 'modules.note',
    icon: 'comment',
    category: 'text',
    priority: 'p1',
  },
  {
    type: 'markdown',
    titleKey: 'modules.markdown',
    descKey: 'modules.markdown',
    icon: 'text',
    category: 'text',
    priority: 'p1',
  },
  {
    type: 'richText',
    titleKey: 'modules.richText',
    descKey: 'modules.richText',
    icon: 'text',
    category: 'text',
    priority: 'p1',
  },

  // —— 数据 ——
  {
    type: 'keyValue',
    titleKey: 'modules.keyValue',
    descKey: 'modules.keyValue',
    icon: 'text',
    category: 'data',
    priority: 'p0',
  },
  {
    type: 'progress',
    titleKey: 'modules.progress',
    descKey: 'modules.progress',
    icon: 'music',
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
    icon: 'star',
    category: 'data',
    priority: 'p1',
  },
  {
    type: 'stars',
    titleKey: 'modules.stars',
    descKey: 'modules.stars',
    icon: 'star',
    category: 'data',
    priority: 'p1',
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
    icon: 'star',
    category: 'data',
    priority: 'p3',
  },

  // —— 布局 ——
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
    icon: 'divider',
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
    icon: 'code',
    category: 'advanced',
    priority: 'p3',
  },
  {
    type: 'iframe',
    titleKey: 'modules.iframe',
    descKey: 'modules.iframe',
    icon: 'link',
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
