/**
 * 工具库 Store
 *
 * 内置工具（不落库）与自定义工具（落库）在这里合并为统一的"可用工具"视图，
 * 并承载"停用内置工具"这一用户偏好（写入 settings.disabledBuiltinTools）。
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Tool, ToolCategory, ToolRef } from '@/types/project'
import {
  builtinTools,
  createCustomTool,
  removeCustomTool,
  resolveToolRef,
  searchTools,
  toDisplayTool,
  updateCustomTool,
  listTools,
  type CustomToolInput,
  type DisplayTool,
} from '@/services/toolService'
import { groupBy, orderGroups } from '@/lib/util'
import { TOOL_CATEGORIES } from '@/data/builtinTools'
import { useSettingsStore } from './useSettingsStore'

export const useToolsStore = defineStore('tools', () => {
  const settings = useSettingsStore()

  /** 自定义工具列表（浅响应式：工具对象体积小，但保持与项目列表一致的约定） */
  const customTools = shallowRef<Tool[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)
  const query = ref('')

  /** 内置工具（含停用状态） */
  const builtins = computed(() => builtinTools(settings.settings.disabledBuiltinTools))

  /** 全部可用工具（不含停用的内置工具） */
  const available = computed<DisplayTool[]>(() => [
    ...builtins.value.filter((tool) => !tool.disabled).map(toDisplayTool),
    ...customTools.value.map(toDisplayTool),
  ])

  /** 设置页展示用：全部内置工具（含停用） */
  const allBuiltins = computed(() => builtins.value.map(toDisplayTool))

  const searchResults = computed(() => searchTools(available.value, query.value))

  /** 按分类分组（保持 TOOL_CATEGORIES 的顺序） */
  const grouped = computed(() =>
    orderGroups(
      groupBy(available.value, (tool) => tool.category),
      TOOL_CATEGORIES.map((item) => item.id),
    ),
  )

  const customCount = computed(() => customTools.value.length)
  const builtinCount = computed(() => builtins.value.length)
  const disabledCount = computed(
    () => settings.settings.disabledBuiltinTools.length,
  )

  async function load(): Promise<void> {
    loading.value = true
    try {
      customTools.value = await listTools()
      lastError.value = null
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }

  /** 解析一个工具引用为可展示的工具 */
  function resolve(ref: ToolRef): DisplayTool {
    return resolveToolRef(ref, customTools.value, builtins.value)
  }

  function byId(id: string): DisplayTool | undefined {
    return available.value.find((tool) => tool.id === id)
  }

  // ————————————————————————————————————————————————————————
  // 自定义工具 CRUD
  // ————————————————————————————————————————————————————————

  async function create(input: CustomToolInput): Promise<boolean> {
    const result = await createCustomTool(input)
    if (!result.ok) {
      lastError.value = result.error
      return false
    }
    customTools.value = [...customTools.value, result.value]
    return true
  }

  async function update(id: string, patch: Partial<CustomToolInput>): Promise<boolean> {
    const result = await updateCustomTool(id, patch)
    if (!result.ok) {
      lastError.value = result.error
      return false
    }
    customTools.value = customTools.value.map((tool) =>
      tool.id === id ? result.value : tool,
    )
    return true
  }

  async function remove(id: string): Promise<boolean> {
    const result = await removeCustomTool(id)
    if (!result.ok) {
      lastError.value = result.error
      return false
    }
    customTools.value = customTools.value.filter((tool) => tool.id !== id)
    return true
  }

  // ————————————————————————————————————————————————————————
  // 内置工具偏好
  // ————————————————————————————————————————————————————————

  /** 停用 / 启用某个内置工具（按 builtinKey 记录） */
  async function setBuiltinDisabled(builtinKey: string, disabled: boolean): Promise<void> {
    const current = new Set(settings.settings.disabledBuiltinTools)
    if (disabled) current.add(builtinKey)
    else current.delete(builtinKey)
    await settings.patch({ disabledBuiltinTools: Array.from(current) })
  }

  async function restoreBuiltins(): Promise<void> {
    await settings.patch({ disabledBuiltinTools: [] })
  }

  function setQuery(value: string): void {
    query.value = value
  }

  function categoryLabelKey(category: ToolCategory): string {
    return TOOL_CATEGORIES.find((item) => item.id === category)?.labelKey ?? 'tools.category.other'
  }

  return {
    customTools,
    loading,
    lastError,
    query,
    builtins,
    allBuiltins,
    available,
    searchResults,
    grouped,
    customCount,
    builtinCount,
    disabledCount,
    load,
    resolve,
    byId,
    create,
    update,
    remove,
    setBuiltinDisabled,
    restoreBuiltins,
    setQuery,
    categoryLabelKey,
  }
})
