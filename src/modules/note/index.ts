/**
 * 备注模块
 *
 * 用途：给某个模块/某一方加一句"人话"结论，例如
 * "音色更干净但副歌略平"、"整体可用，细节偏糊"。
 * 与"文字"模块的区别：备注是**短句 + 语气色**，用于快速标注判断，
 * 而文字模块是可长可短的正文。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer } from '../shared/inline'
import { isBlankText } from '../shared/guards'

export interface NoteData {
  text: string
  tone: 'neutral' | 'good' | 'warn' | 'bad'
}

const TONE_CLASS: Record<NoteData['tone'], string> = {
  neutral: 'note--neutral',
  good: 'note--good',
  warn: 'note--warn',
  bad: 'note--bad',
}

function readNote(data: unknown): NoteData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<NoteData>
  const tone = record.tone
  return {
    text: typeof record.text === 'string' ? record.text : '',
    tone: tone === 'good' || tone === 'warn' || tone === 'bad' ? tone : 'neutral',
  }
}

const definition: ModuleDefinition<NoteData> = {
  type: 'note',
  meta: { titleKey: 'modules.note', icon: 'comment', category: 'text' },
  schema: {
    create: () => ({ text: '', tone: 'neutral' }),
    isData: (value): value is NoteData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    { key: 'text', type: 'text', labelKey: 'note.text', placeholderKey: 'note.placeholder' },
    {
      key: 'tone',
      type: 'select',
      labelKey: 'note.tone',
      default: 'neutral',
      options: [
        { value: 'neutral', labelKey: 'note.toneNeutral' },
        { value: 'good', labelKey: 'note.toneGood' },
        { value: 'warn', labelKey: 'note.toneWarn' },
        { value: 'bad', labelKey: 'note.toneBad' },
      ],
    },
  ]),
  renderer: createInlineRenderer(readNote, (note) =>
    h('p', { class: ['note', TONE_CLASS[note.tone]] }, note.text),
  ),
  isEmpty: (data) => isBlankText(readNote(data).text),
}

registerModule(definition as AnyModuleDefinition)

export default definition
