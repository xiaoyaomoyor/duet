/**
 * 主题应用（纯 DOM 副作用，无持久化）
 *
 * 职责边界：
 *   - 本模块只负责把"主题设置"映射到 <html> 上的 data-* 属性与 CSS 变量。
 *   - 持久化与读取由 stores/useSettingsStore 负责（§8.1 单向依赖）。
 */

import type { LanguageCode, ThemeId } from '@/types'

export interface ThemeSettings {
  themeId: ThemeId
  language: LanguageCode
  reducedMotion: 'auto' | 'always' | 'never'
  sidebarWidth: number
}

/** 每种主题对应的 <html lang> 之外的元信息（如 color-scheme） */
const THEME_COLOR_SCHEME: Record<ThemeId, 'dark' | 'light'> = {
  'violet-dark': 'dark',
}

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

/** 写入 <html lang>：影响字体回退、连字与无障碍朗读 */
export function applyLanguage(language: LanguageCode): void {
  const el = root()
  if (!el) return
  el.setAttribute('lang', language)
}

/** 应用主题 id（对应 tokens.css 中的 :root[data-theme='...'] 块） */
export function applyTheme(themeId: ThemeId): void {
  const el = root()
  if (!el) return
  el.dataset.theme = themeId
  el.style.colorScheme = THEME_COLOR_SCHEME[themeId]
}

/**
 * 动效强度：
 *   auto   → 交给 CSS 的 @media (prefers-reduced-motion) 处理
 *   always → 强制关闭动效（写入 data-reduced-motion="always"）
 *   never  → 用户明确要求保留动效（移除该属性）
 */
export function applyReducedMotion(mode: ThemeSettings['reducedMotion']): void {
  const el = root()
  if (!el) return
  if (mode === 'always') {
    el.dataset.reducedMotion = 'always'
  } else {
    delete el.dataset.reducedMotion
  }
}

/** 侧栏宽度：写入 CSS 变量，组件侧直接读 var(--size-sidebar) */
export function applySidebarWidth(width: number): void {
  const el = root()
  if (!el) return
  el.style.setProperty('--size-sidebar', `${Math.round(width)}px`)
}

/** 一次性应用全部主题相关设置 */
export function applyThemeSettings(settings: ThemeSettings): void {
  applyTheme(settings.themeId)
  applyLanguage(settings.language)
  applyReducedMotion(settings.reducedMotion)
  applySidebarWidth(settings.sidebarWidth)
}

/** 平台标记：用于 CSS 与逻辑区分 Web / Tauri 桌面端 */
export function applyPlatformFlags(): void {
  const el = root()
  if (!el) return

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

  el.dataset.platform = isTauri ? 'desktop' : 'web'
}
