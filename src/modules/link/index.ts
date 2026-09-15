/**
 * 链接模块
 *
 * 用途：把"生成结果发布在哪儿"作为对比项之一
 * （Suno 的分享页、可灵的作品链接、GitHub 仓库…）。
 * 不自动抓取标题与 favicon：抓取会引入 CORS 与隐私问题（§8.5 的精神）。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import type { LinkData } from './data'

const definition: ModuleDefinition<LinkData> = {
  type: 'link',
  meta: {
    titleKey: 'modules.link',
    icon: 'link',
    category: 'data',
    keywords: ['link', '链接', '网址', 'url', '分享'],
  },
  schema: {
    create: () => ({ url: '', label: '', desc: '' }),
    isData: (value): value is LinkData => {
      if (typeof value !== 'object' || value === null) return false
      return typeof (value as LinkData).url === 'string'
    },
  },
  editor: defineAsyncComponent(() => import('./LinkEditor.vue')),
  renderer: defineAsyncComponent(() => import('./LinkRenderer.vue')),
  isEmpty: (data) => !data || data.url.trim() === '',
}

registerModule(definition as AnyModuleDefinition)

export default definition
