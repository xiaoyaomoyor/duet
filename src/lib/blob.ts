/**
 * Blob ↔ data URI 互转
 *
 * 用途：
 *   - `.duet` 工程文件内嵌媒体（§6.4）
 *   - 只读 HTML 导出内嵌媒体（§8.7）
 *   - 导出长图前把外链图片内联，避免 canvas 被跨域污染（§8.6）
 *
 * 纪律：**大文件不要无条件内嵌**。base64 会让体积膨胀约 33%，
 * 因此调用方必须先做体积判断（见 shouldEmbed）。
 */

import { err, ok, type Result } from './result'

/** 内嵌媒体的建议体积上限（单个文件） */
export const EMBED_SIZE_LIMIT = 20 * 1024 * 1024

/** 该体积是否适合内嵌 */
export function shouldEmbed(size: number, limit = EMBED_SIZE_LIMIT): boolean {
  return size > 0 && size <= limit
}

/** Blob → data URI */
export function blobToDataUrl(blob: Blob): Promise<Result<string, string>> {
  // 防御：某些环境（如测试用的 fake-indexeddb）读回的对象不是真正的 Blob，
  // 此时 FileReader 会直接抛 TypeError。这里先转换成标准 Blob。
  const normalized = toStandardBlob(blob)
  if (!normalized.ok) return Promise.resolve(normalized)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(ok(result))
      else resolve(err('读取文件失败：结果不是字符串'))
    }
    reader.onerror = () => resolve(err('读取文件失败'))
    reader.readAsDataURL(normalized.value)
  })
}

/**
 * 把任意"类 Blob"值规整成标准 Blob。
 *
 * 为什么要这一步：IndexedDB 的读取结果在某些实现（含测试环境的 fake-indexeddb）
 * 中会退化为普通对象（ArrayBuffer/类型化数组被结构化克隆后不再是 Blob）。
 * 与其在调用处到处判断，不如在这里收敛。
 */
export function toStandardBlob(value: unknown): Result<Blob, string> {
  if (isBlobLike(value)) return ok(value)

  if (value instanceof ArrayBuffer) return ok(new Blob([value]))
  if (ArrayBuffer.isView(value)) {
    return ok(new Blob([copyBytes(value)]))
  }

  // 退化的普通对象：尝试从常见字段里捞出数据
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const data = record.data ?? record.buffer ?? record.bytes
    if (data instanceof ArrayBuffer) return ok(new Blob([data]))
    if (ArrayBuffer.isView(data)) return ok(new Blob([copyBytes(data)]))
    if (Array.isArray(data)) return ok(new Blob([new Uint8Array(data)]))
  }

  return err('读取文件失败：拿到的不是二进制数据（可能是存储实现不支持 Blob）')
}

/** 复制一份精确切片（避免 SharedArrayBuffer 与越界视图带来的类型/语义问题） */
function copyBytes(view: ArrayBufferView): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength)
  copy.set(new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength))
  // 取底层 buffer：TS 5.7+ 下 Uint8Array<ArrayBufferLike> 不能直接当 BlobPart
  return copy.buffer
}

function isBlobLike(value: unknown): value is Blob {
  if (value instanceof Blob) return true
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Blob
  return typeof candidate.arrayBuffer === 'function' && typeof candidate.size === 'number'
}

/** data URI → Blob（附带 MIME 解析） */
export function dataUrlToBlob(dataUrl: string): Result<Blob, string> {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return err('不是合法的 data URI')

  const header = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)

  if (!header.startsWith('data:')) return err('不是合法的 data URI')

  const isBase64 = header.includes(';base64')
  const mime = header.slice(5).split(';')[0] || 'application/octet-stream'

  try {
    if (isBase64) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return ok(new Blob([bytes], { type: mime }))
    }
    // 非 base64 的 data URI（文本/URI 编码）
    return ok(new Blob([decodeURIComponent(payload)], { type: mime }))
  } catch (error) {
    return err(`解析 data URI 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 粗略估算 data URI 的字节数（避免为了测体积而解码整个字符串） */
export function estimateDataUrlSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return 0
  const payload = dataUrl.length - commaIndex - 1
  return dataUrl.includes(';base64') ? Math.floor((payload * 3) / 4) : payload
}
