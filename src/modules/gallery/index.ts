/**
 * 图片集模块
 *
 * 用于"一次生成四张，看哪张可用"这类场景（生图对比的常见工作流）。
 * 条目顺序即展示顺序，排序由编辑器的上/下移按钮完成
 * （比拖拽更可靠，且天然键盘可达）。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import type { GalleryData } from './data'

const definition: ModuleDefinition<GalleryData> = {
  type: 'gallery',
  meta: {
    titleKey: 'modules.gallery',
    icon: 'image',
    category: 'media',
    keywords: ['gallery', '图片集', '多图', '四宫格', 'grid'],
  },
  schema: {
    create: () => ({ items: [], columns: 2 }),
    isData: (value): value is GalleryData => {
      if (typeof value !== 'object' || value === null) return false
      return Array.isArray((value as GalleryData).items)
    },
  },
  editor: defineAsyncComponent(() => import('./GalleryEditor.vue')),
  renderer: defineAsyncComponent(() => import('./GalleryRenderer.vue')),
  isEmpty: (data) => !data || !Array.isArray(data.items) || data.items.length === 0,
}

registerModule(definition as AnyModuleDefinition)

export default definition
