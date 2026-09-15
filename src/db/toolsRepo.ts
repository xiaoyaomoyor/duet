/**
 * 自定义工具仓储
 *
 * 内置工具**不落库**（随版本更新，避免与用户库冲突），
 * 只在此存放用户自建的工具（§10.1）。
 */

import { getDb } from './db'
import { STORE } from './schema'
import { clearStore, count, deleteOne, getAll, getOne, putOne } from './core'
import { deepClone } from '@/lib/clone'
import type { Tool, ToolCategory } from '@/types'

export async function listTools(): Promise<Tool[]> {
  const db = await getDb()
  return getAll<Tool>(db, STORE.tools)
}

export async function getTool(id: string): Promise<Tool | undefined> {
  const db = await getDb()
  return getOne<Tool>(db, STORE.tools, id)
}

export async function saveTool(tool: Tool): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.tools, deepClone(tool))
}

export async function deleteTool(id: string): Promise<void> {
  const db = await getDb()
  await deleteOne(db, STORE.tools, id)
}

export async function countTools(): Promise<number> {
  const db = await getDb()
  return count(db, STORE.tools)
}

export async function clearTools(): Promise<void> {
  const db = await getDb()
  await clearStore(db, STORE.tools)
}

/** 按分类分组（工具库面板使用，纯函数） */
export function groupByCategory(tools: readonly Tool[]): Map<ToolCategory, Tool[]> {
  const groups = new Map<ToolCategory, Tool[]>()
  for (const tool of tools) {
    const list = groups.get(tool.category)
    if (list) list.push(tool)
    else groups.set(tool.category, [tool])
  }
  return groups
}
