/**
 * 评分条模块
 *
 * 用途：按维度打分（音质 8/10、画面 6/10…），是"评测化"最直接的表达。
 * 与"星级"的分工：星级给整体印象，评分条给具体维度，且可显示数值与满分。
 *
 * 关键语义：**0 分是有效评分，null 才是未评分**。
 * 这一点写进了 isEmpty，避免"打了 0 分却显示未填写"这种反直觉行为。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer, safeNumber } from '../shared/inline'

export interface ScoreData {
  /** null 表示未评分（区别于 0 分） */
  score: number | null
  max: number
  label: string
  showNumber: boolean
}

function readScore(data: unknown): ScoreData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<ScoreData>
  const max = Math.max(1, Math.round(safeNumber(record.max) ?? 10))
  const raw = safeNumber(record.score)

  return {
    // 缺失或负数一律视为"未评分"：负分是脏数据，不能伪造成 0 分这个有效评分
    score: raw === undefined || raw < 0 ? null : Math.min(max, raw),
    max,
    label: typeof record.label === 'string' ? record.label : '',
    showNumber: record.showNumber !== false,
  }
}

const definition: ModuleDefinition<ScoreData> = {
  type: 'score',
  meta: { titleKey: 'modules.score', icon: 'star', category: 'data' },
  schema: {
    create: (): ScoreData => ({ score: null, max: 10, label: '', showNumber: true }),
    isData: (value): value is ScoreData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    { key: 'label', type: 'text', labelKey: 'score.label', placeholderKey: 'score.labelPlaceholder' },
    { key: 'score', type: 'number', labelKey: 'score.value', min: 0, max: 10, step: 0.5 },
    { key: 'max', type: 'number', labelKey: 'score.max', min: 1, max: 100, step: 1, default: 10 },
    { key: 'showNumber', type: 'checkbox', labelKey: 'score.showNumber', default: true },
  ]),
  renderer: createInlineRenderer(readScore, (score) => {
    const ratio = score.score === null ? 0 : score.score / score.max
    return h('div', { class: 'score' }, [
      score.label ? h('span', { class: 'score__label' }, score.label) : null,
      h('div', { class: 'score__track' }, [
        h('span', {
          class: 'score__fill',
          style: { transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` },
        }),
      ]),
      score.showNumber
        ? h('span', { class: 'score__value' }, `${score.score ?? '—'} / ${score.max}`)
        : null,
    ])
  }),
  isEmpty: (data) => readScore(data).score === null,
}

registerModule(definition as AnyModuleDefinition)

export default definition
