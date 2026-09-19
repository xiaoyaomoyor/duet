/**
 * IndexedDB 基础封装（零依赖）
 *
 * 设计取舍（§5 T5）：手写 Promise 化封装，保持可控、可测、无供应链风险。
 * 本文件只提供"原语"，不含任何业务语义——业务语义在 repositories 层。
 */

import { attemptAsync, type Result } from '@/lib/result'

/** IndexedDB 事务模式 */
export type TxMode = 'readonly' | 'readwrite'

/**
 * 打开数据库。
 * 升级回调里只允许做结构变更（建表、建索引、迁移），禁止做异步业务读写。
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction
      if (!tx) {
        reject(new Error('升级事务不可用：无法执行数据库迁移'))
        return
      }
      try {
        upgrade(db, event.oldVersion, tx)
      } catch (error) {
        tx.abort()
        reject(asError(error, '数据库升级失败'))
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // 其他标签页触发升级时，主动关闭本连接，避免阻塞
      db.onversionchange = () => db.close()
      resolve(db)
    }

    request.onerror = () => reject(asError(request.error, '打开数据库失败'))
    request.onblocked = () => reject(new Error('数据库被其他标签页占用，请关闭其他窗口后重试'))
  })
}

/** 把 IDBRequest 包成 Promise */
export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(asError(request.error, '数据库请求失败'))
  })
}

/** 等待事务完成（写入必须等它，否则可能静默失败） */
export function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(asError(tx.error, '事务执行失败'))
    tx.onabort = () => reject(asError(tx.error, '事务被中止'))
  })
}

/**
 * 读取单个对象存储中的全部记录。
 * 注意：打开游标而非 getAll，便于将来加入分页与进度反馈。
 */
export function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).getAll()

    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(asError(request.error, `读取 ${store} 失败`))
  })
}

/** 读取单条记录 */
export function getOne<T>(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).get(key)

    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(asError(request.error, `读取 ${store} 失败`))
  })
}

/** 写入单条记录（新增或覆盖） */
export async function putOne<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value as unknown as Record<string, unknown>)
  await promisifyTransaction(tx)
}

/** 批量写入（同一事务，失败整体回滚） */
export async function putMany<T>(
  db: IDBDatabase,
  store: string,
  values: readonly T[],
): Promise<void> {
  if (values.length === 0) return
  const tx = db.transaction(store, 'readwrite')
  const objectStore = tx.objectStore(store)
  for (const value of values) {
    objectStore.put(value as unknown as Record<string, unknown>)
  }
  await promisifyTransaction(tx)
}

/** 删除单条记录 */
export async function deleteOne(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await promisifyTransaction(tx)
}

/** 批量删除 */
export async function deleteMany(
  db: IDBDatabase,
  store: string,
  keys: readonly IDBValidKey[],
): Promise<void> {
  if (keys.length === 0) return
  const tx = db.transaction(store, 'readwrite')
  const objectStore = tx.objectStore(store)
  for (const key of keys) objectStore.delete(key)
  await promisifyTransaction(tx)
}

/** 清空对象存储 */
export async function clearStore(db: IDBDatabase, store: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await promisifyTransaction(tx)
}

/** 统计记录数 */
export function count(db: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(asError(request.error, `统计 ${store} 失败`))
  })
}

/**
 * 用索引查询。
 * 需要范围查询（如 updatedAt 排序）时使用，避免全表加载。
 */
export function getAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  indexName: string,
  query: IDBKeyRange | IDBValidKey | null = null,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const index = tx.objectStore(store).index(indexName)
    const request = index.getAll(query as IDBValidKey | IDBKeyRange | null)

    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(asError(request.error, `按索引读取 ${store}.${indexName} 失败`))
  })
}

/** 是否支持 IndexedDB（隐私模式 / 老环境可能不支持） */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/** 包装一次数据库操作，把异常收敛为 Result */
export async function withDb<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<Result<T, string>> {
  return attemptAsync(operation, (e) => `${context}：${errorMessage(e)}`)
}

function asError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  return new Error(fallback)
}

function errorMessage(error: unknown): string {
  return asError(error, '未知错误').message
}
