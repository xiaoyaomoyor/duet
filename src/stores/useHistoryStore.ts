/**
 * 撤销 / 重做 Store
 *
 * 每个条目保存一对"项目快照 + 合并键"，撤销即把项目整体替换回上一版。
 * 快照方案的优势是绝对正确（不存在补丁写错导致的状态漂移），
 * 代价是内存占用；配合 MAX_DEPTH 与合并窗口足够可控（§8.3）。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { deepClone } from '@/lib/clone'
import type { Project } from '@/types/project'

/** 历史栈深度上限 */
export const MAX_HISTORY_DEPTH = 100

/** 同一合并键在此时间窗内的连续操作会被合并成一步 */
export const COALESCE_WINDOW_MS = 800

export interface HistoryEntry {
  before: Project
  after: Project
  label: string
  /** 连续输入合并键，如 `module:text:<id>` */
  coalesceKey?: string
  at: number
}

export const useHistoryStore = defineStore('history', () => {
  const past = ref<HistoryEntry[]>([])
  const future = ref<HistoryEntry[]>([])

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const depth = computed(() => past.value.length)

  /**
   * 记录一次变更。
   * 若传入的 coalesceKey 与栈顶相同且在上次记录后的时间窗内，则**合并**为一步
   * （避免"打一行字要撤销 40 次"）。
   */
  function record(entry: Omit<HistoryEntry, 'at'> & { at?: number }): void {
    const at = entry.at ?? Date.now()
    const top = past.value[past.value.length - 1]

    const mergeable =
      top !== undefined &&
      entry.coalesceKey !== undefined &&
      top.coalesceKey === entry.coalesceKey &&
      at - top.at <= COALESCE_WINDOW_MS

    if (mergeable && top) {
      // 保留最初的 before，替换 after
      past.value = [
        ...past.value.slice(0, -1),
        { ...top, after: deepClone(entry.after), at },
      ]
    } else {
      const next: HistoryEntry = {
        before: deepClone(entry.before),
        after: deepClone(entry.after),
        label: entry.label,
        at,
      }
      if (entry.coalesceKey !== undefined) next.coalesceKey = entry.coalesceKey

      const stack = [...past.value, next]
      past.value = stack.length > MAX_HISTORY_DEPTH ? stack.slice(stack.length - MAX_HISTORY_DEPTH) : stack
    }

    // 任何新操作都会截断重做分支
    future.value = []
  }

  /** 取出上一步的 before（由调用方负责写回项目） */
  function undo(): Project | null {
    const entry = past.value[past.value.length - 1]
    if (!entry) return null

    past.value = past.value.slice(0, -1)
    future.value = [...future.value, entry]
    return deepClone(entry.before)
  }

  /** 取出下一步的 after */
  function redo(): Project | null {
    const entry = future.value[future.value.length - 1]
    if (!entry) return null

    future.value = future.value.slice(0, -1)
    past.value = [...past.value, entry]
    return deepClone(entry.after)
  }

  function clear(): void {
    past.value = []
    future.value = []
  }

  /** 最近一步的操作名（用于菜单提示，如"撤销 修改标题"） */
  const undoLabel = computed(() => past.value[past.value.length - 1]?.label ?? '')
  const redoLabel = computed(() => future.value[future.value.length - 1]?.label ?? '')

  return {
    past,
    future,
    canUndo,
    canRedo,
    depth,
    undoLabel,
    redoLabel,
    record,
    undo,
    redo,
    clear,
  }
})
