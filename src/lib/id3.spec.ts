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

interface BuildOptions {
  version?: 3 | 4
  /** 描述串的编码字节：0=ISO-8859-1, 1=UTF-16+BOM, 3=UTF-8 */
  encoding?: number
  description?: string
  mime?: string
  picture?: number[]
  /** 插一个非 APIC 帧在前面，验证游标能正确跳过 */
  leadingFrame?: boolean
  /** 是否追加扩展头 */
  extendedHeader?: boolean
  /** 用普通 uint32 而非 synchsafe 写 v2.4 的帧长（模拟损坏文件） */
  brokenFrameSize?: boolean
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
  } = options

  const frames: number[] = []

  const frameHeader = (id: string, size: number): number[] => {
    const sizeBytes =
      version === 4 && !brokenFrameSize
        ? synchsafe(size)
        : [(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]
    // 帧头 10 字节：id(4) + size(4) + flags(2)
    return [...ascii(id), ...sizeBytes, 0, 0]
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
  frames.push(...frameHeader('APIC', apic.length), ...apic)

  // 扩展头（v2.4）：4 字节 synchsafe 尺寸 + 内容
  const ext: number[] = []
  if (extendedHeader) {
    ext.push(...synchsafe(6), 1, 0)
  }

  const tagBody = [...ext, ...frames]

  // 头部 10 字节：ID3 + 版本(2) + flags(1) + synchsafe 尺寸(4)
  const flags = extendedHeader ? 0x40 : 0x00
  const header = [
    ...ascii('ID3'),
    version,
    0,
    flags,
    ...synchsafe(tagBody.length),
  ]

  return new Uint8Array([...header, ...tagBody]).buffer
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

  it('支持带扩展头的标签', () => {
    const cover = parseId3Cover(buildId3({ extendedHeader: true }))
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

  it('非图片 MIME 的 APIC 被拒绝（宁可没有封面也不要坏数据）', () => {
    expect(parseId3Cover(buildId3({ mime: 'text/plain' }))).toBeNull()
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
