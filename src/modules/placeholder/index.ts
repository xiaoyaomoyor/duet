/**
 * 占位块模块
 *
 * 用途：**对齐占位**。当左右两侧内容长度差异很大时，
 * 用一块透明区域把下一行推到同一水平线上（§7.5 的常见需求）。
 * 也可以当作"待补充"的显式标记——用占位块比留白更让人明白是故意留的。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer, safeNumber } from '../shared/inline'

export interface PlaceholderData {
  height: number
  hint: string
}

function readPlaceholder(data: unknown): PlaceholderData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<PlaceholderData>
  return {
    height: Math.max(8, Math.min(800, Math.round(safeNumber(record.height) ?? 48))),
    hint: typeof record.hint === 'string' ? record.hint : '',
  }
}

const definition: ModuleDefinition<PlaceholderData> = {
  type: 'placeholder',
  meta: { titleKey: 'modules.placeholder', icon: 'placeholder', category: 'layout' },
  schema: {
    create: (): PlaceholderData => ({ height: 48, hint: '' }),
    isData: (value): value is PlaceholderData => typeof value === 'object' && value !== null,
  },
  // 占位块是排版手段，两侧与整行都用得上
  scope: 'both',
  editor: createFieldEditor([
    { key: 'height', type: 'number', labelKey: 'placeholder.height', min: 8, max: 800, step: 8, default: 48 },
    { key: 'hint', type: 'text', labelKey: 'placeholder.hint', placeholderKey: 'placeholder.hintPlaceholder' },
  ]),
  renderer: createInlineRenderer(readPlaceholder, (placeholder) =>
    h(
      'div',
      {
        class: ['placeholder', placeholder.hint ? 'placeholder--labelled' : ''],
        style: { height: `${placeholder.height}px` },
      },
      placeholder.hint,
    ),
  ),
  // 占位块的尺寸本身就是内容：它永远"有内容"（§7.4 特例）
  isEmpty: () => false,
}

registerModule(definition as AnyModuleDefinition)

export default definition
