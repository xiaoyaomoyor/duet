/**
 * 维护服务：全量导出、全量清空、存储自检
 *
 * 与 assetService 的分工：
 *   assetService 管单个资源的导入与回收；本文件管"整个应用的数据生命周期"。
 */

import { deleteDatabase, getDb, resetDb } from '@/db/db'
import { STORE } from '@/db/schema'
import { clearStore } from '@/db/core'
import { listProjects } from '@/db/projectsRepo'
import { listAssets } from '@/db/assetsRepo'
import { listTools } from '@/db/toolsRepo'
import { clearSettings } from '@/db/settingsRepo'
import { APP } from '@/app.config'
import { err, ok, type Result } from '@/lib/result'
import { serializeProjects, type ProjectFileEnvelope } from './projectService'

export interface DataCounts {
  projects: number
  assets: number
  tools: number
}

/** 统计各表记录数（存储面板展示） */
export async function countAll(): Promise<DataCounts> {
  const [projects, assets, tools] = await Promise.all([
    listProjects(),
    listAssets(),
    listTools(),
  ])
  return { projects: projects.length, assets: assets.length, tools: tools.length }
}

/** 导出全部项目为一个工程文件信封 */
export async function exportAllProjects(): Promise<Result<ProjectFileEnvelope, string>> {
  try {
    const projects = await listProjects()
    if (projects.length === 0) return err('没有可导出的项目')
    return ok(serializeProjects(projects))
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 清空所有数据。
 *
 * 实现选择"删库重建"而非逐表 clear：
 * 逐表清理会留下自增主键与索引碎片，且容易漏掉将来新增的表。
 * 删库后必须 resetDb()，否则后续操作会拿到已失效的连接。
 */
export async function clearAllData(): Promise<Result<void, string>> {
  try {
    await resetDb()
    await deleteDatabase()
    // 重建空库，保证紧接着的写入不会失败
    await getDb()
    return ok(undefined)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 逐表清空（保留数据库本身；测试与"只清项目"场景使用） */
export async function clearTables(
  tables: Array<(typeof STORE)[keyof typeof STORE]>,
): Promise<Result<void, string>> {
  try {
    const db = await getDb()
    for (const table of tables) await clearStore(db, table)
    return ok(undefined)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 清空项目（保留设置与工具库） */
export async function clearProjectsOnly(): Promise<Result<void, string>> {
  return clearTables([STORE.projects])
}

/** 恢复出厂：设置回到默认值 */
export async function resetSettings(): Promise<Result<void, string>> {
  try {
    await clearSettings()
    return ok(undefined)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 供 UI 展示的备份文件建议名 */
export function backupFileName(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  return `${APP.slug}-backup-${stamp}.${APP.fileExt}`
}
