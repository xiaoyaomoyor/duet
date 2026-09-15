/**
 * 代码对比模块（M5）
 *
 * 用途：并排显示两段代码/文案的逐行差异，差异行高亮。
 * 这是"GLM vs DeepSeek 建站"这类场景的核心模块——两个模型给的实现
 * 往往 90% 相同，肉眼找那 10% 非常费劲。
 *
 * 数据形状刻意做成"左右两段文本"（而不是"一个文本 + patch"）：
 * 用户在编辑器里就是往两个框里各粘一份，不需要理解 diff 格式。
 * 差异由 `lib/textDiff` 在渲染时算出（纯函数，已单测覆盖）。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { isBlankText } from '../shared/guards'

export interface DiffData {
  left: string
  right: string
  /** 左侧/右侧的标题（例如 "GLM-4.6" / "DeepSeek-V3.2"） */
  leftLabel: string
  rightLabel: string
}

export interface DiffProps {
  /** 是否只在有差异时才渲染（相同时显示"无差异"提示） */
  showWhenEqual: boolean
  /** 忽略行尾空白后再比较（减少无意义的高亮） */
  ignoreTrailingWhitespace: boolean
}

function readDiff(data: unknown): DiffData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<DiffData>
  return {
    left: typeof record.left === 'string' ? record.left : '',
    right: typeof record.right === 'string' ? record.right : '',
    leftLabel: typeof record.leftLabel === 'string' ? record.leftLabel : '',
    rightLabel: typeof record.rightLabel === 'string' ? record.rightLabel : '',
  }
}

export const definition: ModuleDefinition<DiffData, DiffProps> = {
  type: 'diff',
  meta: {
    titleKey: 'modules.diff',
    icon: 'diff',
    // 与 modules/meta.ts 的分组保持一致
    category: 'advanced',
    keywords: ['diff', '对比', '代码', '差异', 'code', 'glm', 'deepseek', 'cursor'],
  },
  schema: {
    create: (): DiffData => ({ left: '', right: '', leftLabel: '', rightLabel: '' }),
    isData: (value): value is DiffData => typeof value === 'object' && value !== null,
  },
  defaultProps: { showWhenEqual: true, ignoreTrailingWhitespace: true },
  options: [
    {
      key: 'showWhenEqual',
      labelKey: 'diff.showWhenEqual',
      type: 'boolean',
      default: true,
    },
    {
      key: 'ignoreTrailingWhitespace',
      labelKey: 'diff.ignoreTrailingWhitespace',
      type: 'boolean',
      default: true,
    },
  ],
  editor: defineAsyncComponent(() => import('./DiffEditor.vue')),
  renderer: defineAsyncComponent(() => import('./DiffRenderer.vue')),
  // 两侧都为空才算空模块：只填了一侧也应该渲染（能看出"只有一边有内容"）
  isEmpty: (data) => {
    const value = readDiff(data)
    return isBlankText(value.left) && isBlankText(value.right)
  },
}

registerModule(definition as AnyModuleDefinition)

export default definition
