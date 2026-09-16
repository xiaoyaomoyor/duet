/**
 * 主题应用（纯 DOM 副作用，无持久化）
 *
 * 职责边界：
 *   - 本模块只负责把"主题设置"映射到 <html> 上的 data-* 属性与 CSS 变量。
 *   - 持久化与读取由 stores/useSettingsStore 负责（§8.1 单向依赖）。
 */

import { APP } from '@/app.config'
import type { LanguageCode, ResolvedThemeId, ThemeId } from '@/types'

export interface ThemeSettings {
  themeId: ThemeId
  language: LanguageCode
  reducedMotion: 'auto' | 'always' | 'never'
  sidebarWidth: number
}

/**
 * 每种**具体**主题是暗还是亮。
 *
 * 这个映射有两个用途：写 `color-scheme`（决定滚动条、表单控件、
 * 自动填充等浏览器原生 UI 的明暗），以及给 `system` 做解析。
 * `system` 不在这里——它不是一个配色。
 */
const THEME_COLOR_SCHEME: Record<ResolvedThemeId, 'dark' | 'light'> = {
  dark: 'dark',
  light: 'light',
  'violet-dark': 'dark',
}

/** system 模式下，系统处于亮色时落到哪个主题 */
const SYSTEM_LIGHT: ResolvedThemeId = 'light'
/** system 模式下，系统处于暗色时落到哪个主题 */
const SYSTEM_DARK: ResolvedThemeId = 'dark'

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

/** 系统是否偏好暗色；环境不支持 matchMedia 时按暗色处理（应用传统上是暗的） */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 把用户选的主题解析成真正要应用的配色 */
export function resolveTheme(themeId: ThemeId): ResolvedThemeId {
  if (themeId !== 'system') return themeId
  return systemPrefersDark() ? SYSTEM_DARK : SYSTEM_LIGHT
}

/**
 * 当前处于 `system` 时挂上系统主题监听，否则摘掉。
 *
 * 为什么要动态挂摘而不是一直监听：一直监听的话，
 * 用户明确选了"黑"之后系统切到亮色，我们会收到事件却必须忽略它——
 * 留着一条永远被忽略的监听，不如按状态管理。
 */
let mediaQuery: MediaQueryList | null = null
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null

function syncSystemListener(themeId: ThemeId): void {
  if (typeof window === 'undefined' || !window.matchMedia) return

  const shouldListen = themeId === 'system'

  if (shouldListen && !mediaListener) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaListener = () => paint(resolveTheme('system'))
    mediaQuery.addEventListener('change', mediaListener)
    return
  }

  if (!shouldListen && mediaListener) {
    mediaQuery?.removeEventListener('change', mediaListener)
    mediaListener = null
    mediaQuery = null
  }
}

/**
 * 首帧主题镜像用的 localStorage 键。
 *
 * 真源在 IndexedDB 的 settings 里，但那是异步的——
 * 而主题必须在样式表生效前就定下来，否则会有一次白/黑闪烁。
 * 所以这里额外写一份同步可读的**镜像**（index.html 的内联脚本读它）。
 * 镜像丢了也不要紧：首帧会退回"跟随系统"，随后 Vue 起来会纠正。
 */
export const THEME_MIRROR_KEY = `${APP.storagePrefix}:theme`

/** 与 index.html 内联脚本共用的解析规则（改这里必须同步改 index.html） */
function paint(resolved: ResolvedThemeId): void {
  const el = root()
  if (!el) return
  el.dataset.theme = resolved
  el.style.colorScheme = THEME_COLOR_SCHEME[resolved]
}

/** 写入首帧镜像；localStorage 不可用（隐私模式）时静默跳过 */
function writeMirror(themeId: ThemeId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_MIRROR_KEY, themeId)
  } catch {
    // 隐私模式 / 配额满：首帧会退回跟随系统，不影响功能
  }
}

/** 写入 <html lang>：影响字体回退、连字与无障碍朗读 */
export function applyLanguage(language: LanguageCode): void {
  const el = root()
  if (!el) return
  el.setAttribute('lang', language)
}

/**
 * 应用主题。
 *
 * 注意写到 `data-theme` 上的永远是**解析后**的具体主题，
 * 而不是 `system`——CSS 里因此不需要知道"系统"这个概念，
 * 只要为每个具体主题写一套 token 即可。
 */
export function applyTheme(themeId: ThemeId): void {
  paint(resolveTheme(themeId))
  syncSystemListener(themeId)
  writeMirror(themeId)
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

/**
 * 一次性应用全部主题相关设置
 */
export function applyThemeSettings(settings: ThemeSettings): void {
  applyTheme(settings.themeId)
  applyLanguage(settings.language)
  applyReducedMotion(settings.reducedMotion)
  applySidebarWidth(settings.sidebarWidth)
}

/**
 * 测试专用：清掉模块级的监听器状态。
 *
 * 这些状态是**刻意的单例**（真实运行时 applyTheme 会被反复调用，
 * 必须记住当前是否已订阅），但单测之间会互相污染：
 * 前一个用例订阅过之后，后一个用例看到的初始状态就不再是"未订阅"。
 */
export function __resetThemeForTests(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
  }
  mediaQuery = null
  mediaListener = null
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
