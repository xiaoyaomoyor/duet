/**
 * 平台适配层（§18 K10）
 *
 * 为什么必须有这一层：
 *   同一套 Web 代码要跑在三种环境里：浏览器、已安装的 PWA、Tauri 桌面版。
 *   三者在"读文件 / 存文件 / 抓外链"上能力完全不同：
 *     - 浏览器：能选文件、能下载，但抓外链会被 CORS 拦
 *     - PWA   ：同上（安装与否不改变这些限制）
 *     - Tauri ：有真正的文件系统，请求由 Rust 侧发出，**完全绕开 CORS**
 *
 *   如果把 `'__TAURI__' in window` 这样的判断散落在业务代码里，
 *   每加一处能力就要改一片地方，而且很容易在 Web 版上误走桌面分支。
 *   因此这里收敛成一组**能力函数**，业务只问"能不能"和"帮我做"。
 *
 * 纪律：本文件是**唯一**允许探测运行环境的地方。
 *
 * 为什么用 `window.__TAURI__` 全局对象而不是 `@tauri-apps/api` npm 包：
 *   桌面版目前无法在开发机上构建（没装 Rust 工具链），
 *   引入三个无法验证的 npm 依赖会给**所有** Web 构建增加解析风险，
 *   收益却只是省下几个类型声明。因此改为依赖 Tauri 的全局对象
 *   （`tauri.conf.json` 里 `app.withGlobalTauri: true` 开启），
 *   只在本文件顶部声明用到的那几个方法签名。
 */

import { APP } from '@/app.config'
import { err, ok, type Result } from '@/lib/result'

/** Tauri 2 在 `withGlobalTauri: true` 时注入的全局对象（只声明我们用到的部分） */
interface TauriGlobal {
  core?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> }
  dialog?: {
    open: (options: Record<string, unknown>) => Promise<string | string[] | null>
    save: (options: Record<string, unknown>) => Promise<string | null>
  }
  fs?: {
    readTextFile: (path: string) => Promise<string>
    writeTextFile: (path: string, contents: string) => Promise<void>
  }
  event?: {
    listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
  }
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null
  const global = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
  return global ?? null
}

/** 是否运行在 Tauri 桌面版 */
export function isTauri(): boolean {
  return tauri() !== null
}

/** 当前平台标识（用于"关于"面板与错误提示） */
export type Platform = 'web' | 'tauri'

export function currentPlatform(): Platform {
  return isTauri() ? 'tauri' : 'web'
}

// ——————————————————————————————————————————————————————————
// 抓取外链
// ——————————————————————————————————————————————————————————

export interface FetchRemoteOptions {
  timeoutMs?: number
  maxBytes?: number
}

/**
 * 抓取一个外部 URL 的内容。
 *
 * 桌面版走 Rust 侧的原生命令，**不受 CORS 限制**——这是桌面版最实在的收益：
 * 用户可以直接粘 Suno / Midjourney 的图片链接，不需要先下载再上传。
 * Web 版只能走普通 fetch，对方没开 CORS 就会失败，此时错误信息会明确
 * 告诉用户"这是跨域限制，请下载后上传"，而不是含糊的 "Failed to fetch"。
 */
export async function fetchRemote(
  url: string,
  options: FetchRemoteOptions = {},
): Promise<Result<Blob, string>> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024

  const bridge = tauri()
  const invoke = bridge?.core?.invoke
  if (bridge && invoke) {
    try {
      // Rust 侧返回 Vec<u8>，经 JSON 到达这里是一个普通数组
      const bytes = await invoke<number[]>('fetch_remote', { url, maxBytes })
      return ok(new Blob([new Uint8Array(bytes)]))
    } catch (error) {
      return err(describeError(error))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal, mode: 'cors' })
    if (!response.ok) return err(`HTTP ${response.status}`)

    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > maxBytes) return err(`文件体积 ${mb(length)} 超过上限`)

    const blob = await response.blob()
    if (blob.size > maxBytes) return err(`文件体积 ${mb(blob.size)} 超过上限`)
    return ok(blob)
  } catch (error) {
    // 浏览器把 CORS 失败与网络失败都报成 TypeError，只能给出综合解释
    if (error instanceof DOMException && error.name === 'AbortError') return err('请求超时')
    return err(
      '浏览器无法直接读取该链接（多为对方站点未开放跨域访问）。' +
        '请下载到本地后上传；桌面版可直接读取。',
    )
  } finally {
    clearTimeout(timer)
  }
}

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`
}

// ——————————————————————————————————————————————————————————
// 打开 / 保存文本文件
// ——————————————————————————————————————————————————————————

/** 让用户挑一个文本文件并读出内容；取消选择时返回 null */
export async function openTextFile(
  accept = `.${APP.fileExt},application/json`,
): Promise<Result<{ name: string; text: string } | null, string>> {
  const bridge = tauri()
  if (bridge?.dialog && bridge.fs) {
    try {
      const selected = await bridge.dialog.open({
        multiple: false,
        filters: [{ name: APP.fileExt, extensions: [APP.fileExt, 'json'] }],
      })
      if (typeof selected !== 'string') return ok(null)

      const text = await bridge.fs.readTextFile(selected)
      return ok({ name: fileNameOf(selected), text })
    } catch (error) {
      return err(describeError(error))
    }
  }

  if (typeof document === 'undefined') return err('当前环境不支持文件选择')

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    // 不插入 DOM：点击即可弹出，且不会影响布局或焦点管理
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(ok(null))
        return
      }
      file
        .text()
        .then((text) => resolve(ok({ name: file.name, text })))
        .catch((error: unknown) => resolve(err(describeError(error))))
    }
    // 用户直接关掉选择框时不会触发 change。浏览器没有可靠的"取消"事件，
    // 所以这里就是"不 resolve"——与原生 input 的行为一致，
    // 调用方不应把 await 的结果当作一定会到达。
    input.click()
  })
}

/** 保存文本为文件；桌面版弹原生保存框，Web 版走下载 */
export async function saveTextFile(
  text: string,
  suggestedName: string,
  mime = 'application/json',
): Promise<Result<boolean, string>> {
  const bridge = tauri()
  if (bridge?.dialog && bridge.fs) {
    try {
      const target = await bridge.dialog.save({
        defaultPath: suggestedName,
        filters: [{ name: APP.fileExt, extensions: [APP.fileExt] }],
      })
      if (typeof target !== 'string') return ok(false)

      await bridge.fs.writeTextFile(target, text)
      return ok(true)
    } catch (error) {
      return err(describeError(error))
    }
  }

  if (typeof document === 'undefined') return err('当前环境不支持文件保存')

  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  anchor.click()
  // 立刻撤销会让部分浏览器来不及取数据，延后一拍更稳
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return ok(true)
}

// ——————————————————————————————————————————————————————————
// 文件关联（双击 .duet 打开）
// ——————————————————————————————————————————————————————————

/**
 * 监听"用对奏打开某个 .duet 文件"的请求。
 *
 * 桌面版在第二个实例被拦下时会由 Rust 侧发出 `duet://open-file` 事件；
 * Web 版没有这个概念，直接返回一个不做事、也不会报错的取消函数，
 * 这样 App.vue 不必判断平台。
 *
 * @returns 取消监听的函数
 */
export function onOpenFileRequest(handler: (path: string) => void): () => void {
  const bridge = tauri()
  const listen = bridge?.event?.listen
  if (!bridge || !listen) return () => {}

  let unlisten: (() => void) | null = null
  let cancelled = false

  void listen<string>('duet://open-file', (event) => handler(event.payload))
    .then((off) => {
      // 监听是异步注册的：期间若已取消，就把刚拿到的句柄立刻释放，
      // 否则会留下一个永远不释放的监听器
      if (cancelled) off()
      else unlisten = off
    })
    .catch(() => {
      // 事件系统不可用不影响主流程
    })

  return () => {
    cancelled = true
    unlisten?.()
  }
}

/** 按路径读取文本文件（仅桌面版可用；Web 版返回明确错误） */
export async function readTextFileAt(path: string): Promise<Result<string, string>> {
  const bridge = tauri()
  if (!bridge?.fs) return err('当前环境不支持按路径读取文件')

  try {
    return ok(await bridge.fs.readTextFile(path))
  } catch (error) {
    return err(describeError(error))
  }
}

// ——————————————————————————————————————————————————————————

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

function describeError(error: unknown): string {
  if (typeof error === 'string') return error
  return error instanceof Error ? error.message : String(error)
}
