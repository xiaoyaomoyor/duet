/**
 * 对比项目仓储
 *
 * 纪律：projects 存储中**只允许存 assetId 字符串引用**，
 * 禁止内联 dataURL 或 Blob（§6.2 约束 1，违反会导致项目读写从毫秒级劣化到秒级）。
 */

import { getDb } from './db'
import { STORE } from './schema'
import {
  count,
  deleteOne,
  getAll,
  getOne,
  putOne,
  putMany,
  clearStore,
} from './core'
import { deepClone } from '@/lib/clone'
import { isBlank } from '@/lib/text'
import type { Project } from '@/types'

export async function listProjects(): Promise<Project[]> {
  const db = await getDb()
  return getAll<Project>(db, STORE.projects)
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb()
  return getOne<Project>(db, STORE.projects, id)
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.projects, deepClone(project))
}

export async function saveProjects(projects: readonly Project[]): Promise<void> {
  const db = await getDb()
  await putMany(db, STORE.projects, projects.map((p) => deepClone(p)))
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  await deleteOne(db, STORE.projects, id)
}

export async function countProjects(): Promise<number> {
  const db = await getDb()
  return count(db, STORE.projects)
}

export async function clearProjects(): Promise<void> {
  const db = await getDb()
  await clearStore(db, STORE.projects)
}

/**
 * 排序：置顶优先 → 更新时间倒序。
 * 纯函数，便于单测与在 store 中复用。
 */
export function sortProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

/** 按标题/标签搜索（大小写不敏感，纯函数） */
export function filterProjects(projects: readonly Project[], query: string): Project[] {
  if (isBlank(query)) return [...projects]
  const q = query.trim().toLowerCase()
  return projects.filter((p) => {
    if (p.title.toLowerCase().includes(q)) return true
    if (p.tags.some((tag) => tag.toLowerCase().includes(q))) return true

    // 同时匹配两侧工具名，便于"按工具找项目"
    for (const side of p.sheet.sides) {
      const label = side.labelOverride ?? ''
      if (label.toLowerCase().includes(q)) return true
      if (side.toolRef.kind === 'inline' && side.toolRef.name.toLowerCase().includes(q)) return true
    }
    return false
  })
}
