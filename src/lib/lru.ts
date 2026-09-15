/**
 * 极简 LRU 缓存（纯数据结构）
 *
 * 用途：缓存 IndexedDB 读出的资源。因为资源的 id 就是内容哈希，
 * 同一个 id 必然对应同一份字节，缓存不会失效——只需要控制内存占用。
 *
 * 实现基于 Map 的插入顺序：命中即"删除再插入"以移到队尾，淘汰时删队首。
 */

export class LruCache<K, V> {
  private readonly map = new Map<K, V>()

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) throw new Error('LruCache 的容量必须大于 0')
  }

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined

    // 命中后移到队尾（最近使用）
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)

    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next()
      if (oldest.done) break
      this.map.delete(oldest.value)
    }
  }

  delete(key: K): V | undefined {
    const value = this.map.get(key)
    this.map.delete(key)
    return value
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }

  /** 当前缓存的所有键（按最近使用顺序，最早的在前） */
  keys(): K[] {
    return Array.from(this.map.keys())
  }
}
