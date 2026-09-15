/**
 * 深拷贝工具（纯函数）
 *
 * 设计取舍：**不依赖 structuredClone**。
 *
 * 原因（已由单测验证）：Node 的 structuredClone 对 jsdom 的 Blob 会**静默返回 `{}`**
 * （不抛错，因此 try/catch 兜不住），而 JSON 往返同样把 Blob 变成 `{}`。
 * 对以媒体为核心的本项目来说，"克隆时静默丢失媒体"是不可接受的失败模式，
 * 因此改为显式语义的递归克隆：
 *
 *   - 普通对象 / 数组 / 纯数据对象 → 深拷贝
 *   - Blob / File / ArrayBuffer / TypedArray → **按引用保留**
 *     （它们本身不可变，按引用即是正确且高效的语义）
 *   - Date / Map / Set / RegExp → 重建实例
 *   - 循环引用 → 用 seen 映射安全处理
 *
 * 领域数据的约束仍然是"只含 JSON 可序列化内容 + 媒体引用"（§6.2 约束 1）。
 */

/** 深拷贝为普通对象，同时剥离 Vue 的响应式 Proxy 包装 */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap()) as T
}

function cloneValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value

  const existing = seen.get(value)
  if (existing !== undefined) return existing

  // —— 宿主对象：按引用保留（不可变，且克隆它们没有意义） ——
  if (isHostObject(value)) return value

  if (Array.isArray(value)) {
    const out: unknown[] = []
    seen.set(value, out)
    for (const item of value) out.push(cloneValue(item, seen))
    return out
  }

  if (value instanceof Date) return new Date(value.getTime())

  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const out = new Map<unknown, unknown>()
    seen.set(value, out)
    for (const [key, item] of value) out.set(cloneValue(key, seen), cloneValue(item, seen))
    return out
  }

  if (value instanceof Set) {
    const out = new Set<unknown>()
    seen.set(value, out)
    for (const item of value) out.add(cloneValue(item, seen))
    return out
  }

  // —— 普通对象：剥离代理，逐键深拷贝 ——
  const out: Record<string, unknown> = {}
  seen.set(value, out)
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneValue(item, seen)
  }
  return out
}

/** 不可变宿主对象与二进制视图：按引用保留 */
function isHostObject(value: object): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (value instanceof ArrayBuffer) return true
  if (ArrayBuffer.isView(value)) return true
  if (value instanceof Error) return true
  return false
}

/**
 * 递归剥离响应式代理（不做深拷贝，仅还原为普通对象）。
 *
 * 关键点：**不得展开非普通对象**。
 * Blob / Date 等宿主对象的自有可枚举属性为空（数据在内部槽里），
 * 一旦按普通对象展开就会变成 `{}` —— 媒体会静默丢失。
 * 本项目在单测中已捕获过这个错误（clone.spec.ts）。
 */
export function toRawDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map((item) => toRawDeep(item)) as unknown as T
  }

  if (isNonPlainObject(value)) return value

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toRawDeep(item)
  }
  return out as T
}

/** 是否为「非普通对象」：原型不是 Object.prototype（或为 null）的一切 */
function isNonPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null
  return proto !== Object.prototype && proto !== null
}

/**
 * 判断两个值在 JSON 语义下是否相等（用于脏检查）。
 * 注意：值为 undefined 的键等同于不存在——这与 JSON.stringify 的行为一致，
 * 因此不会因为一个 undefined 键就误判为"有改动"。
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
