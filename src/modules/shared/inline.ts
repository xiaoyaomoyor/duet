/**
 * 简易模块助手（给"只有几个输入框"的模块用）
 *
 * 动机（这是个真实的效率问题）：
 *   模块目录的标准结构是 index.ts + XxxEditor.vue + XxxRenderer.vue。
 *   对 text/cover/audio 这类复杂模块这是对的；但对"星级""备注""占位块"
 *   这种只有一两个输入框的模块，三个文件、上百行模板是纯负担，
 *   会让"再加一个小模块"这件事越来越慢。
 *
 *   因此这里提供两个基于渲染函数的工厂：**不写模板、不写样式**，
 *   一个文件就能定义完整模块。复杂模块继续走 SFC。
 *
 * 纪律：助手只负责"输入/输出"，数据校验与 isEmpty 仍由模块自己给，
 * 不允许把业务语义藏进助手。
 */

import { h, type Component, type VNode } from 'vue'
import type { ModuleEditorProps, ModuleRendererProps } from '@/modules/types'
import { t as translate } from '@/i18n/helper'
import { safeNumber } from './guards'

/** 编辑器字段描述 */
export interface FieldSpec {
  key: string
  type: 'text' | 'number' | 'textarea' | 'checkbox' | 'select'
  labelKey: string
  placeholderKey?: string
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string | number; labelKey: string }>
  /** 默认值（写入 data） */
  default?: unknown
  /** textarea 的行数（代码类字段需要比默认的 3 行高得多） */
  rows?: number
  /** 用等宽字体（代码、提示词、命令） */
  mono?: boolean
}

interface FieldContext {
  module: ModuleEditorProps['module']
  sideId: string
  readonly: boolean
  patchData: ModuleEditorProps['patchData']
}

/**
 * 由字段描述生成编辑器组件。
 *
 * 为什么可以直接操作 `module.data`：`module` 是响应式的模块对象，
 * 写入它等价于 patchData（命令层会自动收口并触发保存）。
 * 这里仍优先走 patchData，保证"所有写入都经命令层"这条纪律不被绕过。
 */
export function createFieldEditor(fields: readonly FieldSpec[]): Component {
  /**
   * 说明：这里用 `as unknown as Component` 而不是让 TS 逐项推导。
   * 原因是运行时 props 声明（`{ type: Object, required: true }`）与
   * `setup` 里手写的参数类型无法自动对齐——TS 会要求 setup 的参数
   * 严格等于 `LooseRequired<any>`，而那样写会丢掉我们自己的类型信息。
   * 真正的类型安全由调用方保证：模块定义里的 editor 会被
   * ModuleDefinition 约束，且模板里传的 props 由 ModuleCard 统一提供。
   */
  return {
    name: 'InlineFieldEditor',
    props: {
      module: { type: Object, required: true },
      sideId: { type: String, required: true },
      readonly: { type: Boolean, default: false },
      patchData: { type: Function, required: true },
      patchProps: { type: Function, required: true },
    },
    setup(props: FieldContext): () => VNode {
      const read = (key: string): unknown =>
        (props.module.data as Record<string, unknown> | undefined)?.[key]

      const write = (key: string, value: unknown): void => {
        props.patchData({ [key]: value })
      }

      return () =>
        h(
          'div',
          { class: 'inline-editor' },
          fields.map((field) => {
            const value = read(field.key) ?? field.default

            if (field.type === 'checkbox') {
              return h('label', { class: 'inline-editor__row', key: field.key }, [
                h('input', {
                  type: 'checkbox',
                  checked: value === true,
                  disabled: props.readonly,
                  onChange: (event: Event) =>
                    write(field.key, (event.target as HTMLInputElement).checked),
                }),
                h('span', labelOf(field)),
              ])
            }

            if (field.type === 'select') {
              return h('label', { class: 'inline-editor__row', key: field.key }, [
                h('span', labelOf(field)),
                h(
                  'select',
                  {
                    class: 'inline-editor__control',
                    disabled: props.readonly,
                    value: String(value ?? ''),
                    onChange: (event: Event) => {
                      const raw = (event.target as HTMLSelectElement).value
                      const match = field.options?.find((option) => String(option.value) === raw)
                      write(field.key, match ? match.value : raw)
                    },
                  },
                  (field.options ?? []).map((option) =>
                    h('option', { value: String(option.value) }, translate(option.labelKey)),
                  ),
                ),
              ])
            }

            if (field.type === 'textarea') {
              return h('label', { class: 'inline-editor__field', key: field.key }, [
                h('span', labelOf(field)),
                h('textarea', {
                  key: field.key,
                  class: ['inline-editor__area', field.mono ? 'inline-editor__area--mono' : ''],
                  rows: field.rows ?? 3,
                  disabled: props.readonly,
                  placeholder: field.placeholderKey ? translate(field.placeholderKey) : '',
                  value: typeof value === 'string' ? value : '',
                  onInput: (event: Event) =>
                    write(field.key, (event.target as HTMLTextAreaElement).value),
                }),
              ])
            }

            return h('label', { class: 'inline-editor__field', key: field.key }, [
              h('span', labelOf(field)),
              h('input', {
                key: field.key,
                class: 'inline-editor__control',
                type: field.type === 'number' ? 'number' : 'text',
                min: field.min,
                max: field.max,
                step: field.step ?? 1,
                disabled: props.readonly,
                placeholder: field.placeholderKey ? translate(field.placeholderKey) : '',
                value:
                  field.type === 'number'
                    ? String(value ?? '')
                    : typeof value === 'string'
                      ? value
                      : '',
                onInput: (event: Event) => {
                  const raw = (event.target as HTMLInputElement).value
                  write(field.key, field.type === 'number' ? parseNumber(raw) : raw)
                },
              }),
            ])
          }),
        )
    },
  } as unknown as Component
}

/**
 * 由"取值 + 渲染"生成渲染器组件。
 *
 * render 返回 VNode 数组或单个 VNode；data 已由调用方保证形状安全。
 */
export function createInlineRenderer<T>(
  read: (data: unknown, props: ModuleRendererProps) => T,
  render: (value: T, props: ModuleRendererProps) => VNode | VNode[],
): Component {
  return {
    name: 'InlineRenderer',
    props: {
      module: { type: Object, required: true },
      sideId: { type: String, required: true },
      accent: { type: String, default: '' },
      readonly: { type: Boolean, default: false },
    },
    setup(props: ModuleRendererProps): () => VNode | VNode[] {
      return () => render(read(props.module.data, props), props)
    },
  } as unknown as Component
}

/** 数值安全解析：非法输入归 0（而不是 NaN 污染数据） */
export function parseNumber(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/** 安全取数字（供 isEmpty 与渲染器共用） */
export { safeNumber }

function labelOf(field: FieldSpec): string {
  // 用 i18n helper 而不是宿主组件的 t()：这些组件由渲染函数生成，
  // 没有模板上下文，但文案仍然必须走 i18n key（§14.3）
  return translate(field.labelKey)
}
