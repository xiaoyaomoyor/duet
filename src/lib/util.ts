/**
 * 通用小工具（纯函数 / 轻量封装）
 */

/**
 * 尾沿防抖。
 * 用于自动保存：连续编辑只在停止后落盘一次（§17 M2-8）。
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { flush: () => void; cancel: () => void; pending: () => boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A | null = null

  const invoke = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!lastArgs) return
    const args = lastArgs
    lastArgs = null
    fn(...args)
  }

  const debounced = (...args: A): void => {
    lastArgs = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(invoke, waitMs)
  }

  debounced.flush = (): void => {
    if (timer !== null || lastArgs) invoke()
  }

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  debounced.pending = (): boolean => timer !== null

  return debounced
}

/** 空闲时执行；不支持 requestIdleCallback 的环境降级为 setTimeout */
export function onIdle(fn: () => void, timeoutMs = 2000): void {
  const idle = (
    globalThis as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
  ).requestIdleCallback

  if (typeof idle === 'function') {
    idle(fn, { timeout: timeoutMs })
    return
  }
  setTimeout(fn, 0)
}

/** 把回调绑定到"页面即将隐藏/卸载"事件，返回解绑函数 */
export function onPageExit(handler: () => void): () => void {
  const run = (): void => handler()
  window.addEventListener('beforeunload', run)
  window.addEventListener('pagehide', run)
  document.addEventListener('visibilitychange', run)
  return () => {
    window.removeEventListener('beforeunload', run)
    window.removeEventListener('pagehide', run)
    document.removeEventListener('visibilitychange', run)
  }
}

/** 分组：把数组按 key 归并为 Map（保持插入顺序） */
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/** 把 Map 转为按既定顺序排列的分组数组 */
export function orderGroups<K, V>(
  groups: Map<K, V[]>,
  order: readonly K[],
): Array<{ key: K; items: V[] }> {
  const result: Array<{ key: K; items: V[] }> = []
  for (const key of order) {
    const items = groups.get(key)
    if (items && items.length > 0) result.push({ key, items })
  }
  return result
}
