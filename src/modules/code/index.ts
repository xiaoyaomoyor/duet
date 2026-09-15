/**
 * 代码块模块（M5）
 *
 * 用途：贴一段模型产出的代码/提示词/命令，做并排对照。
 * 典型场景是"GLM vs DeepSeek 建站"——两边各贴一段 HTML 或组件代码。
 *
 * 实现边界（如实说明）：
 *   **不做语法高亮**。零依赖的前提下，为每种语言写一套词法分析器
 *   会让包体积与维护成本失控，而对比场景真正需要的是
 *   "行号对齐 + 等宽排版 + 能横向滚动"，这些都已经有了。
 *   `theme` 只区分"跟随主题"与"提亮底色"两种观感。
 */

import { h } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createFieldEditor, createInlineRenderer } from '../shared/inline'
import { isBlankText } from '../shared/guards'

export interface CodeData {
  code: string
  /** 语言标识（只用于展示与复制时的提示，不做高亮） */
  lang: string
  theme: 'inherit' | 'panel'
}

function readCode(data: unknown): CodeData {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Partial<CodeData>
  return {
    code: typeof record.code === 'string' ? record.code : '',
    lang: typeof record.lang === 'string' ? record.lang : '',
    theme: record.theme === 'panel' ? 'panel' : 'inherit',
  }
}

/** 拆行：与 lib/textDiff 的口径保持一致（空串 = 0 行） */
function toLines(code: string): string[] {
  if (code === '') return []
  return code.replace(/\r\n?/g, '\n').split('\n')
}

const definition: ModuleDefinition<CodeData> = {
  type: 'code',
  meta: {
    titleKey: 'modules.code',
    icon: 'code',
    // 与 modules/meta.ts 的分组保持一致（选择器按 meta.ts 排版，两处不能打架）
    category: 'advanced',
    keywords: ['code', '代码', 'snippet', 'prompt', 'diff', 'glm', 'deepseek'],
  },
  schema: {
    create: (): CodeData => ({ code: '', lang: '', theme: 'inherit' }),
    isData: (value): value is CodeData => typeof value === 'object' && value !== null,
  },
  editor: createFieldEditor([
    {
      key: 'code',
      type: 'textarea',
      labelKey: 'code.content',
      placeholderKey: 'code.placeholder',
      rows: 10,
      mono: true,
    },
    { key: 'lang', type: 'text', labelKey: 'code.lang', placeholderKey: 'code.langPlaceholder' },
    {
      key: 'theme',
      type: 'select',
      labelKey: 'code.theme',
      default: 'inherit',
      options: [
        { value: 'inherit', labelKey: 'code.themeInherit' },
        { value: 'panel', labelKey: 'code.themePanel' },
      ],
    },
  ]),
  renderer: createInlineRenderer(readCode, (code) => {
    const lines = toLines(code.code)

    return h(
      'div',
      { class: ['code-block', code.theme === 'panel' ? 'code-block--panel' : ''] },
      [
        code.lang
          ? h('span', { class: 'code-block__lang' }, code.lang)
          : null,
        h(
          'pre',
          { class: 'code-block__pre' },
          h(
            'code',
            { class: 'code-block__code' },
            lines.map((line, index) =>
              h('span', { class: 'code-block__line', key: index }, [
                // 行号用 aria-hidden：屏幕阅读器读代码时不该把行号念出来
                h('span', { class: 'code-block__no', 'aria-hidden': 'true' }, String(index + 1)),
                h('span', { class: 'code-block__text' }, line === '' ? '\u200b' : line),
              ]),
            ),
          ),
        ),
      ],
    )
  }),
  // 只有空白字符视为未填写（与"文字"模块口径一致）
  isEmpty: (data) => isBlankText(readCode(data).code),
}

registerModule(definition as AnyModuleDefinition)

export default definition
