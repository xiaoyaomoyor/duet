import { describe, expect, it } from 'vitest'
import { uuid, shortId } from './id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid', () => {
  it('符合 RFC 4122 v4 格式', () => {
    expect(uuid()).toMatch(UUID_V4)
  })

  it('大量生成不重复', () => {
    const set = new Set(Array.from({ length: 2000 }, () => uuid()))
    expect(set.size).toBe(2000)
  })
})

describe('shortId', () => {
  it('带前缀且长度稳定', () => {
    const id = shortId('row_')
    expect(id.startsWith('row_')).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })

  it('无前缀也可用', () => {
    expect(shortId()).toMatch(/^[0-9a-z]+$/)
  })

  it('大量生成不重复', () => {
    const set = new Set(Array.from({ length: 2000 }, () => shortId()))
    expect(set.size).toBe(2000)
  })
})
