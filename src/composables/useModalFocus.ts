import { onBeforeUnmount, watch, type Ref } from 'vue'

interface Modal {
  root: HTMLElement
  layer: HTMLElement
  previous: HTMLElement | null
  close: () => void
  zIndex: string
}

const stack: Modal[] = []
const inertBefore = new Map<HTMLElement, boolean>()
let observer: MutationObserver | undefined
const selector = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.matches(':disabled') &&
      !node.closest('[inert]') &&
      node.getClientRects().length > 0,
  )
}

function focusInside(modal: Modal): void {
  const preferred = modal.root.querySelector<HTMLElement>('[data-modal-autofocus], [autofocus]')
  const target =
    preferred && focusable(modal.root).includes(preferred)
      ? preferred
      : (focusable(modal.root)[0] ?? modal.root)
  target.focus({ preventScroll: true })
}

function syncBackground(): void {
  const active = stack.at(-1)
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || child.matches('script, style, link')) continue
    if (!inertBefore.has(child)) inertBefore.set(child, child.inert)
    child.inert = active ? child !== active.layer : (inertBefore.get(child) ?? false)
  }
  stack.forEach((modal, index) => {
    modal.layer.style.zIndex = `calc(var(--z-modal) + ${index + 1})`
  })
}

function onKeydown(event: KeyboardEvent): void {
  const active = stack.at(-1)
  if (!active) return
  // 模态窗口打开时，按键仍可交给内部表单，但不能触发背景的演示/编辑快捷键。
  if (event.key === 'Escape' && !event.isComposing) {
    event.preventDefault()
    event.stopImmediatePropagation()
    active.close()
  } else if (event.key === 'Tab') {
    const items = focusable(active.root)
    const current = document.activeElement
    if (
      !items.length ||
      !active.root.contains(current) ||
      (event.shiftKey ? current === items[0] || current === active.root : current === items.at(-1))
    ) {
      event.preventDefault()
      ;(event.shiftKey ? (items.at(-1) ?? active.root) : (items[0] ?? active.root)).focus()
    }
  }
}

function onFocus(event: FocusEvent): void {
  const active = stack.at(-1)
  if (active && !active.root.contains(event.target as Node)) focusInside(active)
}

/** Teleport 弹窗共用的焦点栈：嵌套窗口只响应最上层的 Escape。 */
export function useModalFocus(root: Ref<HTMLElement | null>, close: () => void): void {
  let entry: Modal | undefined
  function release(): void {
    if (!entry) return
    const wasTop = stack.at(-1) === entry
    stack.splice(stack.indexOf(entry), 1)
    entry.layer.style.zIndex = entry.zIndex
    syncBackground()
    if (!stack.length) {
      observer?.disconnect()
      observer = undefined
      for (const [node, inert] of inertBefore) node.inert = inert
      inertBefore.clear()
      window.removeEventListener('keydown', onKeydown, true)
      document.removeEventListener('focusin', onFocus, true)
    }
    if (wasTop) {
      const previous = entry.previous
      if (previous?.isConnected && !previous.closest('[inert]'))
        previous.focus({ preventScroll: true })
      else if (stack.at(-1)) focusInside(stack.at(-1)!)
    }
    entry = undefined
  }
  watch(
    root,
    (element) => {
      release()
      if (!element) return
      let layer = element
      while (layer.parentElement && layer.parentElement !== document.body)
        layer = layer.parentElement
      entry = {
        root: element,
        layer,
        close,
        zIndex: layer.style.zIndex,
        previous: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      }
      element.tabIndex = -1
      stack.push(entry)
      if (stack.length === 1) {
        window.addEventListener('keydown', onKeydown, true)
        document.addEventListener('focusin', onFocus, true)
        observer = new MutationObserver(syncBackground)
        observer.observe(document.body, { childList: true })
      }
      syncBackground()
      focusInside(entry)
    },
    { flush: 'post' },
  )
  onBeforeUnmount(release)
}
