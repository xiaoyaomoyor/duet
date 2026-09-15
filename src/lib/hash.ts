/**
 * 内容哈希（纯函数边界，仅依赖 WebCrypto）
 *
 * 用途：资源 id = 内容哈希 → 同一份文件重复导入天然去重（§6.2 约束 1）。
 */

import { attemptAsync, type Result } from './result'

/** 计算 Blob 的 sha-256，取前 16 字节 hex 作为资源 id */
export async function hashBlob(blob: Blob): Promise<Result<string, string>> {
  return attemptAsync(
    async () => {
      const buffer = await blob.arrayBuffer()
      return hashBuffer(buffer)
    },
    (e) => `计算内容哈希失败：${describeError(e)}`,
  )
}

/** 计算 ArrayBuffer 的 sha-256（前 16 字节 hex） */
export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    // 极端降级：非加密哈希，仅用于去重，不用于安全用途
    return fallbackHash(new Uint8Array(buffer))
  }

  const digest = await subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(digest).subarray(0, 16)
  return toHex(bytes)
}

/** 字符串哈希（用于生成确定性的 id / 颜色索引，非安全用途） */
export async function hashString(input: string): Promise<string> {
  return hashBuffer(new TextEncoder().encode(input).buffer as ArrayBuffer)
}

/**
 * 确定性 32 位哈希（FNV-1a 变体）。
 * 用于程序化图标配色等"同名同色"的场景，同步、无需 WebCrypto。
 */
export function hashInt(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * 内容指纹：判断"这份数据是否变了"（渲染 key、脏检查等）。
 *
 * 为什么不用 crypto.subtle：它是异步的，而渲染期需要同步拿到稳定字符串。
 * 这里只要求"内容变则指纹变"，不要求抗碰撞强度，32 位哈希足够。
 * 无法序列化时返回固定标记，调用方自行容错。
 */
export function contentStamp(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value ?? null) ?? 'null'
  } catch {
    return 'unserializable'
  }
  return `${json.length.toString(36)}-${hashInt(json).toString(36)}`
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function fallbackHash(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0
    h1 = Math.imul(h1 ^ b, 0x01000193)
    h2 = Math.imul(h2 + b + i, 0x85ebca6b)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
