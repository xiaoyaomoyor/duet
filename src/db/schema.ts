/**
 * 数据库结构定义（唯一允许修改表结构的地方，§6.2 / §6.3）
 *
 * 纪律：
 *   1. 任何结构变更必须 SCHEMA_VERSION +1，并在 MIGRATIONS 中补一条迁移函数。
 *   2. 迁移函数永不删除——历史用户的库必须能一路升上来。
 *   3. 本文件不做异步业务读写，只做结构变更。
 */

import { SCHEMA_VERSION } from '@/types'
import { presetIdOfColor } from '@/data/accentPresets'
import { validateProject } from '@/types/validate'

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
  {
    to: 3,
    /**
     * v2 → v3：把三个被合并掉的模块改写成它们的新家。
     *
     *   cover → image    （补 fit=cover、ratio=1/1，即原封面的默认观感）
     *   stars → score    （补 style=stars；-1 的"未评分"哨兵转成 null）
     *   note  → text     （补 variant=note 与 tone，正文原样搬过去）
     *
     * 为什么必须写迁移而不是"读的时候兼容"：
     *   模块实现已经从注册表里删掉了。留着旧 type 的记录会在渲染时
     *   命中 `getModule()` 返回 undefined 的分支，表现为"模块消失"——
     *   而用户的内容其实还在数据里。那是最糟的一种失败：看着像丢数据。
     *
     * 迁移是**幂等**的：已经是新 type 的记录不会被再次处理。
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
            rows?: Array<{
              kind?: string
              label?: string
              cells?: Record<string, { modules?: Array<Record<string, unknown>> }>
            }>
          }
        }

        const sheet = project.sheet
        if (!sheet?.rows) {
          cursor.continue()
          return
        }

        const rows = sheet.rows.map((row) => ({
          ...row,
          cells: Object.fromEntries(
            Object.entries(row.cells ?? {}).map(([sideId, cell]) => [
              sideId,
              {
                ...cell,
                modules: (cell.modules ?? []).map(migrateModule),
              },
            ]),
          ),
        }))

        cursor.update({
          ...project,
          schemaVersion: 3,
          sheet: { ...sheet, rows },
        })

        cursor.continue()
      }
    },
  },
  {
    to: 4,
    /**
     * v3 → v4：把两侧"烧死的 hex"认回配色预设（M8）。
     *
     * 背景：v3 及更早的工程把左右配色存成一个具体的 hex，而那个 hex 是照着
     * **深色背景**挑的浅色。用户切到亮色主题后，浅紫浅青压在白底上几乎看不见。
     * 现在预设会按当前主题解析（浅色主题取深一档），因此要把老工程的 hex 认回预设 id。
     *
     * 认不出来的一律**原样保留**：那说明用户当初选的是自定义颜色，
     * 我们无权替他改掉——他至少还能在「对比配置」里自己重新选一个预设。
     *
     * 迁移是幂等的：已经带 accentPreset 的侧不再处理。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as {
          schemaVersion?: number
          sheet?: { sides?: Array<Record<string, unknown>> }
        }

        const sheet = project.sheet
        if (!sheet?.sides) {
          cursor.continue()
          return
        }

        cursor.update({
          ...project,
          schemaVersion: 4,
          sheet: { ...sheet, sides: sheet.sides.map(migrateSideAccent) },
        })

        cursor.continue()
      }
    },
  },
  {
    to: 5,
    /**
     * v4 → v5：删掉 layout.density。
     *
     * 密度原本是三档（紧凑 / 标准 / 宽松），v0.4.0 按实测反馈整档移除、
     * 固定为紧凑。字段留着不删的后果不是"多一个没用的键"这么轻——
     * 渲染层已经不再读它，于是老工程里那个 `'comfy'` 会永远躺在那儿，
     * 下一个读代码的人会以为它还有效，去改却看不到任何变化。
     *
     * 幂等：删一个不存在的键不会出任何事。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as {
          schemaVersion?: number
          sheet?: { layout?: Record<string, unknown> }
        }

        const sheet = project.sheet
        if (!sheet?.layout) {
          cursor.continue()
          return
        }

        cursor.update({
          ...project,
          schemaVersion: 5,
          sheet: { ...sheet, layout: migrateLayout(sheet.layout) },
        })

        cursor.continue()
      }
    },
  },
  {
    to: 6,
    /**
     * v5 → v6：填充形式改语义（pattern→content、solid→page）。
     * 见 migrateLayoutFill 的说明。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as {
          schemaVersion?: number
          sheet?: { layout?: Record<string, unknown> }
        }

        const sheet = project.sheet
        if (!sheet?.layout) {
          cursor.continue()
          return
        }

        cursor.update({
          ...project,
          schemaVersion: 6,
          sheet: { ...sheet, layout: migrateLayoutFill(sheet.layout) },
        })

        cursor.continue()
      }
    },
  },
  {
    to: 7,
    /**
     * v6 → v7：给老工程补一个「标题」行。
     *
     * v0.5.0 把工具名卡片从"画布顶部自动绘制"改成了普通模块
     * （`title`，见 modules/title）。老工程里没有这个模块，
     * 不补的话打开就是"两边都没有工具名"——比改动前还少东西。
     *
     * 只在**一个 title 模块都没有**时才插入：用户如果已经自己删掉或
     * 移走了它，重新打开不该又冒出来一个。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as { sheet?: { rows?: unknown[] } }
        const rows = project.sheet?.rows
        if (!Array.isArray(rows)) {
          cursor.continue()
          return
        }

        cursor.update({
          ...project,
          schemaVersion: 7,
          sheet: { ...project.sheet, rows: withTitleRow(rows) },
        })

        cursor.continue()
      }
    },
  },
  {
    to: 8,
    /**
     * v7 → v8：删掉 layout.ratio。
     *
     * v0.5.5 移除了"拖动中轴调左右宽度"（用户："实用性不强"），
     * 两侧恒为等宽。"只有一种取值、又没有界面"的字段必须删掉——
     * 留着的话下一个读代码的人会以为它还有效，改它却看不到任何变化
     * （与 v0.4.0 删 density 是同一个理由）。
     */
    run: (_db, tx) => {
      const store = tx.objectStore(STORE.projects)
      const cursorReq = store.openCursor()

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return

        const project = cursor.value as { sheet?: { layout?: Record<string, unknown> } }
        const sheet = project.sheet
        if (!sheet?.layout) {
          cursor.continue()
          return
        }

        cursor.update({
          ...project,
          schemaVersion: 8,
          sheet: { ...sheet, layout: withoutColumnRatio(sheet.layout) },
        })

        cursor.continue()
      }
    },
  },
  { to: 9, run: (_db, tx) => migrateProjectRecords(tx) },
]

/** 单个 sheet.layout 的 v7→v8 改写（导出是为了能直接单测） */
export function withoutColumnRatio(layout: Record<string, unknown>): Record<string, unknown> {
  const next = { ...layout }
  delete next.ratio
  return next
}

/**
 * 若没有任何 title 模块，就在最前面插一行「标题」行。
 *
 * 导出是为了能直接单测——迁移逻辑一旦写错，用户的历史工程就打不开了，
 * 值得单独钉住。这里的行结构必须与 `templateService.createTitleRow` 一致。
 */
export function withTitleRow(rows: unknown[]): unknown[] {
  const hasTitle = rows.some((row) => {
    const cells = (row as { cells?: Record<string, { modules?: Array<{ type?: string }> }> }).cells
    if (!cells) return false
    return Object.values(cells).some((cell) =>
      (cell?.modules ?? []).some((module) => module?.type === 'title'),
    )
  })
  if (hasTitle) return rows

  const first = rows[0] as { cells?: Record<string, unknown> } | undefined
  const sideIds = first?.cells ? Object.keys(first.cells) : []
  if (sideIds.length === 0) return rows

  const make = (): Record<string, unknown> => ({
    id: `migrated-title-${Math.random().toString(36).slice(2, 10)}`,
    type: 'title',
    title: '',
    props: {},
    data: {},
    hidden: false,
  })

  const cells: Record<string, unknown> = {}
  for (const sideId of sideIds) cells[sideId] = { modules: [make()], hidden: false }

  return [
    {
      id: `migrated-title-row-${Math.random().toString(36).slice(2, 10)}`,
      kind: 'paired',
      cells,
      collapsed: false,
    },
    ...rows,
  ]
}
export function migrateLayout(layout: Record<string, unknown>): Record<string, unknown> {
  const next = { ...layout }
  delete next.density
  return next
}

/**
 * 单个 sheet.layout 的 v5→v6 改写（导出是为了能直接单测）。
 *
 * 填充形式改了语义：旧值 `pattern`（图案铺在内容区）对应新值 `content`，
 * 旧值 `solid`（整页铺一层实心底色）对应新值 `page`（图案充满整页）。
 * 映射而不是直接改渲染、也不是丢弃旧值：老工程打开后应该保持它原本的观感，
 * 用户想换成"充满整页"再自己改一次。
 */
export function migrateLayoutFill(layout: Record<string, unknown>): Record<string, unknown> {
  const next = { ...layout }
  if (next.backgroundFill === 'pattern') next.backgroundFill = 'content'
  else if (next.backgroundFill === 'solid') next.backgroundFill = 'page'
  return next
}

/**
 * 单个对比方的 v3→v4 改写（导出是为了能直接单测）。
 *
 * 只做一件事：hex → 预设 id。不改色值本身——
 * 深色主题下预设解析出来的颜色与旧 hex 完全相同，浅色主题下才会取深一档，
 * 所以这次迁移在紫夜主题上是**零视觉变化**的。
 */
export function migrateSideAccent(side: Record<string, unknown>): Record<string, unknown> {
  if (typeof side.accentPreset === 'string' && side.accentPreset) return side

  const id = presetIdOfColor(typeof side.accent === 'string' ? side.accent : undefined)
  return id ? { ...side, accentPreset: id } : side
}

/**
 * 单个模块的 v2→v3 改写（见上面迁移的说明）。
 *
 * 导出是为了能直接单测：迁移里真正有风险的是**字段改写**
 * （哨兵值、默认观感、props 合并），而不是游标遍历那段样板代码。
 */
export function migrateModule(module: Record<string, unknown>): Record<string, unknown> {
  const type = module.type
  const data = (
    typeof module.data === 'object' && module.data !== null ? module.data : {}
  ) as Record<string, unknown>
  const props = (
    typeof module.props === 'object' && module.props !== null ? module.props : {}
  ) as Record<string, unknown>

  if (type === 'cover') {
    return {
      ...module,
      type: 'image',
      data,
      props: { fit: 'cover', ratio: '1/1', ...props },
    }
  }

  if (type === 'stars') {
    const raw = Number(data.value)
    return {
      ...module,
      type: 'score',
      // -1（或缺失/非法）是原「星级」的"未评分"哨兵，新模型用 null
      data: {
        score: Number.isFinite(raw) && raw >= 0 ? raw : null,
        max: Number(data.max) || 5,
        label: '',
        showNumber: false,
      },
      props: { style: 'stars', ...props },
    }
  }

  if (type === 'note') {
    return {
      ...module,
      type: 'text',
      data: { text: typeof data.text === 'string' ? data.text : '', align: 'left' },
      props: {
        variant: 'note',
        tone: typeof data.tone === 'string' ? data.tone : 'neutral',
        ...props,
      },
    }
  }

  return module
}

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
  if (oldVersion >= SCHEMA_VERSION) return
  migrateProjectRecords(tx)
}

function migrateProjectRecords(tx: IDBTransaction): void {
  // One cursor + one transaction: concurrent migration cursors can overwrite each other's updates.
  const request = tx.objectStore(STORE.projects).openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    try {
      const result = validateProject(cursor.value)
      if (!result.ok) {
        tx.abort()
        return
      }
      cursor.update(result.value)
      cursor.continue()
    } catch {
      tx.abort()
    }
  }
}
