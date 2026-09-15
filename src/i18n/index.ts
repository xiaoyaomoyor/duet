import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'
import type { LanguageCode } from '@/types'

/**
 * 国际化（§14.3）
 *
 * - 语言包全量加载（体积可控），切换即时生效、无需刷新。
 * - 内置工具名不翻译；所有 UI 文案必须走 key，禁止模板里写中文字面量。
 */
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: LanguageCode; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/** 切换语言（由 settings store 调用，保证设置与 i18n 同步） */
export function setI18nLocale(locale: LanguageCode): void {
  i18n.global.locale.value = locale
}

/** 当前语言 */
export function currentLocale(): LanguageCode {
  return i18n.global.locale.value as LanguageCode
}
