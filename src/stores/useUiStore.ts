/**
 * 界面状态 Store（纯瞬时状态，不落盘）
 *
 * 只存"当前这一屏长什么样"的信息；任何需要持久化的内容都属于 project / settings。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { APP } from '@/app.config'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** 可选操作（如"撤销"） */
  actionLabel?: string
  onAction?: () => void
}

export const useUiStore = defineStore('ui', () => {
  // —— 布局 ——
  const sidebarCollapsed = ref(false)
  const inspectorOpen = ref(false)
  /** 侧栏宽度（px）；持久化值在 settings 中，这里只存拖拽过程中的实时值 */
  const sidebarWidth = ref<number>(APP.sidebar.defaultWidth)
  const sidebarDragging = ref(false)

  // —— 弹窗与提示 ——
  const toasts = ref<Toast[]>([])
  const activeDialog = ref<string | null>(null)

  // —— 命令面板（M3 使用，M0 先留出状态位） ——
  const commandPaletteOpen = ref(false)

  let toastSeq = 0

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setSidebarWidth(width: number): void {
    sidebarWidth.value = Math.min(APP.sidebar.max, Math.max(APP.sidebar.min, Math.round(width)))
  }

  function toggleInspector(): void {
    inspectorOpen.value = !inspectorOpen.value
  }

  function openDialog(id: string): void {
    activeDialog.value = id
  }

  function closeDialog(): void {
    activeDialog.value = null
  }

  function toggleCommandPalette(force?: boolean): void {
    commandPaletteOpen.value = force ?? !commandPaletteOpen.value
  }

  function notify(
    message: string,
    tone: ToastTone = 'info',
    options: { duration?: number; actionLabel?: string; onAction?: () => void } = {},
  ): number {
    toastSeq += 1
    const id = toastSeq
    const toast: Toast = { id, message, tone }
    if (options.actionLabel) toast.actionLabel = options.actionLabel
    if (options.onAction) toast.onAction = options.onAction
    toasts.value = [...toasts.value, toast]

    const duration = options.duration ?? 2400
    if (duration > 0) {
      window.setTimeout(() => dismissToast(id), duration)
    }
    return id
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  const hasToasts = computed(() => toasts.value.length > 0)
  /** 是否处于"紧凑外壳"（侧栏折叠）状态 */
  const compactShell = computed(() => sidebarCollapsed.value)

  return {
    sidebarCollapsed,
    sidebarWidth,
    sidebarDragging,
    toasts,
    activeDialog,
    commandPaletteOpen,
    hasToasts,
    compactShell,
    toggleSidebar,
    setSidebarWidth,
    toggleInspector,
    openDialog,
    closeDialog,
    toggleCommandPalette,
    notify,
    dismissToast,
  }
})
