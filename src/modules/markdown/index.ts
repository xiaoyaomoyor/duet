/**
 * Markdown 模块
 *
 * 用途：写较长的评测说明——标题、列表、代码片段都能排好版。
 * 渲染走 lib/markdown.ts 的零依赖子集实现（先转义再替换，避免 XSS）。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { isBlankText } from '../shared/guards'
import type { MarkdownData } from './data'

const definition: ModuleDefinition<MarkdownData> = {
  type: 'markdown',
  meta: {
    titleKey: 'modules.markdown',
    icon: 'text',
    category: 'text',
    keywords: ['markdown', 'md', '文档', '说明'],
  },
  schema: {
    create: () => ({ text: '' }),
    isData: (value): value is MarkdownData => {
      if (typeof value !== 'object' || value === null) return false
      return typeof (value as MarkdownData).text === 'string'
    },
  },
  editor: defineAsyncComponent(() => import('./MarkdownEditor.vue')),
  renderer: defineAsyncComponent(() => import('./MarkdownRenderer.vue')),
  isEmpty: (data) => isBlankText(data?.text ?? ''),
}

registerModule(definition as AnyModuleDefinition)

export default definition
