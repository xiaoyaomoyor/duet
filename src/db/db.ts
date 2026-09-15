/**
 * 数据库连接单例
 *
 * 注意：连接是懒加载的 Promise，可被 reset（测试与"清空数据"后重连使用）。
 */

import { openDatabase } from './core'
import { upgrade } from './schema'
import { SCHEMA_VERSION } from '@/types'
import { APP } from '@/app.config'

let connection: Promise<IDBDatabase> | null = null

/** 取得（必要时建立）数据库连接 */
export function getDb(): Promise<IDBDatabase> {
  if (!connection) {
    connection = openDatabase(APP.dbName, SCHEMA_VERSION, upgrade).catch((error: unknown) => {
      // 建立失败必须清空缓存，否则后续所有调用都会拿到同一个 rejected Promise
      connection = null
      throw error
    })
  }
  return connection
}

/** 关闭并丢弃当前连接（测试、清空数据后调用） */
export async function resetDb(): Promise<void> {
  if (!connection) return
  try {
    const db = await connection
    db.close()
  } catch {
    // 连接本就失败，无需处理
  }
  connection = null
}

/**
 * 删除整个数据库（"清空所有数据"功能使用）。
 * 调用后必须 resetDb()，否则后续操作会拿着已删除的库。
 */
export function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(APP.dbName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('删除数据库失败'))
    request.onblocked = () => reject(new Error('数据库被占用，无法删除'))
  })
}
