/**
 * 工具（生产源）服务
 *
 * 内置工具来自 data/builtinTools.ts（不落库）；
 * 自定义工具存 tools 存储。两者通过 resolveTool 统一解析，
 * 调用方不需要关心某个 ToolRef 指向的是哪一种。
 */

import { listTools, saveTool, deleteTool as deleteToolRow, getTool } from '@/db/toolsRepo'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { err, ok, type Result } from '@/lib/result'
import { resolveBuiltinTools, type ResolvedTool } from '@/data/builtinTools'
import { pickToolColor } from '@/lib/icons'
import { normalizeForSearch } from '@/lib/text'
import type { BuiltinToolOverride, Tool, ToolCategory, ToolRef } from '@/types/project'

export { listTools, getTool }

// ——————————————————————————————————————————————————————————
// 解析
// ——————————————————————————————————————————————————————————

/** 解析结果：统一的展示形态 */
export interface DisplayTool {
  id: string
  name: string
  vendor: string
  category: ToolCategory
  /** 品牌色（用于程序化图标与柔和底色） */
  color: string
  iconAssetId?: string
  homepage?: string
  /** 搜索别名（名称本身始终可被搜到） */
  aliases: string[]
  /** 内置工具的稳定键；自定义工具为 undefined */
  builtinKey?: string
  builtin: boolean
  disabled: boolean
  /** 内置工具是否被用户改写（设置页显示一个"已自定义"的角标） */
  overridden?: boolean
  /** 临时工具（未入库，仅存在于当前对比页） */
  inline: boolean
}

const UNKNOWN_TOOL: DisplayTool = {
  id: 'unknown',
  name: '未知工具',
  vendor: '',
  category: 'other',
  color: '#8c82aa',
  aliases: [],
  builtin: false,
  disabled: false,
  inline: false,
}

/**
 * 把工具引用解析为可展示的工具。
 *
 * 找不到时会返回一个"未知工具"占位而非抛错：
 * 工程文件可能来自其他用户，引用了本地不存在的工具（§6.4 导入合并语义）。
 */
export function resolveToolRef(
  ref: ToolRef,
  tools: readonly Tool[],
  builtinTools: readonly ResolvedTool[],
): DisplayTool {
  if (ref.kind === 'inline') {
    const result: DisplayTool = {
      ...UNKNOWN_TOOL,
      id: `inline:${ref.name}`,
      name: ref.name,
      aliases: [],
      category: 'other',
      color: pickToolColor(ref.name),
      inline: true,
    }
    if (ref.iconAssetId !== undefined) result.iconAssetId = ref.iconAssetId
    return result
  }

  if (ref.kind === 'builtin') {
    const found = builtinTools.find((tool) => tool.id === ref.toolId)
    if (!found) return UNKNOWN_TOOL
    return toDisplayTool(found)
  }

  const custom = tools.find((tool) => tool.id === ref.toolId)
  if (!custom) return UNKNOWN_TOOL
  return toDisplayTool(custom)
}

export function toDisplayTool(tool: Tool | ResolvedTool): DisplayTool {
  const result: DisplayTool = {
    id: tool.id,
    name: tool.name,
    vendor: tool.vendor ?? '',
    category: tool.category,
    color: tool.color ?? pickToolColor(tool.name),
    aliases: [...tool.aliases],
    builtin: tool.kind === 'builtin',
    disabled: 'disabled' in tool ? tool.disabled === true : false,
    overridden: 'overridden' in tool ? tool.overridden === true : false,
    inline: false,
  }
  if (tool.iconAssetId !== undefined) result.iconAssetId = tool.iconAssetId
  if (tool.homepage !== undefined) result.homepage = tool.homepage
  if (tool.builtinKey !== undefined) result.builtinKey = tool.builtinKey
  return result
}

/** 内置工具列表（含停用 / 改写 / 删除状态） */
export function builtinTools(
  disabledKeys: readonly string[],
  overrides: Record<string, BuiltinToolOverride> = {},
  removedKeys: readonly string[] = [],
): ResolvedTool[] {
  return resolveBuiltinTools(disabledKeys, overrides, removedKeys)
}

// ——————————————————————————————————————————————————————————
// 自定义工具 CRUD
// ——————————————————————————————————————————————————————————

export interface CustomToolInput {
  name: string
  vendor?: string
  category: ToolCategory
  color?: string
  iconAssetId?: string
  homepage?: string
  aliases?: string[]
}

/** 新建一个自定义工具 */
export async function createCustomTool(
  input: CustomToolInput,
): Promise<Result<Tool, string>> {
  const name = input.name.trim()
  if (!name) return err('工具名称不能为空')

  const tool: Tool = {
    id: uuid(),
    kind: 'custom',
    name,
    category: input.category,
    color: input.color ?? pickToolColor(name),
    aliases: normalizeAliases(input.aliases, name),
    createdAt: Date.now(),
  }
  if (input.vendor) tool.vendor = input.vendor.trim()
  if (input.iconAssetId) tool.iconAssetId = input.iconAssetId
  if (input.homepage) tool.homepage = input.homepage.trim()

  try {
    await saveTool(tool)
    return ok(tool)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 更新自定义工具（只允许改自定义工具，内置工具不落库） */
export async function updateCustomTool(
  id: string,
  patch: Partial<CustomToolInput>,
): Promise<Result<Tool, string>> {
  const existing = await getTool(id)
  if (!existing) return err('工具不存在')
  if (existing.kind === 'builtin') return err('内置工具不可编辑，可在设置中停用')

  const next: Tool = deepClone(existing)
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return err('工具名称不能为空')
    next.name = name
  }
  if (patch.vendor !== undefined) next.vendor = patch.vendor.trim()
  if (patch.category !== undefined) next.category = patch.category
  if (patch.color !== undefined) next.color = patch.color
  if (patch.homepage !== undefined) next.homepage = patch.homepage.trim()
  if (patch.iconAssetId !== undefined) next.iconAssetId = patch.iconAssetId
  if (patch.aliases !== undefined) next.aliases = normalizeAliases(patch.aliases, next.name)

  try {
    await saveTool(next)
    return ok(next)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 删除自定义工具 */
export async function removeCustomTool(id: string): Promise<Result<void, string>> {
  const existing = await getTool(id)
  if (!existing) return err('工具不存在')
  if (existing.kind === 'builtin') return err('内置工具不可删除，可在设置中停用')

  try {
    await deleteToolRow(id)
    return ok(undefined)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

// ——————————————————————————————————————————————————————————
// 搜索
// ——————————————————————————————————————————————————————————

/** 按名称/厂商/别名搜索工具（大小写与空格不敏感） */
export function searchTools<T extends { name: string; vendor?: string; aliases: string[] }>(
  tools: readonly T[],
  query: string,
): T[] {
  const q = normalizeForSearch(query)
  if (!q) return [...tools]

  return tools.filter((tool) => {
    if (normalizeForSearch(tool.name).includes(q)) return true
    if (normalizeForSearch(tool.vendor ?? '').includes(q)) return true
    return tool.aliases.some((alias) => normalizeForSearch(alias).includes(q))
  })
}

function normalizeAliases(aliases: string[] | undefined, name: string): string[] {
  const list = (aliases ?? [])
    .flatMap((alias) => alias.split(/[,，;；]/))
    .map((alias) => alias.trim())
    .filter(Boolean)

  // 名称本身始终可被搜索到，无需重复写入别名
  return Array.from(new Set(list.filter((alias) => alias !== name)))
}
