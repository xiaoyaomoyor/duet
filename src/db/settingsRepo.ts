/**
 * 应用设置仓储（单条记录，key 恒为 'app'）
 *
 * 读取时必须做**字段级合并**：旧版本缺少新字段时以默认值补齐，
 * 这样新增设置项无需迁移整个数据库。
 */

import { getDb } from './db'
import { META_KEY, STORE } from './schema'
import { clearStore, deleteOne, getAll, getOne, putOne } from './core'
import { deepClone } from '@/lib/clone'
import { DEFAULT_SETTINGS, THEME_IDS, type AppSettings } from '@/types'

const SETTINGS_KEY = 'app'

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb()
  const record = await getOne<{ key: string; value: Partial<AppSettings> }>(
    db,
    STORE.settings,
    SETTINGS_KEY,
  )
  if (!record) return deepClone(DEFAULT_SETTINGS)
  return mergeSettings(record.value)
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.settings, {
    key: SETTINGS_KEY,
    value: deepClone(settings),
    updatedAt: Date.now(),
  })
}

export async function clearSettings(): Promise<void> {
  const db = await getDb()
  await clearStore(db, STORE.settings)
}

/**
 * 与默认值合并：旧版本缺少的新字段以默认值补齐，无需数据库迁移。
 *
 * ⚠️ 这里必须保留一份**未被污染的** defaults 作为回退源。
 * 若用 Object.assign(defaults, stored) 之后再拿 defaults 做比较，
 * 守卫会永远成立（默认值已被覆盖）——本项目已踩过这个坑，见 settingsRepo.spec.ts。
 */
export function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  const defaults = deepClone(DEFAULT_SETTINGS)
  if (!stored) return defaults

  const merged = Object.assign(deepClone(DEFAULT_SETTINGS), stored)

  // —— 关键字段的运行时守卫：脏数据不得让应用崩在启动阶段 ——
  if (!SUPPORTED_LANGUAGES.includes(merged.language)) merged.language = defaults.language

  /*
   * 主题必须按**合法集合**校验，不能写成"与默认值不同就重置"。
   *
   * 那个写法在只有一个主题时勉强成立，但一旦有多个主题就会变成：
   * 用户选了"亮"，读回设置时发现它 != 默认值，于是被重置回默认 ——
   * 表现为"主题怎么选都选不动，一刷新就变回去"。
   */
  if (!THEME_IDS.includes(merged.themeId)) merged.themeId = defaults.themeId

  if (!isValidAccentPair(merged.defaultAccent)) merged.defaultAccent = defaults.defaultAccent

  if (!Array.isArray(merged.accentPresets) || merged.accentPresets.length === 0) {
    merged.accentPresets = defaults.accentPresets
  }

  if (merged.mediaImportMode !== 'mirror' && merged.mediaImportMode !== 'link') {
    merged.mediaImportMode = defaults.mediaImportMode
  }
  if (merged.reducedMotion !== 'always' && merged.reducedMotion !== 'never') {
    merged.reducedMotion = defaults.reducedMotion
  }

  merged.autosaveDebounceMs = clamp(merged.autosaveDebounceMs, 100, 2000, defaults.autosaveDebounceMs)
  merged.sidebarWidth = clamp(merged.sidebarWidth, 200, 400, defaults.sidebarWidth)
  merged.maxMirrorSizeMB = clamp(merged.maxMirrorSizeMB, 1, 2048, defaults.maxMirrorSizeMB)

  merged.exportScale = merged.exportScale === 1 ? 1 : 2
  merged.restoreLastPosition = merged.restoreLastPosition === true
  merged.editorShowEmptyModules = merged.editorShowEmptyModules !== false

  if (!Array.isArray(merged.disabledBuiltinTools)) merged.disabledBuiltinTools = []

  return merged
}

const SUPPORTED_LANGUAGES: readonly string[] = ['zh-CN', 'en-US']

/** 配色对必须是「两个合法 hex 颜色」 */
function isValidAccentPair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((color) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
  )
}

/** 数值夹紧；非有限值（NaN/Infinity/非数字）回退到默认值 */
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

// ——————————————————————————————————————————————————————————
// meta 存储：迁移标记 / 最后备份时间 / 配额快照
// ——————————————————————————————————————————————————————————

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  const record = await getOne<{ key: string; value: T }>(db, STORE.meta, key)
  return record?.value
}

export async function writeMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.meta, { key, value })
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await getDb()
  await deleteOne(db, STORE.meta, key)
}

export async function listMetaKeys(): Promise<string[]> {
  const db = await getDb()
  const records = await getAll<{ key: string }>(db, STORE.meta)
  return records.map((record) => record.key)
}

export { META_KEY }
