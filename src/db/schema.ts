/**
 * 数据库结构定义（唯一允许修改表结构的地方，§6.2 / §6.3）
 *
 * 纪律：
 *   1. 任何结构变更必须 SCHEMA_VERSION +1，并在 MIGRATIONS 中补一条迁移函数。
 *   2. 迁移函数永不删除——历史用户的库必须能一路升上来。
 *   3. 本文件不做异步业务读写，只做结构变更。
 */

import { SCHEMA_VERSION } from '@/types'

/** 对象存储名（常量在此集中，避免各处拼写漂移） */
export const STORE = {
  projects: 'projects',
  assets: 'assets',
  tools: 'tools',
  settings: 'settings',
  templates: 'templates',
  meta: 'meta',
} as const

export type StoreName = (typeof STORE)[keyof typeof STORE]

/** meta 存储中的键 */
export const META_KEY = {
  seeded: 'seeded',
  lastBackupAt: 'lastBackupAt',
  quotaSnapshot: 'quotaSnapshot',
} as const

export interface Migration {
  /** 迁移到的目标版本号 */
  to: number
  run: (db: IDBDatabase, tx: IDBTransaction) => void
}

/**
 * 历史迁移清单。
 *
 * v1 为首个版本，无需迁移。
 * 示例（v1 → v2：sheet → sheets[]）：
 *   {
 *     to: 2,
 *     run: (_db, tx) => {
 *       const store = tx.objectStore(STORE.projects)
 *       const cursorReq = store.openCursor()
 *       cursorReq.onsuccess = () => {
 *         const cursor = cursorReq.result
 *         if (!cursor) return
 *         const project = cursor.value
 *         store.put({ ...project, sheets: [project.sheet], schemaVersion: 2 })
 *         cursor.continue()
 *       }
 *     },
 *   }
 */
export const MIGRATIONS: Migration[] = []

/** 建表：仅在新库或版本升级时执行 */
function createStores(db: IDBDatabase): void {
  // —— 对比项目（不含任何 Blob，见 §6.2 约束 1） ——
  if (!db.objectStoreNames.contains(STORE.projects)) {
    const store = db.createObjectStore(STORE.projects, { keyPath: 'id' })
    store.createIndex('updatedAt', 'updatedAt')
    store.createIndex('pinned', 'pinned')
    store.createIndex('title', 'title')
  }

  // —— 资源（媒体二进制与派生数据） ——
  if (!db.objectStoreNames.contains(STORE.assets)) {
    const store = db.createObjectStore(STORE.assets, { keyPath: 'id' })
    store.createIndex('kind', 'kind')
    store.createIndex('createdAt', 'createdAt')
  }

  // —— 自定义工具 ——
  if (!db.objectStoreNames.contains(STORE.tools)) {
    const store = db.createObjectStore(STORE.tools, { keyPath: 'id' })
    store.createIndex('kind', 'kind')
    store.createIndex('category', 'category')
    store.createIndex('name', 'name')
  }

  // —— 应用设置（单条记录 key: 'app'） ——
  if (!db.objectStoreNames.contains(STORE.settings)) {
    db.createObjectStore(STORE.settings, { keyPath: 'key' })
  }

  // —— 用户自建模板 ——
  if (!db.objectStoreNames.contains(STORE.templates)) {
    const store = db.createObjectStore(STORE.templates, { keyPath: 'id' })
    store.createIndex('category', 'category')
  }

  // —— 元信息 ——
  if (!db.objectStoreNames.contains(STORE.meta)) {
    db.createObjectStore(STORE.meta, { keyPath: 'key' })
  }
}

/** 升级入口：由 db/core.openDatabase 调用 */
export function upgrade(db: IDBDatabase, oldVersion: number, tx: IDBTransaction): void {
  createStores(db)

  // 逐级执行迁移：老的库必须能一路升到 SCHEMA_VERSION
  for (const migration of MIGRATIONS) {
    if (migration.to > oldVersion && migration.to <= SCHEMA_VERSION) {
      migration.run(db, tx)
    }
  }
}
