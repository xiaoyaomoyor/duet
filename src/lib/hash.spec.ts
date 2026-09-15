import { describe, expect, it } from 'vitest'
import { hashBlob, hashBuffer, hashInt, hashString } from './hash'

describe('hashInt', () => {
  it('同名同值（程序化图标"同名同色"的基础）', () => {
    expect(hashInt('Suno')).toBe(hashInt('Suno'))
    expect(hashInt('可灵')).toBe(hashInt('可灵'))
  })

  it('不同名基本不同值', () => {
    expect(hashInt('Suno')).not.toBe(hashInt('Udio'))
  })

  it('始终为非负 32 位整数', () => {
    for (const input of ['', 'a', 'Suno', '可灵 Kling', '🎵']) {
      const value = hashInt(input)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('hashBuffer', () => {
  it('相同内容得到相同哈希', async () => {
    const a = new TextEncoder().encode('duet')
    const b = new TextEncoder().encode('duet')
    expect(await hashBuffer(a.buffer as ArrayBuffer)).toBe(await hashBuffer(b.buffer as ArrayBuffer))
  })

  it('不同内容得到不同哈希', async () => {
    const a = new TextEncoder().encode('duet')
    const b = new TextEncoder().encode('Duet')
    expect(await hashBuffer(a.buffer as ArrayBuffer)).not.toBe(
      await hashBuffer(b.buffer as ArrayBuffer),
    )
  })

  it('输出 32 位十六进制（sha-256 前 16 字节）', async () => {
    const result = await hashBuffer(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer)
    expect(result).toMatch(/^[0-9a-f]{32}$/)
  })

  it('空内容也有稳定哈希', async () => {
    const empty = new Uint8Array([]).buffer as ArrayBuffer
    expect(await hashBuffer(empty)).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('hashBlob', () => {
  it('成功返回内容哈希', async () => {
    const result = await hashBlob(new Blob(['hello duet']))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toMatch(/^[0-9a-f]{32}$/)
  })

  it('相同内容的两个 Blob 得到相同 id（导入去重的依据）', async () => {
    const a = await hashBlob(new Blob(['same']))
    const b = await hashBlob(new Blob(['same']))
    expect(a.ok && b.ok && a.value === b.value).toBe(true)
  })

  it('读取失败时返回 Result 错误而非抛异常', async () => {
    const broken = { arrayBuffer: () => Promise.reject(new Error('boom')) } as unknown as Blob
    const result = await hashBlob(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('boom')
  })
})

describe('hashString', () => {
  it('确定性且与等值缓冲区一致', async () => {
    const fromString = await hashString('duet')
    const fromBuffer = await hashBuffer(
      new TextEncoder().encode('duet').buffer as ArrayBuffer,
    )
    expect(fromString).toBe(fromBuffer)
  })
})
