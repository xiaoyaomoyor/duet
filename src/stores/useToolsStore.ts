/**
 * 工具库 Store
 *
 * 内置工具（不落库）与自定义工具（落库）在这里合并为统一的"可用工具"视图，
 * 并承载"停用内置工具"这一用户偏好（写入 settings.disabledBuiltinTools）。
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { BuiltinToolOverride, Tool, ToolCategory, ToolRef } from '@/types/project'
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

  /** 内置工具（含停用 / 改写 / 删除状态） */
  const builtins = computed(() =>
    builtinTools(
      settings.settings.disabledTools,
      settings.settings.builtinToolOverrides,
      settings.settings.removedBuiltinTools,
    ),
  )

  /** 全部可用工具（不含停用的） */
  const available = computed<DisplayTool[]>(() => [
    ...builtins.value.filter((tool) => !tool.disabled).map(toDisplayTool),
    ...customTools.value.filter((tool) => !isDisabled(tool.id)).map(toDisplayTool),
  ])

  /** 设置页展示用：全部内置工具（含停用） */
  const allBuiltins = computed(() => builtins.value.map(toDisplayTool))

  /** 设置页展示用：全部自定义工具（含停用） */
  const allCustom = computed(() =>
    customTools.value.map((tool) =>
      toDisplayTool({ ...tool, disabled: isDisabled(tool.id) } as Tool & { disabled: boolean }),
    ),
  )

  /**
   * 设置页的统一列表：内置与自定义混在一起按分类展示。
   *
   * 用户的要求是"整合自定义工具与内置工具"——两者在**界面上**应当完全同等，
   * 因此这里合成一个列表，而不是像以前那样分成上下两块、能力还不一样。
   */
  const allTools = computed<DisplayTool[]>(() => [...allBuiltins.value, ...allCustom.value])

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
  /** 被删掉的内置工具数量（用于"恢复内置工具"按钮） */
  const removedCount = computed(() => settings.settings.removedBuiltinTools.length)
  const disabledCount = computed(() => settings.settings.disabledTools.length)

  function isDisabled(id: string): boolean {
    return settings.settings.disabledTools.includes(id)
  }

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
  // 工具偏好（内置与自定义同等对待）
  // ————————————————————————————————————————————————————————

  /**
   * 停用 / 启用任意工具。
   *
   * 内置传 builtinKey、自定义传工具 id——数据层就是同一个列表
   * （见 AppSettings.disabledTools 的说明），因此这里只有一份实现。
   */
  async function setDisabled(key: string, disabled: boolean): Promise<void> {
    if (!key) return
    const current = new Set(settings.settings.disabledTools)
    if (disabled) current.add(key)
    else current.delete(key)
    await settings.patch({ disabledTools: Array.from(current) })
  }

  /** 删除内置工具（屏蔽掉，可在同一处恢复） */
  async function removeBuiltin(builtinKey: string): Promise<void> {
    const removed = new Set(settings.settings.removedBuiltinTools)
    removed.add(builtinKey)
    // 顺手从"停用"里摘掉：一个工具不该同时是"已删除"和"已停用"
    const disabled = settings.settings.disabledTools.filter((key) => key !== builtinKey)
    await settings.patch({ removedBuiltinTools: Array.from(removed), disabledTools: disabled })
  }

  /** 改写内置工具的若干字段（只记差异，未改的继续跟着内置种子表走） */
  async function overrideBuiltin(
    builtinKey: string,
    patch: BuiltinToolOverride,
  ): Promise<void> {
    const next = { ...settings.settings.builtinToolOverrides }
    next[builtinKey] = { ...(next[builtinKey] ?? {}), ...patch }
    await settings.patch({ builtinToolOverrides: next })
  }

  /** 把某个内置工具恢复成出厂状态（清掉改写） */
  async function resetBuiltinOverride(builtinKey: string): Promise<void> {
    const next = { ...settings.settings.builtinToolOverrides }
    delete next[builtinKey]
    await settings.patch({ builtinToolOverrides: next })
  }

  /** 恢复全部内置工具（取消所有删除与改写） */
  async function restoreBuiltins(): Promise<void> {
    await settings.patch({
      removedBuiltinTools: [],
      builtinToolOverrides: {},
      disabledTools: settings.settings.disabledTools.filter(
        (key) => !settings.settings.removedBuiltinTools.includes(key),
      ),
    })
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
    allCustom,
    allTools,
    available,
    searchResults,
    grouped,
    customCount,
    builtinCount,
    removedCount,
    disabledCount,
    isDisabled,
    load,
    resolve,
    byId,
    create,
    update,
    remove,
    setDisabled,
    removeBuiltin,
    overrideBuiltin,
    resetBuiltinOverride,
    restoreBuiltins,
    setQuery,
    categoryLabelKey,
  }
})
