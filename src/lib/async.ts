/**
 * 异步小工具
 */

/** 等待若干毫秒 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 轮询等待条件成立。
 * 用于"等待某个异步流程结束"这类场景（如自动保存落盘），
 * 比固定 sleep 更快也更可靠。
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 3000
  const intervalMs = options.intervalMs ?? 10
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (condition()) return true
    await wait(intervalMs)
  }
  return condition()
}
