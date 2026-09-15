/**
 * 用户自建模板仓储
 *
 * 内置模板在代码中（services/templateService.ts），不落库；
 * 本仓储只存用户"另存为模板"产生的数据（M3 使用）。
 */

import { getDb } from './db'
import { STORE } from './schema'
import { clearStore, count, deleteOne, getAll, getOne, putOne } from './core'
import { deepClone } from '@/lib/clone'
import type { ToolCategory } from '@/types'

export interface ProjectTemplate {
  id: string
  name: string
  category: ToolCategory | 'blank'
  /** 模板携带的对比页骨架（不含媒体内容） */
  sheet: unknown
  builtin: boolean
  createdAt: number
  updatedAt: number
}

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const db = await getDb()
  return getAll<ProjectTemplate>(db, STORE.templates)
}

export async function getTemplate(id: string): Promise<ProjectTemplate | undefined> {
  const db = await getDb()
  return getOne<ProjectTemplate>(db, STORE.templates, id)
}

export async function saveTemplate(template: ProjectTemplate): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.templates, deepClone(template))
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb()
  await deleteOne(db, STORE.templates, id)
}

export async function countTemplates(): Promise<number> {
  const db = await getDb()
  return count(db, STORE.templates)
}

export async function clearTemplates(): Promise<void> {
  const db = await getDb()
  await clearStore(db, STORE.templates)
}
