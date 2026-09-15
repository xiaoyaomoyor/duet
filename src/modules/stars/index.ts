/**
 * 星级模块
 *
 * 用途：快速给出一方打 0~5 星——比评分条更轻、更"一眼可读"。
 * 与"评分条"的分工：星级用于整体印象，评分条用于具体维度打分。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer, safeNumber } from '../shared/inline'

export interface StarsData {
  value: number
  /** 满分（默认 5） */
  max: number
}

function readStars(data: unknown): StarsData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<StarsData>
  const max = Math.max(1, Math.round(safeNumber(record.max) ?? 5))
  const raw = safeNumber(record.value)

  // 缺失或负数都表示"还没打分"。必须先判哨兵值再夹取，
  // 否则 Math.max(0, …) 会把 -1 变成 0——新建的模块会被当成"打了 0 星"。
  if (raw === undefined || raw < 0) return { value: -1, max }

  return { value: Math.min(max, Math.max(0, Math.round(raw))), max }
}

const definition: ModuleDefinition<StarsData> = {
  type: 'stars',
  meta: { titleKey: 'modules.stars', icon: 'star', category: 'data' },
  schema: {
    create: (): StarsData => ({ value: -1, max: 5 }),
    isData: (value): value is StarsData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    {
      key: 'value',
      type: 'number',
      labelKey: 'stars.value',
      min: 0,
      max: 5,
      step: 1,
      default: -1,
    },
    { key: 'max', type: 'number', labelKey: 'stars.max', min: 1, max: 10, step: 1, default: 5 },
  ]),
  renderer: createInlineRenderer(readStars, (stars) => {
    const items = []
    for (let i = 0; i < stars.max; i += 1) {
      items.push(
        h(
          'span',
          {
            class: ['stars__item', i < stars.value ? 'stars__item--on' : ''],
            key: i,
          },
          '★',
        ),
      )
    }
    return h('div', { class: 'stars', role: 'img', 'aria-label': `${stars.value}/${stars.max}` }, items)
  }),
  // -1 才算"未打分"：0 星是有效评分（§7.4 明确要求不能把 0 当空）
  isEmpty: (data) => readStars(data).value < 0,
}

registerModule(definition as AnyModuleDefinition)

export default definition
