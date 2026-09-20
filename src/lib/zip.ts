/** Bounded, uncompressed ZIP32. PNG/audio already compress poorly; no archive extraction to disk. */
export const ZIP_LIMIT = 128 * 1024 * 1024
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true })
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = table[(crc ^ b) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function validName(name: string) {
  return /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*(?:\.[a-zA-Z0-9]+)?$/.test(name)
}
export async function createZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  if (
    files.length > 1024 ||
    new Set(files.map((f) => f.name)).size !== files.length ||
    files.some((f) => !validName(f.name))
  )
    throw new Error('素材包文件列表无效')
  if (files.reduce((n, f) => n + f.blob.size + 128 + f.name.length * 2, 22) > ZIP_LIMIT)
    throw new Error('素材包超过 128 MiB，请拆分项目后导出')
  const parts: BlobPart[] = [],
    directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name),
      bytes = new Uint8Array(await file.blob.arrayBuffer()),
      crc = crc32(bytes)
    const header = new Uint8Array(30 + name.length),
      view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x800, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, bytes.length, true)
    view.setUint32(22, bytes.length, true)
    view.setUint16(26, name.length, true)
    header.set(name, 30)
    const central = new Uint8Array(46 + name.length),
      cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, bytes.length, true)
    cv.setUint32(24, bytes.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    parts.push(header, file.blob)
    directory.push(central)
    offset += header.length + bytes.length
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(
    12,
    directory.reduce((n, b) => n + b.length, 0),
    true,
  )
  ev.setUint32(16, offset, true)
  return new Blob([...parts, ...directory, end], { type: 'application/zip' })
}
export async function readZip(blob: Blob): Promise<Map<string, Blob>> {
  if (blob.size > ZIP_LIMIT || blob.size < 22) throw new Error('素材包大小无效（上限 128 MiB）')
  const buffer = await blob.arrayBuffer(),
    v = new DataView(buffer),
    bytes = new Uint8Array(buffer),
    end = bytes.length - 22
  if (
    v.getUint32(end, true) !== 0x06054b50 ||
    v.getUint16(end + 4, true) ||
    v.getUint16(end + 6, true) ||
    v.getUint16(end + 20, true)
  )
    throw new Error('仅支持 Duet 生成的单卷素材包')
  const count = v.getUint16(end + 10, true),
    directoryStart = v.getUint32(end + 16, true)
  if (
    count > 1024 ||
    count !== v.getUint16(end + 8, true) ||
    directoryStart + v.getUint32(end + 12, true) !== end
  )
    throw new Error('素材包目录损坏')
  const result = new Map<string, Blob>()
  let at = directoryStart,
    nextLocal = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 0x02014b50) throw new Error('素材包目录损坏')
    const length = v.getUint16(at + 28, true),
      size = v.getUint32(at + 24, true),
      local = v.getUint32(at + 42, true),
      crc = v.getUint32(at + 16, true)
    if (
      v.getUint16(at + 8, true) !== 0x800 ||
      v.getUint16(at + 10, true) !== 0 ||
      size !== v.getUint32(at + 20, true) ||
      v.getUint16(at + 30, true) ||
      v.getUint16(at + 32, true) ||
      v.getUint16(at + 34, true) ||
      at + 46 + length > end
    )
      throw new Error('素材包含有不支持的压缩或加密条目')
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + length))
    if (
      !validName(name) ||
      result.has(name) ||
      local !== nextLocal ||
      local + 30 + length + size > directoryStart ||
      v.getUint32(local, true) !== 0x04034b50 ||
      v.getUint16(local + 6, true) !== 0x800 ||
      v.getUint16(local + 8, true) !== 0 ||
      v.getUint32(local + 14, true) !== crc ||
      v.getUint32(local + 18, true) !== size ||
      v.getUint32(local + 22, true) !== size ||
      v.getUint16(local + 26, true) !== length ||
      v.getUint16(local + 28, true) !== 0 ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + length)) !== name
    )
      throw new Error('素材包条目或路径损坏')
    const data = bytes.subarray(local + 30 + length, local + 30 + length + size)
    if (crc32(data) !== crc) throw new Error(`素材包校验失败：${name}`)
    result.set(name, new Blob([data]))
    nextLocal = local + 30 + length + size
    at += 46 + length
  }
  if (at !== end || nextLocal !== directoryStart) throw new Error('素材包存在未登记的数据')
  return result
}
