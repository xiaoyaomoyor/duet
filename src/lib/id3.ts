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

  /*
   * 扩展头（标志位 0x40）。
   *
   * 两个版本的**长度字段编码完全不同**，早先这里对两者都按 synchsafe 读，
   * 结果是：带扩展头的 v2.3 文件整段错位、静默解析失败（用户看到的
   * 就是"Windows 有封面、对奏没有"）。实测合成的 v2.3 EAH 文件复现了它。
   *   v2.4：长度是 synchsafe，且这个值已经覆盖了长度字段自身
   *   v2.3：长度是普通 uint32，且**不含**它自己的 4 个字节
   */
  if ((flags & 0x40) !== 0) {
    if (majorVersion === 4) {
      const extSize = readSynchsafe(view, cursor)
      cursor += extSize > 0 ? extSize : 6
    } else {
      const extSize = view.getUint32(cursor)
      // 明显越界的长度当作坏的扩展头，只跳最小的 6 字节（标志 2 + 填充 4）
      const sane = extSize > 0 && extSize < tagSize
      cursor += sane ? 4 + extSize : 6
    }
  }

  /*
   * 标签级去同步（v2.3 的 0x80）：**整段标签体**在写入时被转义过，
   * 因此必须先把整段还原，再按帧头里的长度切帧。
   *
   * 为什么不能在"切出 APIC 帧之后"再还原：
   *   v2.3 的帧长记的是**还原前**的长度，而去同步会让实际字节变多，
   *   按这个长度在转义后的字节流上切片会**切短**，图片尾部被截掉。
   *   （实测：12 字节的图只剩 10 字节，且不报任何错。）
   * v2.4 把去同步降到了帧级（格式标志 0x02），那时帧长记的是转义后的长度，
   * 所以那一支仍然按帧切片——见 readApicFrame 的说明。
   */
  const tagUnsynchronised = (flags & 0x80) !== 0

  const rawBody = new Uint8Array(view.buffer, view.byteOffset + cursor, tagEnd - cursor)
  const body = tagUnsynchronised ? deUnsynchronise(rawBody) : rawBody

  // 还原之后一律在**标签体自己的坐标系**里走，不再回头用绝对偏移
  const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength)
  let frameCursor = 0

  while (frameCursor + FRAME_HEADER_SIZE <= body.byteLength) {
    const frameId = String.fromCharCode(
      bodyView.getUint8(frameCursor),
      bodyView.getUint8(frameCursor + 1),
      bodyView.getUint8(frameCursor + 2),
      bodyView.getUint8(frameCursor + 3),
    )

    // 全 0 的帧 id 表示"后面是填充字节"，可以停了
    if (frameId.charCodeAt(0) === 0) break

    // v2.4 的帧长也是 synchsafe；v2.3 是普通 big-endian uint32。
    // 混用会让游标错位，读出乱七八糟的"图片"。
    const frameSize =
      majorVersion === 4 ? readSynchsafe(bodyView, frameCursor + 4) : bodyView.getUint32(frameCursor + 4)

    // v2.4 的帧格式标志低字节里，0x02 = 该帧做了去同步
    const frameFlags = bodyView.getUint8(frameCursor + 9)
    const frameUnsynchronised = majorVersion === 4 && (frameFlags & 0x02) !== 0

    const frameStart = frameCursor + FRAME_HEADER_SIZE
    const frameEnd = frameStart + frameSize
    if (frameSize <= 0 || frameEnd > body.byteLength) break

    if (frameId === 'APIC') {
      const picture = readApicFrame(bodyView, frameStart, frameEnd, frameUnsynchronised)
      if (picture) return picture
    }

    frameCursor = frameEnd
  }

  return null
}

/**
 * 取出 APIC 帧并解析。
 *
 * 这里只处理 **v2.4 的帧级去同步**（格式标志 0x02）：
 * 帧长记的是转义后的长度，所以在帧自己的坐标系里切片、再还原 —— 顺序与标签级相反。
 * v2.3 的标签级去同步已经在 extract() 里对整段标签体做掉了，
 * 因为那里的帧长记的是**还原前**的长度。
 */
function readApicFrame(
  view: DataView,
  start: number,
  end: number,
  unsynchronised: boolean,
): Id3Picture | null {
  const raw = new Uint8Array(view.buffer, view.byteOffset + start, end - start)
  const bytes = unsynchronised ? deUnsynchronise(raw) : raw
  return readApic(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0, bytes.byteLength)
}

/** 去掉去同步插入的 `0x00`：每个 `0xFF` 后面紧跟的那个 `0x00` 是填充，不是数据 */
export function deUnsynchronise(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(input.byteLength)
  let written = 0

  for (let index = 0; index < input.byteLength; index += 1) {
    const byte = input[index] ?? 0
    out[written] = byte
    written += 1
    if (byte === 0xff && input[index + 1] === 0x00) index += 1
  }

  return out.slice(0, written)
}

/**
 * 按文件头魔数判断图片类型。
 *
 * 为什么必须做这一步：MIME 字段是**文件自己声称**的，可以撒谎也可以为空；
 * 而图片字节是不是真的能解码，只有魔数知道。早先只校验了"data 非空 + mime 以 image/ 开头"，
 * 于是被去同步污染过的坏图会**照常落库**，最后在界面上表现为一张破图或干脆空白。
 * 宁可判定为"没有封面"（回退到音乐图标占位），也不要塞一个坏 blob 进库。
 */
function sniffImageMime(bytes: Uint8Array): string | null {
  const at = (index: number): number => bytes[index] ?? -1

  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png'
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'image/gif'
  if (at(0) === 0x42 && at(1) === 0x4d) return 'image/bmp'
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp'
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
  if (data.byteLength === 0) return null

  /*
   * 用魔数校验，而不是相信 MIME 字段。
   *
   * mime 是文件**自己声称**的，可以撒谎、也可以为空；图片字节能不能解码只有魔数知道。
   * 早先只挡了"空数据 + mime 不以 image/ 开头"，于是被去同步污染过的坏字节
   * 会照常落库，最后在界面上表现为破图或空白——用户完全无从判断是文件的问题
   * 还是应用的问题。现在宁可判定为"没有封面"（回退到音乐图标占位）。
   */
  const sniffed = sniffImageMime(data)
  if (!sniffed) return null

  // MIME 为空或明显对不上时以魔数为准（Windows 常见的 image/jpg 也在这里被规范化）
  const resolvedMime = mime.startsWith('image/') ? mime : sniffed

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

  return { mime: resolvedMime, data: copy }
}
