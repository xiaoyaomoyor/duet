/**
 * 时间线模块
 *
 * 用途：对比"生成过程"——每一步的时间点与产物，
 * 例如 "1.2s | 出首帧"、"8s | 完整视频"。
 * 这是"速度对比"最直观的表达，比一个总时长数字有信息量得多。
 *
 * 编辑方式：**每行一个事件**（`时间 | 说明`），
 * 比让用户操作数组友好得多，也天然支持多行粘贴。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer } from '../shared/inline'
import { isBlankText } from '../shared/guards'

export interface TimelineData {
  /** 原始文本，每行一个事件：`时间 | 说明` */
  text: string
}

export interface TimelineEvent {
  at: string
  label: string
}

function readTimeline(data: unknown): TimelineData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<TimelineData>
  return { text: typeof record.text === 'string' ? record.text : '' }
}

/**
 * 把文本切成事件。
 *
 * 容错优先：支持 `1.2s | 出首帧` 与 `1.2s 出首帧` 两种写法，
 * 只有一行文字时也照样显示（at 留空由渲染器补序号）。
 */
export function parseTimelineText(text: string): TimelineEvent[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const pipeIndex = line.indexOf('|')
      if (pipeIndex >= 0) {
        return {
          at: line.slice(0, pipeIndex).trim(),
          label: line.slice(pipeIndex + 1).trim(),
        }
      }
      const match = /^(\S+)\s+(.*)$/.exec(line)
      if (match) return { at: match[1] ?? '', label: (match[2] ?? '').trim() }
      return { at: '', label: line }
    })
}

const definition: ModuleDefinition<TimelineData> = {
  type: 'timeline',
  meta: {
    titleKey: 'modules.timeline',
    icon: 'star',
    category: 'data',
    keywords: ['timeline', '时间线', '过程', '耗时'],
  },
  schema: {
    create: (): TimelineData => ({ text: '' }),
    isData: (value): value is TimelineData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    {
      key: 'text',
      type: 'textarea',
      labelKey: 'timeline.text',
      placeholderKey: 'timeline.placeholder',
    },
  ]),
  renderer: createInlineRenderer(readTimeline, (timeline) =>
    h(
      'ol',
      { class: 'timeline anim-enter-up' },
      parseTimelineText(timeline.text).map((event, index) =>
        h(
          'li',
          {
            class: 'timeline__item',
            key: `${event.at}-${index}`,
            // A10 行交错入场：用内联延迟，避免为每行生成一条 CSS 规则
            style: { animationDelay: `${Math.min(index, 8) * 40}ms` },
          },
          [
            h('span', { class: 'timeline__at' }, event.at || `#${index + 1}`),
            h('span', { class: 'timeline__label' }, event.label),
          ],
        ),
      ),
    ),
  ),
  isEmpty: (data) => isBlankText(readTimeline(data).text),
}

registerModule(definition as AnyModuleDefinition)

export default definition
