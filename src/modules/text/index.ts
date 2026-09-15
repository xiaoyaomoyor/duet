/**
 * 文字模块
 *
 * 这是"自定义维度"的主力：用户添加后把标题改成"价格""简评""结论"，
 * 因此**内容与标题同等重要**，编辑器要尽量省事（自动高度、字数提示）。
 *
 * 类型定义在 ./data.ts —— 见该文件顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { isBlankText } from '../shared/guards'
import type { TextData, TextProps } from './data'

const definition: ModuleDefinition<TextData, TextProps> = {
  type: 'text',
  meta: {
    titleKey: 'modules.text',
    icon: 'text',
    category: 'text',
    keywords: ['text', '文字', '文案', '评语', '价格'],
  },
  schema: {
    create: () => ({ text: '', align: 'left' }),
    isData: (value): value is TextData => {
      if (typeof value !== 'object' || value === null) return false
      const data = value as Partial<TextData>
      return typeof data.text === 'string'
    },
  },
  defaultProps: { size: 'normal' },
  options: [
    {
      key: 'size',
      labelKey: 'moduleOption.size',
      type: 'select',
      values: [
        { value: 'normal', labelKey: 'moduleOption.sizeNormal' },
        { value: 'large', labelKey: 'moduleOption.sizeLarge' },
      ],
      default: 'normal',
    },
  ],
  editor: defineAsyncComponent(() => import('./TextEditor.vue')),
  renderer: defineAsyncComponent(() => import('./TextRenderer.vue')),
  // 空白字符不算内容："没填"与"只打了空格"必须区分对待（§7.4）
  // 用 isBlankText 而不是 data.text.trim()：data 可能是 {} 或残缺对象（见 shared/guards.ts）
  isEmpty: (data) => isBlankText(data?.text ?? ''),
}

registerModule(definition as AnyModuleDefinition)

export default definition
