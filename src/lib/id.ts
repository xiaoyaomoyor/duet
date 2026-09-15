/**
 * ID 生成（纯函数层）
 */

/** 生成一个 uuid v4；不支持 crypto.randomUUID 的环境自动降级 */
export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()

  // 降级实现：使用 getRandomValues 或 Math.random
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40 // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80 // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 短 id，用于行/模块等高频创建的场景（足够避免碰撞，且更省空间） */
export function shortId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10)
  const stamp = Date.now().toString(36).slice(-4)
  return `${prefix}${stamp}${rand}`
}
