/**
 * ID3v2 封面提取单测
 *
 * 用手工拼出的**真实 ID3 字节**测试，而不是 mock：
 * 这个解析器最容易错的地方就是字节偏移（synchsafe 整数、
 * v2.3 与 v2.4 的帧长格式不同、描述串终止符宽度随编码变化），
 * 用假数据一个都测不出来。
 */
import { describe, expect, it } from 'vitest'
import { hasId3, parseId3Cover } from './id3'

// ——————————————————————————————————————————————————————————
// 构造辅助
// ——————————————————————————————————————————————————————————

/** 把长度写成 synchsafe 的 4 字节（每字节只用低 7 位） */
function synchsafe(size: number): number[] {
  return [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

/** 一张假的 JPEG（只要 MIME 是 image/* 就会被收下，内容本应用不解码） */
const FAKE_JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]

/** 普通 big-endian uint32（v2.3 的帧长与扩展头长度用它） */
function uint32(size: number): number[] {
  return [(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]
}

/**
 * 去同步编码：每个 0xFF 后面补一个 0x00。
 * 这是 ID3 为了"数据里不出现帧同步字"而做的转义，解析时必须还原。
 */
function unsynchronise(bytes: number[]): number[] {
  const out: number[] = []
  bytes.forEach((byte, index) => {
    out.push(byte)
    if (byte === 0xff) out.push(0x00)
    // 原数据里 0xFF 后面本来就是 0x00 的，编码时会写成 0xFF 0x00 0x00
    else if (byte === 0x00 && bytes[index - 1] === 0xff) out.push(0x00)
  })
  return out
}

interface BuildOptions {
  version?: 3 | 4
  /** 描述串的编码字节：0=ISO-8859-1, 1=UTF-16+BOM, 3=UTF-8 */
  encoding?: number
  description?: string
  mime?: string
  picture?: number[]
  /** 插一个非 APIC 帧在前面，验证游标能正确跳过 */
  leadingFrame?: boolean
  /** 是否追加扩展头（按版本用各自正确的编码与长度语义） */
  extendedHeader?: boolean
  /** 用普通 uint32 而非 synchsafe 写 v2.4 的帧长（模拟损坏文件） */
  brokenFrameSize?: boolean
  /** v2.3：置标签级去同步标志（0x80），并真的对标签体做去同步编码 */
  unsynchronised?: boolean
  /** v2.4：置**帧级**去同步标志（格式标志 0x02），并真的对该帧做去同步编码 */
  frameUnsynchronised?: boolean
  /** 强行写入一个谎报的标签长度（用于构造"长度与内容不符"的坏文件） */
  tagSizeOverride?: number
}

/** 拼出一个最小但结构合法的 ID3v2 标签 */
function buildId3(options: BuildOptions = {}): ArrayBuffer {
  const {
    version = 3,
    encoding = 0,
    description = '',
    mime = 'image/jpeg',
    picture = FAKE_JPEG,
    leadingFrame = false,
    extendedHeader = false,
    brokenFrameSize = false,
    unsynchronised = false,
    frameUnsynchronised = false,
    tagSizeOverride,
  } = options

  const frames: number[] = []

  const frameHeader = (id: string, size: number, formatFlags = 0): number[] => {
    const sizeBytes =
      version === 4 && !brokenFrameSize ? synchsafe(size) : uint32(size)
    // 帧头 10 字节：id(4) + size(4) + flags(2)
    return [...ascii(id), ...sizeBytes, 0, formatFlags]
  }

  // 一个 TIT2 文本帧，用来验证"跳过非 APIC 帧"
  if (leadingFrame) {
    const payload = [0, ...ascii('测试标题')]
    frames.push(...frameHeader('TIT2', payload.length), ...payload)
  }

  // APIC：encoding(1) + mime + 0x00 + pictureType(1) + description + 终止符 + 图片
  const apic: number[] = [encoding, ...ascii(mime), 0, 0x03]

  if (encoding === 1 || encoding === 2) {
    // UTF-16：BOM + 字符 + 双字节终止符
    apic.push(0xff, 0xfe)
    for (const char of description) apic.push(char.charCodeAt(0), 0)
    apic.push(0, 0)
  } else {
    for (const char of description) apic.push(char.charCodeAt(0))
    apic.push(0)
  }

  apic.push(...picture)

  if (frameUnsynchronised) {
    // v2.4 帧级去同步：只转义这一帧的载荷，帧长按**转义后**的长度写
    const encoded = unsynchronise(apic)
    frames.push(...frameHeader('APIC', encoded.length, 0x02), ...encoded)
  } else {
    frames.push(...frameHeader('APIC', apic.length), ...apic)
  }

  /*
   * 扩展头。两个版本的语义**完全不同**，构造器必须跟着分叉，
   * 否则测的就不是真实文件了：
   *   v2.4：synchsafe 长度，且该值包含长度字段自身（本例共 6 字节）
   *   v2.3：普通 uint32 长度，且该值**不含**长度字段自身 → 总长 4 + 6 = 10
   */
  const ext: number[] = []
  if (extendedHeader) {
    if (version === 4) ext.push(...synchsafe(6), 1, 0)
    else ext.push(...uint32(6), 0, 0, 0, 0, 0, 0)
  }

  const tagBody = [...ext, ...frames]
  const encodedBody = unsynchronised ? unsynchronise(tagBody) : tagBody
  const bodySize = tagSizeOverride ?? encodedBody.length

  // 头部 10 字节：ID3 + 版本(2) + flags(1) + synchsafe 尺寸(4)
  const flags = (extendedHeader ? 0x40 : 0x00) | (unsynchronised ? 0x80 : 0x00)
  const header = [
    ...ascii('ID3'),
    version,
    0,
    flags,
    ...synchsafe(bodySize),
  ]

  return new Uint8Array([...header, ...encodedBody]).buffer
}

// ——————————————————————————————————————————————————————————

describe('hasId3', () => {
  it('识别 ID3v2 标签', () => {
    expect(hasId3(buildId3())).toBe(true)
  })

  it('普通数据不是 ID3', () => {
    expect(hasId3(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer)).toBe(false)
  })

  it('过短的数据不崩', () => {
    expect(hasId3(new ArrayBuffer(3))).toBe(false)
  })
})

describe('parseId3Cover', () => {
  it('取出 ID3v2.3 的内嵌封面', () => {
    const cover = parseId3Cover(buildId3())
    expect(cover).not.toBeNull()
    expect(cover?.mime).toBe('image/jpeg')
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('取出 ID3v2.4 的内嵌封面（帧长是 synchsafe）', () => {
    const cover = parseId3Cover(buildId3({ version: 4 }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('v2.3 的帧长用普通整数——两种格式不能混用', () => {
    // 若把 v2.3 的帧长当 synchsafe 读，图片长度会算错，取到的字节也不对
    const cover = parseId3Cover(buildId3({ version: 3 }))
    expect(cover?.data.byteLength).toBe(FAKE_JPEG.length)
  })

  it('跳过非 APIC 帧后仍能找到封面', () => {
    const cover = parseId3Cover(buildId3({ leadingFrame: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  /*
   * 扩展头：两个版本的**长度语义完全不同**，而早先的代码对两者都按 synchsafe 读，
   * 结果带扩展头的 v2.3 文件整段错位、静默返回 null——用户看到的就是
   * "Windows 有封面、对奏没有"。下面两条分别把两个版本钉住。
   */
  it('支持带扩展头的标签（v2.4：synchsafe 长度，含自身）', () => {
    const cover = parseId3Cover(buildId3({ version: 4, extendedHeader: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('支持带扩展头的标签（v2.3：普通 uint32 长度，不含自身）', () => {
    const cover = parseId3Cover(buildId3({ version: 3, extendedHeader: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  /*
   * 去同步（unsynchronisation）：编码时给每个 0xFF 后面补一个 0x00。
   * 不还原**不会报错**，只会得到一张字节被污染的图——
   * 比"没有封面"更难查（实测落库的是 ff 00 d8 ff 00 e0 …）。
   */
  it('还原标签级去同步（v2.3 标志位 0x80），字节与原始完全一致', () => {
    const cover = parseId3Cover(buildId3({ version: 3, unsynchronised: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('还原帧级去同步（v2.4 格式标志 0x02）', () => {
    const cover = parseId3Cover(buildId3({ version: 4, frameUnsynchronised: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('去同步 + 扩展头同时出现也能解出来', () => {
    const cover = parseId3Cover(buildId3({ version: 3, extendedHeader: true, unsynchronised: true }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('支持 UTF-16 编码的描述串（双字节终止符）', () => {
    const cover = parseId3Cover(buildId3({ encoding: 1, description: '封面' }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('支持 UTF-8 编码的描述串', () => {
    const cover = parseId3Cover(buildId3({ encoding: 3, description: 'front cover' }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('尊重图片自带的 MIME（png 不会被当成 jpeg）', () => {
    const cover = parseId3Cover(buildId3({ mime: 'image/png' }))
    expect(cover?.mime).toBe('image/png')
  })

  it('数据不够长时不越界读取（返回 null 而不是抛异常）', () => {
    const full = buildId3()
    // 从中间截断：帧头声称的长度超出实际数据
    const truncated = full.slice(0, 40)
    expect(() => parseId3Cover(truncated)).not.toThrow()
    expect(parseId3Cover(truncated)).toBeNull()
  })

  it('ID3v2.2 明确不支持（帧头格式不同），返回 null 而不是猜着解', () => {
    const buffer = buildId3()
    new DataView(buffer).setUint8(3, 2)
    expect(parseId3Cover(buffer)).toBeNull()
  })

  it('没有内嵌图片时返回 null', () => {
    // 只有 TIT2 帧：手工拼一个不含 APIC 的标签
    const textFrame = [...ascii('TIT2'), 0, 0, 0, 2, 0, 0, 0, ...ascii('标题')]
    const header = [...ascii('ID3'), 3, 0, 0, ...synchsafe(textFrame.length)]
    const buffer = new Uint8Array([...header, ...textFrame]).buffer
    expect(parseId3Cover(buffer)).toBeNull()
  })

  /*
   * MIME 字段是文件**自己声称**的，可以撒谎、也可以为空；能解码的只有字节本身。
   * 因此判据是**魔数**而不是 MIME：
   *   · 声称 text/plain 但字节是合法 JPEG → 收下（图是真的，标签写错了而已）
   *   · 声称 image/jpeg 但字节是垃圾   → 拒绝（宁可没有封面，也不要把坏 blob 塞进库）
   */
  it('MIME 撒谎但字节是合法图片时，以字节为准收下', () => {
    const cover = parseId3Cover(buildId3({ mime: 'text/plain' }))
    expect([...(cover?.data ?? [])]).toEqual(FAKE_JPEG)
  })

  it('MIME 为空时按魔数补全（老工具常导出空 MIME）', () => {
    const cover = parseId3Cover(buildId3({ mime: '' }))
    expect(cover?.mime).toBe('image/jpeg')
  })

  it('声称是图片但字节不是图片时被拒绝（不让坏 blob 进库）', () => {
    // 既不是 JPEG / PNG / GIF / BMP / WEBP 的任意字节
    expect(parseId3Cover(buildId3({ picture: [0x00, 0x01, 0x02, 0x03, 0x04] }))).toBeNull()
  })

  it('去同步没被还原的坏字节会被魔数挡下来（回归：曾经会照常落库）', () => {
    // 手工构造"该去同步但没去"的载荷：JPEG 魔数被 0x00 隔开
    const corrupted = [0xff, 0x00, 0xd8, 0xff, 0x00, 0xe0, 0x00, 0x10, 0x4a, 0x46]
    expect(parseId3Cover(buildId3({ picture: corrupted }))).toBeNull()
  })

  it('空图片数据被拒绝', () => {
    expect(parseId3Cover(buildId3({ picture: [] }))).toBeNull()
  })

  it('非 ID3 数据返回 null', () => {
    expect(parseId3Cover(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer)).toBeNull()
  })

  it('空缓冲区不崩', () => {
    expect(parseId3Cover(new ArrayBuffer(0))).toBeNull()
  })

  it('返回的字节是拷贝，不把整个音频缓冲钉在内存里', () => {
    const buffer = buildId3()
    const cover = parseId3Cover(buffer)
    expect(cover).not.toBeNull()
    // 改原 buffer 不应影响已取出的封面
    new Uint8Array(buffer)[buffer.byteLength - 1] = 0x00
    expect(cover?.data[cover.data.length - 1]).toBe(0xd9)
  })
})
