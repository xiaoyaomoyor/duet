/**
 * ID3v2 标签解析（纯函数，零依赖）
 *
 * 只做一件事：**从 MP3 里取出内嵌封面**。
 *
 * 为什么需要它：用户导入带封面的 mp3 时，期望看到那张封面——
 * 这是音乐对比场景里最直观的辨识信息（一眼分清哪首是哪首）。
 * 浏览器不会把 ID3 封面当作"音频的 poster"暴露出来，必须自己解。
 *
 * 为什么只支持 ID3v2（不支持 ID3v1）：v1 根本没有图片帧，
 * 而 v2 是 1998 年之后的事实标准，Suno 等平台导出的文件都带 v2.3/v2.4。
 *
 * 明确不做：文本帧（标题/艺术家/专辑）。
 * 本应用里"这是什么"由用户自己填的名称决定，
 * 自动抓 ID3 标题反而会覆盖用户意图。少做一点，行为更可预期。
 */

/** 一张内嵌图片 */
export interface Id3Picture {
  /** 图片 MIME，如 image/jpeg */
  mime: string
  /**
   * 图片字节。
   *
   * 显式写成 `Uint8Array<ArrayBuffer>`（而不是默认的 `ArrayBufferLike`）：
   * 后者可能是 SharedArrayBuffer，无法作为 `BlobPart` 传给 Blob 构造函数。
   * 类型上收窄在这里，调用方就不必到处做断言。
   */
  data: Uint8Array<ArrayBuffer>
}

/** ID3v2 头部固定 10 字节 */
const HEADER_SIZE = 10
/** 帧头固定 10 字节 */
const FRAME_HEADER_SIZE = 10

/**
 * ID3v2 的长度字段是 **synchsafe** 整数：
 * 每字节只用低 7 位，最高位恒为 0（这样长度里不会出现看起来像帧同步字的字节）。
 * 用普通 int 解析会得到完全错误的数值，这是实现 ID3 最常见的坑。
 */
function readSynchsafe(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  )
}

/** 该缓冲区是否是 ID3v2 标签 */
export function hasId3(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false
  const bytes = new Uint8Array(buffer, 0, 3)
  return bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 // "ID3"
}

/**
 * 读取 ID3v2 标签声明的总长度（不含头部 10 字节）。
 *
 * 存在的意义：调用方可以据此**只切出标签那一段**来解析，
 * 而不必把整首歌读进内存——一首 10MB 的 mp3 里标签通常只有几十 KB。
 *
 * @returns 标签体长度；不是 ID3v2 或数据过短时返回 0
 */
export function readId3TagSize(buffer: ArrayBuffer): number {
  if (!hasId3(buffer)) return 0
  return readSynchsafe(new DataView(buffer), 6)
}

/** 在 ID3v2 文本帧里找字符串终止符（编码不同，终止符宽度不同） */
function encodingTerminator(encoding: number): number {
  // 0 = ISO-8859-1, 3 = UTF-8：单字节 0x00 结尾
  // 1 = UTF-16 with BOM, 2 = UTF-16BE：双字节 0x00 0x00 结尾
  return encoding === 1 || encoding === 2 ? 2 : 1
}

/**
 * 从音频数据里取出内嵌封面。
 *
 * @returns 找到则返回图片（含 MIME 与字节），否则返回 null。
 *          任何结构异常都返回 null——封面是锦上添花，
 *          不该因为它让整个导入流程失败。
 */
export function parseId3Cover(buffer: ArrayBuffer): Id3Picture | null {
  try {
    return extract(buffer)
  } catch {
    // 结构异常的标签一律当作"没有封面"
    return null
  }
}

function extract(buffer: ArrayBuffer): Id3Picture | null {
  if (!hasId3(buffer)) return null

  const view = new DataView(buffer)
  const majorVersion = view.getUint8(3)

  // v2.2 的帧头是 6 字节、帧 id 是 3 字符（"PIC" 而不是 "APIC"）。
  // 这个版本早已淘汰，明确不支持而不是猜着解。
  if (majorVersion < 3) return null

  const flags = view.getUint8(5)
  const tagSize = readSynchsafe(view, 6)

  // 标签总长度加上头部，且不能超过缓冲区
  let cursor = HEADER_SIZE
  const tagEnd = Math.min(HEADER_SIZE + tagSize, buffer.byteLength)

  // 扩展头（仅 v2.4 常见）：跳过它再开始读帧
  if ((flags & 0x40) !== 0) {
    const extSize = readSynchsafe(view, cursor)
    cursor += extSize > 0 ? extSize : 6
  }

  while (cursor + FRAME_HEADER_SIZE <= tagEnd) {
    const frameId = String.fromCharCode(
      view.getUint8(cursor),
      view.getUint8(cursor + 1),
      view.getUint8(cursor + 2),
      view.getUint8(cursor + 3),
    )

    // 全 0 的帧 id 表示"后面是填充字节"，可以停了
    if (frameId.charCodeAt(0) === 0) break

    // v2.4 的帧长也是 synchsafe；v2.3 是普通 big-endian uint32。
    // 混用会让游标错位，读出乱七八糟的"图片"。
    const frameSize =
      majorVersion === 4 ? readSynchsafe(view, cursor + 4) : view.getUint32(cursor + 4)

    const frameStart = cursor + FRAME_HEADER_SIZE
    const frameEnd = frameStart + frameSize
    if (frameSize <= 0 || frameEnd > tagEnd) break

    if (frameId === 'APIC') {
      const picture = readApic(view, frameStart, frameEnd)
      if (picture) return picture
    }

    cursor = frameEnd
  }

  return null
}

/** 解析 APIC 帧：编码(1) + MIME(以 0 结尾) + 图片类型(1) + 描述(以 0 结尾) + 图片数据 */
function readApic(view: DataView, start: number, end: number): Id3Picture | null {
  if (start >= end) return null

  const encoding = view.getUint8(start)
  let cursor = start + 1

  // MIME 串：始终是 ISO-8859-1（与 encoding 无关），以 0x00 结尾
  const mimeStart = cursor
  while (cursor < end && view.getUint8(cursor) !== 0) cursor += 1
  if (cursor >= end) return null

  const mime = String.fromCharCode(
    ...new Uint8Array(view.buffer, view.byteOffset + mimeStart, cursor - mimeStart),
  )
  cursor += 1 // 跳过 MIME 的终止符

  // 图片类型（0x03 = 封面正面），本应用不看它，跳过
  cursor += 1

  // 描述串：按 encoding 决定终止符宽度
  const terminator = encodingTerminator(encoding)
  if (terminator === 2) {
    while (cursor + 1 < end && !(view.getUint8(cursor) === 0 && view.getUint8(cursor + 1) === 0)) {
      cursor += 2
    }
    cursor += 2
  } else {
    while (cursor < end && view.getUint8(cursor) !== 0) cursor += 1
    cursor += 1
  }

  if (cursor >= end) return null

  const data = new Uint8Array(view.buffer, view.byteOffset + cursor, end - cursor)

  // 空图片或 mime 明显不对时当作没有：宁可没有封面，也不要塞一个坏 blob 进库
  if (data.byteLength === 0) return null
  if (!mime.startsWith('image/')) return null

  /*
   * 拷贝一份，而不是直接返回上面那个视图。
   *
   * 两个原因：
   *   1. 视图会把整个源 buffer（可能是十几 MB 的整首歌）钉在内存里
   *   2. `new Uint8Array(buffer, offset, len)` 的类型是 Uint8Array<ArrayBufferLike>，
   *      不能直接作为 BlobPart（TS 会报 SharedArrayBuffer 不兼容）。
   *      按长度重新构造得到的是 Uint8Array<ArrayBuffer>，两件事一起解决。
   */
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)

  return { mime, data: copy }
}
