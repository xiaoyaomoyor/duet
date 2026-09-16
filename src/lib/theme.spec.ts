/**
 * 主题解析单测
 *
 * 这一层的风险不在"颜色对不对"，而在**解析与订阅**：
 *   - `system` 必须被解析成具体主题再写进 data-theme，
 *     否则 CSS 里得认识"系统"这个概念（而 CSS 不可能认识）
 *   - 只有处于 system 时才该监听系统变化，选定具体主题后必须摘掉监听
 *   - 首帧镜像必须写对，否则刷新时会闪一下错误底色
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetThemeForTests,
  applyTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_MIRROR_KEY,
} from './theme'

// ——————————————————————————————————————————————————————————
// 可控的 matchMedia 桩
// ——————————————————————————————————————————————————————————

type Listener = (event: MediaQueryListEvent) => void

let prefersDark = true
let listeners: Listener[] = []
let addCount = 0
let removeCount = 0

function installMatchMedia(): void {
  listeners = []
  addCount = 0
  removeCount = 0
  prefersDark = true

  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('prefers-color-scheme: dark') ? prefersDark : false
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: Listener) => {
      addCount += 1
      listeners.push(listener)
    },
    removeEventListener: (_type: string, listener: Listener) => {
      removeCount += 1
      listeners = listeners.filter((item) => item !== listener)
    },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

/** 模拟用户切换系统深浅色 */
function switchSystem(nextDark: boolean): void {
  prefersDark = nextDark
  for (const listener of [...listeners]) {
    listener({ matches: nextDark } as MediaQueryListEvent)
  }
}

beforeEach(() => {
  // 必须先清模块级监听器状态：它是刻意的单例，但会跨用例污染
  __resetThemeForTests()
  installMatchMedia()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  __resetThemeForTests()
  listeners = []
})

describe('resolveTheme', () => {
  it('具体主题原样返回', () => {
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('violet-dark')).toBe('violet-dark')
  })

  it('system 在系统偏好暗色时解析为 dark', () => {
    prefersDark = true
    expect(resolveTheme('system')).toBe('dark')
  })

  it('system 在系统偏好亮色时解析为 light', () => {
    prefersDark = false
    expect(resolveTheme('system')).toBe('light')
  })

  it('systemPrefersDark 反映 matchMedia 的结果', () => {
    prefersDark = true
    expect(systemPrefersDark()).toBe(true)
    prefersDark = false
    expect(systemPrefersDark()).toBe(false)
  })
})

describe('applyTheme', () => {
  it('写入 data-theme 的是解析后的具体主题，而不是 system', () => {
    prefersDark = false
    applyTheme('system')
    // CSS 只认识具体主题；写 'system' 会让 :root[data-theme='system'] 匹配不到任何块
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('color-scheme 跟随主题的明暗（影响滚动条与原生控件）', () => {
    applyTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    applyTheme('violet-dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('处于 system 时订阅系统变化，并随之重绘', () => {
    applyTheme('system')
    expect(addCount).toBe(1)

    switchSystem(false)
    expect(document.documentElement.dataset.theme).toBe('light')

    switchSystem(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('选定具体主题后不再监听系统变化（用户选择优先于系统）', () => {
    applyTheme('system')
    expect(addCount).toBe(1)

    applyTheme('violet-dark')
    // 必须摘掉：否则系统一切换就会把用户明确选的主题顶掉
    expect(removeCount).toBe(1)

    switchSystem(false)
    expect(document.documentElement.dataset.theme).toBe('violet-dark')
  })

  it('反复应用同一具体主题不会堆积监听器', () => {
    applyTheme('dark')
    applyTheme('dark')
    applyTheme('dark')
    expect(addCount).toBe(0)
    expect(removeCount).toBe(0)
  })

  it('写入首帧镜像（index.html 的内联脚本靠它避免闪色）', () => {
    applyTheme('light')
    expect(window.localStorage.getItem(THEME_MIRROR_KEY)).toBe('light')

    // 镜像里存的是**用户的选择**，system 也照存——
    // 内联脚本拿到 'system' 时会自己按系统偏好解析
    applyTheme('system')
    expect(window.localStorage.getItem(THEME_MIRROR_KEY)).toBe('system')
  })

  it('localStorage 不可用时不抛异常（隐私模式）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => applyTheme('light')).not.toThrow()
    // 主题本身仍然生效，只是首帧镜像丢了
    expect(document.documentElement.dataset.theme).toBe('light')

    spy.mockRestore()
  })
})
