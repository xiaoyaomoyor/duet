/**
 * PWA 接线（§17 M5-3）
 *
 * 三件事：
 *   1. **注册 Service Worker**（`registerType: 'prompt'`）——离线可用
 *   2. **新版本提示**——检测到新 SW 就提示用户刷新，绝不静默接管
 *   3. **安装提示**——捕获 `beforeinstallprompt`，让用户能装到桌面
 *
 * 为什么注册类型选 prompt 而不是 autoUpdate：
 *   这是一个"用户正在编辑内容"的应用。自动更新会在用户不知情时
 *   把页面换成新版本，正在填的输入框状态可能就没了。
 *   宁可多问一句，也不要替用户做这个决定。
 *
 * 本模块用模块级单例保存状态：PWA 是**应用级**能力，
 * 不应该因为某个组件卸载就丢掉"已经可以安装"这个事实。
 */

import { readonly, ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { t } from '@/i18n/helper'
import { useUiStore } from '@/stores/useUiStore'

/** Chromium 的安装提示事件（TS 标准库尚未收录） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** 是否可以弹出安装提示（浏览器已判定"可安装"且用户没装过） */
const canInstall = ref(false)
/** 是否运行在已安装的窗口中（standalone 显示模式） */
const installed = ref(false)
/** 离线资源是否已经就绪（首次安装后为 true） */
const offlineReady = ref(false)

let deferredPrompt: BeforeInstallPromptEvent | null = null
let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null
let started = false

/** 是否以独立窗口运行（已安装的 PWA / Tauri） */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari 用的是非标准的 navigator.standalone
  return (window.navigator as { standalone?: boolean }).standalone === true
}

/**
 * 启动 PWA 接线。**只应在应用根部调用一次**（App.vue 的 onMounted）。
 * 重复调用是安全的：内部用 started 去重。
 */
export function startPwa(): void {
  if (started || typeof window === 'undefined') return
  started = true

  installed.value = detectStandalone()

  const ui = useUiStore()

  // —— 安装提示 ——
  window.addEventListener('beforeinstallprompt', (event) => {
    // 必须阻止默认行为，否则浏览器会立刻弹出自己的迷你提示条，
    // 我们就再也没有机会在合适的时机问用户了
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true

    ui.notify(t('pwa.installHint'), 'info', {
      duration: 8000,
      actionLabel: t('pwa.install'),
      onAction: () => void install(),
    })
  })

  window.addEventListener('appinstalled', () => {
    canInstall.value = false
    deferredPrompt = null
    installed.value = true
    ui.notify(t('pwa.installed'), 'success')
  })

  // —— Service Worker ——
  // immediate: true 让 SW 立刻注册，而不是等页面 load 完；
  // 对"打开就想离线用"的场景差别很明显。
  updateServiceWorker = registerSW({
    immediate: true,

    onOfflineReady() {
      offlineReady.value = true
      ui.notify(t('pwa.offlineReady'), 'success')
    },

    onNeedRefresh() {
      // duration 0 = 不自动消失：更新提示是"要不要现在就换版本"，
      // 替用户决定（无论消失还是自动更新）都不合适
      ui.notify(t('pwa.updateReady'), 'info', {
        duration: 0,
        actionLabel: t('pwa.reload'),
        onAction: () => void updateServiceWorker?.(true),
      })
    },

    onRegisterError(error: unknown) {
      // 注册失败不是致命问题（离线能力没了而已），不打扰用户，仅记录
      console.warn('[duet/pwa] Service Worker 注册失败：', error)
    },
  })
}

/** 触发安装提示；返回用户是否接受 */
export async function install(): Promise<boolean> {
  const prompt = deferredPrompt
  if (!prompt) return false

  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    const accepted = choice.outcome === 'accepted'
    if (accepted) canInstall.value = false
    // 无论接受与否，这个事件都只能用一次
    deferredPrompt = null
    if (!accepted) canInstall.value = false
    return accepted
  } catch {
    deferredPrompt = null
    canInstall.value = false
    return false
  }
}

/** 立即应用更新 */
export async function applyUpdate(): Promise<void> {
  await updateServiceWorker?.(true)
}

/** 供组件读取的只读状态（不要直接改这些值） */
export function pwaState(): {
  canInstall: Readonly<typeof canInstall>
  installed: Readonly<typeof installed>
  offlineReady: Readonly<typeof offlineReady>
} {
  return {
    canInstall: readonly(canInstall),
    installed: readonly(installed),
    offlineReady: readonly(offlineReady),
  }
}

/** 测试用：重置单例状态 */
export function __resetPwaForTests(): void {
  started = false
  deferredPrompt = null
  updateServiceWorker = null
  canInstall.value = false
  installed.value = false
  offlineReady.value = false
}
