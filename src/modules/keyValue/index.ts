/**
 * 参数表模块
 *
 * 用途：对比"同一道题"下的参数差异——时长、分辨率、生成耗时、消耗点数、价格。
 * 这是最"评测化"的模块，因此渲染侧重**行对齐可读性**而非视觉效果。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { isBlankText, safeArray } from '../shared/guards'
import type { KeyValueData, KeyValueProps } from './data'

const definition: ModuleDefinition<KeyValueData, KeyValueProps> = {
  type: 'keyValue',
  meta: {
    titleKey: 'modules.keyValue',
    icon: 'text',
    category: 'data',
    keywords: ['keyvalue', '参数', '规格', '表格', 'spec', '指标'],
  },
  schema: {
    create: () => ({ rows: [{ key: '', value: '' }] }),
    isData: (value): value is KeyValueData => {
      if (typeof value !== 'object' || value === null) return false
      return Array.isArray((value as KeyValueData).rows)
    },
  },
  defaultProps: { variant: 'plain' },
  options: [
    {
      key: 'variant',
      labelKey: 'moduleOption.variant',
      type: 'select',
      values: [
        { value: 'plain', labelKey: 'moduleOption.variantPlain' },
        { value: 'striped', labelKey: 'moduleOption.variantStriped' },
      ],
      default: 'plain',
    },
  ],
  editor: defineAsyncComponent(() => import('./KeyValueEditor.vue')),
  renderer: defineAsyncComponent(() => import('./KeyValueRenderer.vue')),
  // 只有"键与值都为空"的行才是空内容；只填了键也算在填写中
  isEmpty: (data) =>
    safeArray<{ key?: string; value?: string }>(data?.rows).every(
      (row) => isBlankText(row?.key ?? '') && isBlankText(row?.value ?? ''),
    ),
}

registerModule(definition as AnyModuleDefinition)

export default definition
