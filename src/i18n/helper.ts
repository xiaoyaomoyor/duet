/**
 * i18n 助手（可在组件外使用的轻量封装）
 *
 * 用途：服务层（模板实例化、导出）需要取本地化文案时，
 * 不必依赖组件上下文，直接用这里的 t()。
 *
 * 纪律：UI 文案一律走 key，禁止在 .vue 模板与 .ts 服务中写中文字面量（§14.3）。
 */

import { i18n } from './index'

type MessageParams = Record<string, unknown>

/** 取一条文案；缺少该 key 时返回 key 本身，便于在界面上直接发现漏翻 */
export function t(key: string, params?: MessageParams): string {
  const translate = i18n.global.t as (k: string, p?: MessageParams) => string
  const result = params ? translate(key, params) : translate(key)
  return typeof result === 'string' ? result : key
}

/** 模块的本地化标题（供模块选择器与新建模块时使用） */
export function moduleTitle(type: string): string {
  return t(`modules.${type}`)
}

/** 模板的本地化名称与描述 */
export function templateName(nameKey: string): string {
  return t(nameKey)
}

export function templateDesc(descKey: string): string {
  return t(descKey)
}
