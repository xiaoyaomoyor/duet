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
 */
export const MIGRATIONS: Migration[] = [
  {
    to: 2,
    /**
     * v1 → v2：补上行高与工具卡片显示开关的默认值。
     *
     * 严格说这两个字段都是可选的，不补也能跑；之所以仍然遍历一遍，
     * 是为了让落库的数据**显式**带上新字段——否则"缺字段"与
     * "用户明确关掉了显示"在数据上无法区分，将来排查会很痛苦。
     *
     * 这里同时兜底修复 layout.ratio：手改过的文件可能缺它，
     * 缺了会让画布按 undefined 算宽度而塌成 0。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as {
          schemaVersion?: number
          sheet?: {
            layout?: { ratio?: unknown }
            sides?: Array<Record<string, unknown>>
          }
        }

        const sheet = project.sheet
        if (!sheet) {
          // 结构已经坏掉的记录不在这里修——交给导入校验去报告
          cursor.continue()
          return
        }

        const ratio = sheet.layout?.ratio
        const validRatio =
          Array.isArray(ratio) &&
          ratio.length === 2 &&
          ratio.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)

        const sides = (sheet.sides ?? []).map((side) => ({
          showIcon: true,
          showName: true,
          showVersion: true,
          showNote: true,
          ...side,
        }))

        cursor.update({
          ...project,
          schemaVersion: 2,
          sheet: {
            ...sheet,
            sides,
            layout: {
              ...sheet.layout,
              ratio: validRatio ? ratio : [1, 1],
            },
          },
        })

        cursor.continue()
      }
    },
  },
]

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
