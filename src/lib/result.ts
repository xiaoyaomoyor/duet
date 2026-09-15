/**
 * 显式结果类型：用于所有"可能失败且失败原因需要被 UI 呈现"的边界
 * （媒体导入、外链抓取、工程文件解析）。
 *
 * 纪律：这些边界禁止抛异常后静默吞掉（§8.5、§18 K3）。
 */

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok
}

/** 取值或默认值 */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback
}

/** 提取错误信息（失败时返回 null） */
export function errorOf<T, E>(r: Result<T, E>): E | null {
  return r.ok ? null : r.error
}

/**
 * 把一次可能抛异常的同步调用收敛为 Result。
 * 用在 WebCrypto / IndexedDB / 媒体解码这类会 throw 的 API 边界。
 */
export function attempt<T>(fn: () => T, onError: (e: unknown) => string): Result<T, string> {
  try {
    return ok(fn())
  } catch (e) {
    return err(onError(e))
  }
}

/** 同上的异步版本 */
export async function attemptAsync<T>(
  fn: () => Promise<T>,
  onError: (e: unknown) => string,
): Promise<Result<T, string>> {
  try {
    return ok(await fn())
  } catch (e) {
    return err(onError(e))
  }
}
