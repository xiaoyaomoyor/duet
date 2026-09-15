/**
 * 富文本模块
 *
 * 用途：需要"加粗/列表"这类排版，但不想写 Markdown 语法的场景
 * （从网页粘一段评测文字过来时尤其方便）。
 *
 * 安全纪律：内容按 HTML 保存，渲染前**必须**过 lib/sanitize.ts 的白名单净化。
 * 直接 v-html 未净化内容 = 让别人在你页面上执行脚本。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { htmlToPlainText } from '@/lib/sanitize'
import type { RichTextData } from './data'

const definition: ModuleDefinition<RichTextData> = {
  type: 'richText',
  meta: {
    titleKey: 'modules.richText',
    icon: 'text',
    category: 'text',
    keywords: ['rich', 'richtext', '富文本', '加粗', '排版'],
  },
  schema: {
    create: () => ({ html: '' }),
    isData: (value): value is RichTextData => {
      if (typeof value !== 'object' || value === null) return false
      return typeof (value as RichTextData).html === 'string'
    },
  },
  editor: defineAsyncComponent(() => import('./RichTextEditor.vue')),
  renderer: defineAsyncComponent(() => import('./RichTextRenderer.vue')),
  // 用纯文本摘要判空：只有空标签（如 `<p></p>`）不算有内容
  isEmpty: (data) => htmlToPlainText(data?.html ?? '').length === 0,
}

registerModule(definition as AnyModuleDefinition)

export default definition
