/**
 * 标签组模块
 *
 * 用途：给一方打关键词标签（"人声清晰" "副歌平" "细节糊"），
 * 适合快速扫读，也是做对比视频时很好用的视觉元素。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer } from '../shared/inline'
import { safeArray } from '../shared/guards'

export interface TagListData {
  /** 用换行分隔的标签（编辑体验比数组友好得多） */
  text: string
  tone: 'neutral' | 'accent' | 'good' | 'warn'
}

const TONE_CLASS: Record<TagListData['tone'], string> = {
  neutral: 'tags--neutral',
  accent: 'tags--accent',
  good: 'tags--good',
  warn: 'tags--warn',
}

function readTags(data: unknown): TagListData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<TagListData>
  const tone = record.tone
  return {
    text: typeof record.text === 'string' ? record.text : '',
    tone: tone === 'accent' || tone === 'good' || tone === 'warn' ? tone : 'neutral',
  }
}

/** 把文本切成标签：支持换行与逗号，自动去空去重 */
export function parseTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,，、;；]/)
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    ),
  )
}

const definition: ModuleDefinition<TagListData> = {
  type: 'tagList',
  meta: { titleKey: 'modules.tagList', icon: 'tag', category: 'data' },
  schema: {
    create: (): TagListData => ({ text: '', tone: 'neutral' }),
    isData: (value): value is TagListData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    {
      key: 'text',
      type: 'textarea',
      labelKey: 'tagList.text',
      placeholderKey: 'tagList.placeholder',
    },
    {
      key: 'tone',
      type: 'select',
      labelKey: 'tagList.tone',
      default: 'neutral',
      options: [
        { value: 'neutral', labelKey: 'tagList.toneNeutral' },
        { value: 'accent', labelKey: 'tagList.toneAccent' },
        { value: 'good', labelKey: 'tagList.toneGood' },
        { value: 'warn', labelKey: 'tagList.toneWarn' },
      ],
    },
  ]),
  renderer: createInlineRenderer(readTags, (tags) =>
    h(
      'div',
      { class: ['tags', TONE_CLASS[tags.tone]] },
      safeArray<string>(parseTags(tags.text)).map((tag, index) =>
        h(
          'span',
          {
            class: 'tags__item',
            key: tag,
            // 逐个弹出（A11）：用 CSS 变量传序号，避免为每个标签生成一条规则
            style: { animationDelay: `${Math.min(index, 8) * 40}ms` },
          },
          tag,
        ),
      ),
    ),
  ),
  isEmpty: (data) => parseTags(readTags(data).text).length === 0,
}

registerModule(definition as AnyModuleDefinition)

export default definition
