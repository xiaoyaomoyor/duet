import { describe, expect, it } from 'vitest'
import { deepClone, jsonEqual, toRawDeep } from './clone'

describe('deepClone', () => {
  it('基本类型原样返回', () => {
    expect(deepClone(1)).toBe(1)
    expect(deepClone('a')).toBe('a')
    expect(deepClone(null)).toBeNull()
  })

  it('对象与数组深拷贝且互不影响', () => {
    const source = { a: { b: [1, 2, 3] }, c: 'x' }
    const copy = deepClone(source)
    expect(copy).toEqual(source)
    expect(copy).not.toBe(source)

    copy.a.b.push(4)
    expect(source.a.b).toHaveLength(3)
  })

  it('可拷贝含 undefined 的嵌套结构而不抛异常', () => {
    const source = { a: undefined, b: { c: undefined } }
    expect(() => deepClone(source)).not.toThrow()
  })

  it('Blob 按引用保留（克隆不得让媒体静默丢失）', () => {
    // 这是本项目最危险的失败模式：structuredClone/JSON 都会把 Blob 变成 {}
    const blob = new Blob(['x'])
    const copy = deepClone({ blob })

    expect(copy.blob).toBeInstanceOf(Blob)
    expect(copy.blob).toBe(blob) // Blob 不可变，按引用即是正确语义
    expect(copy.blob.size).toBe(1)
    expect(copy.blob.type).toBe(blob.type)
  })

  it('数组中的 Blob 同样被保留', () => {
    const blob = new Blob(['y'])
    const copy = deepClone([{ asset: blob }])
    expect(copy[0]?.asset).toBe(blob)
  })

  it('Date / Map / Set / RegExp 被重建为等价实例', () => {
    const date = new Date('2026-09-15T00:00:00Z')
    const copy = deepClone({
      date,
      map: new Map([['a', 1]]),
      set: new Set([1, 2]),
      re: /ab+c/gi,
    })

    expect(copy.date).toBeInstanceOf(Date)
    expect(copy.date.getTime()).toBe(date.getTime())
    expect(copy.date).not.toBe(date)
    expect(copy.map.get('a')).toBe(1)
    expect(copy.set.has(2)).toBe(true)
    expect(copy.re.source).toBe('ab+c')
    expect(copy.re.flags).toBe('gi')
  })

  it('循环引用不栈溢出', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    const copy = deepClone(a) as Record<string, unknown>
    expect(copy.name).toBe('a')
    expect(copy.self).toBe(copy)
  })
})

describe('toRawDeep', () => {
  it('把嵌套结构还原为普通对象', () => {
    const raw = toRawDeep({ a: [1, { b: 2 }] })
    expect(raw).toEqual({ a: [1, { b: 2 }] })
  })

  it('保留 Date / Blob 实例（不做无意义的展开）', () => {
    const date = new Date('2026-09-15T00:00:00Z')
    const result = toRawDeep({ date })
    expect(result.date).toBeInstanceOf(Date)
    expect(result.date.getTime()).toBe(date.getTime())
  })
})

describe('jsonEqual', () => {
  it('结构相同即相等，与引用无关', () => {
    expect(jsonEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('按 JSON 语义比较：值为 undefined 的键等同于不存在', () => {
    // 这是有意为之的"JSON 语义"：JSON.stringify 会丢掉 undefined 值，
    // 因此脏检查不会因为一个 undefined 键就误判为"有改动"。
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true)
  })

  it('相同引用短路返回 true', () => {
    const value = { a: 1 }
    expect(jsonEqual(value, value)).toBe(true)
  })

  it('循环引用不抛异常', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => jsonEqual(a, {})).not.toThrow()
  })
})
