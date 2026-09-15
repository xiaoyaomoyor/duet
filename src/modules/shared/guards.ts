/**
 * 模块判定助手（防御式）
 *
 * 背景：`isEmpty` / `isPresentable` 会在**渲染期**被调用，而渲染期拿到的 data 可能是：
 *   - 刚创建、还没写入内容的 `{}`
 *   - 旧版本工程文件留下的、缺少新字段的对象
 *   - 用户手改过 JSON 的残缺数据
 *
 * 因此模块的 isEmpty **不允许假定字段存在**。早期写法 `data.text.trim()`
 * 在 data 为 `{}` 时直接抛 TypeError，整个展示视图白屏——
 * 这类崩溃的代价远高于"少显示一个模块"，所以这里统一提供安全取值。
 */

/** 安全取字符串：非字符串一律视为空串 */
export function safeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 安全判空：非字符串、纯空白都算"未填写" */
export function isBlankText(value: unknown): boolean {
  return safeText(value).trim() === ''
}

/** 安全取非空字符串 */
export function safeNonEmpty(value: unknown): string | undefined {
  const text = safeText(value).trim()
  return text === '' ? undefined : text
}

/** 安全取数字：非法值返回 undefined */
export function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 安全取布尔：只有显式 false 才算 false */
export function safeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 安全取数组 */
export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** 安全取对象 */
export function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
