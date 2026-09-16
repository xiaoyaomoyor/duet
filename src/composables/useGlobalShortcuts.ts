/**
 * 全局快捷键（应用级，只注册一次）
 *
 * 为什么现在才补：M7 把顶栏的"撤回/重做"按钮撤掉了，理由是
 * "有 Ctrl+Z / Ctrl+Shift+Z 就够了"。但**这两个快捷键此前并不存在**——
 * 按钮是当时唯一的入口。先补快捷键再撤按钮，顺序不能反，
 * 否则用户会直接失去撤销能力（而且不会报错，只是按了没反应）。
 *
 * 当前绑定：
 *   Ctrl/Cmd + Z          撤回
 *   Ctrl/Cmd + Shift + Z  重做
 *   Ctrl/Cmd + Y          重做（Windows 上更习惯的另一个键位）
 *   Ctrl/Cmd + E          切换 编辑视图 / 展示视图
 *   Ctrl/Cmd + K          打开命令面板（原先挂在 TopBar 上，一并收拢到这里）
 *
 * 两条"不该抢"的规则：
 *   1. 焦点在输入框里时不拦 Ctrl+Z —— 那是**文本框自己的**撤销，
 *      拦下来会变成"改一个字，撤销一步退回整个模块"，非常反直觉。
 *   2. 有模态弹窗时不响应 Ctrl+E —— 编辑弹窗开着的时候切视图，
 *      用户会连自己刚才在改哪张卡片都找不到。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'

/** 焦点是否落在可编辑控件里（决定 Ctrl+Z 归谁） */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * 是否开着模态弹窗。
 *
 * 用 `[aria-modal="true"]` 而不是某个 store 标志位：
 * 项目里所有弹窗（模块编辑、选择器、确认框、工具表单）都写了
 * aria-modal，这是它们唯一的共同点——按属性查是唯一不会漏的做法，
 * 也不需要让每个弹窗都记得去 store 里登记自己。
 */
function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

export function useGlobalShortcuts(): void {
  const project = useProjectStore()
  const ui = useUiStore()

  function onKeydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey
    if (!mod || event.altKey) return

    // Ctrl+K：命令面板。刻意不受输入焦点限制——它本来就是"跳到别处去"的入口
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault()
      ui.toggleCommandPalette()
      return
    }

    // Ctrl+E：切换视图。刻意**不**看输入焦点：
    // 行标题这类内联输入框就在画布上，正在里面打字时按 Ctrl+E 想切视图是合理的，
    // 而 Ctrl+E 也不是任何输入控件的原生快捷键，不存在"抢"的问题。
    if (event.key.toLowerCase() === 'e' && !event.shiftKey) {
      if (!project.current || hasOpenModal()) return
      event.preventDefault()
      project.setMode(project.current.ui.mode === 'present' ? 'edit' : 'present')
      return
    }

    if (isTypingTarget(event.target)) return

    const key = event.key.toLowerCase()
    if (key === 'z' && !event.shiftKey) {
      if (!project.canUndo) return
      event.preventDefault()
      project.undo()
      return
    }
    if ((key === 'z' && event.shiftKey) || key === 'y') {
      if (!project.canRedo) return
      event.preventDefault()
      project.redo()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
