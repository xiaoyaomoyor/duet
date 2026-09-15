/// <reference types="vitest/globals" />

/**
 * 单元测试环境准备
 *
 * - 注入 fake-indexeddb：让 db 层测试无需真实浏览器
 * - 补齐 jsdom 缺失的浏览器 API（matchMedia / ResizeObserver / crypto.subtle）
 */
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { beforeEach, vi } from 'vitest'

// jsdom 未实现 matchMedia，主题相关代码会用到
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom 未实现 ResizeObserver（拖拽、虚拟滚动会用到）
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}

// jsdom 的 crypto 可能缺少 subtle（内容哈希测试依赖）
// 说明：直接整体替换为 Node 的 WebCrypto 实现，避免类型体操与类型不兼容
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto as unknown as Crypto,
    configurable: true,
  })
}

// 每个测试用例前清理 DOM 与 mock，避免用例间串扰
beforeEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
