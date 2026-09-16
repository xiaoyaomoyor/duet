/**
 * 评分模块（M7 起合并了原「星级」）
 *
 * 用途：按维度打分（音质 8/10、画面 6/10…），是"评测化"最直接的表达。
 *
 * 为什么把星级并进来：星级（0~5 星）与评分条（0~N 的条）本质是**同一份数据**
 * ——一个分数 + 一个满分，只差呈现方式。两个模块并列在选择器里，
 * 用户每次都得决定"这次用哪个"，而真正的答案往往只是"我想看星星还是看条"。
 * 合并后由 `style` 选项决定外观，数据模型不变。
 *
 * 关键语义：**0 分是有效评分，null 才是未评分**。
 * 这一点写进了 isEmpty，避免"打了 0 分却显示未填写"这种反直觉行为。
 * 旧「星级」用 -1 表示未评分，迁移时会转成 null。
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

export interface ScoreProps {
  /** 呈现方式：条 / 星 */
  style?: 'bar' | 'stars'
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

const definition: ModuleDefinition<ScoreData, ScoreProps> = {
  type: 'score',
  meta: {
    titleKey: 'modules.score',
    icon: 'score',
    category: 'data',
    keywords: ['score', '评分', '打分', '星级', 'stars', 'rating'],
  },
  schema: {
    create: (): ScoreData => ({ score: null, max: 10, label: '', showNumber: true }),
    isData: (value): value is ScoreData => typeof value === 'object' && value !== null,
  },
  defaultProps: { style: 'bar' },
  options: [
    {
      key: 'style',
      labelKey: 'score.displayStyle',
      type: 'select',
      values: [
        { value: 'bar', labelKey: 'score.styleBar' },
        { value: 'stars', labelKey: 'score.styleStars' },
      ],
      default: 'bar',
    },
  ],
  editor: createFieldEditor([
    { key: 'label', type: 'text', labelKey: 'score.label', placeholderKey: 'score.labelPlaceholder' },
    { key: 'score', type: 'number', labelKey: 'score.value', min: 0, max: 10, step: 0.5 },
    { key: 'max', type: 'number', labelKey: 'score.max', min: 1, max: 100, step: 1, default: 10 },
    { key: 'showNumber', type: 'checkbox', labelKey: 'score.showNumber', default: true },
  ]),
  renderer: createInlineRenderer(
    (data, props) => ({
      score: readScore(data),
      style: (props.module.props?.style === 'stars' ? 'stars' : 'bar') as 'bar' | 'stars',
    }),
    ({ score, style }) => {
      // —— 星级外观 ——
      if (style === 'stars') {
        const filled = score.score === null ? 0 : Math.round(score.score)
        const items = []
        for (let i = 0; i < score.max; i += 1) {
          items.push(
            h(
              'span',
              { class: ['stars__item', i < filled ? 'stars__item--on' : ''], key: i },
              '★',
            ),
          )
        }

        return h('div', { class: 'score-line' }, [
          score.label ? h('span', { class: 'score__label' }, score.label) : null,
          h(
            'div',
            { class: 'stars', role: 'img', 'aria-label': `${score.score ?? 0}/${score.max}` },
            items,
          ),
        ])
      }

      // —— 进度条外观（默认） ——
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
    },
  ),
  isEmpty: (data) => readScore(data).score === null,
}

registerModule(definition as AnyModuleDefinition)

export default definition
