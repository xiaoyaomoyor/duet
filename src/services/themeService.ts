/**
 * 主题服务
 *
 * 职责：把设置映射到 DOM，并提供存储能力与版本信息。
 * 纯 DOM 操作集中在 lib/theme.ts，本文件只做编排与对外接口。
 */

import { APP } from '@/app.config'
import { applyThemeSettings } from '@/lib/theme'
import type { AppSettings } from '@/types'

/** 应用全部主题相关设置（语言、主题、动效、侧栏宽度） */
export function applySettings(settings: AppSettings): void {
  applyThemeSettings({
    themeId: settings.themeId,
    language: settings.language,
    reducedMotion: settings.reducedMotion,
    sidebarWidth: settings.sidebarWidth,
  })
}

/** 系统是否要求减少动效 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 请求持久化存储权限。
 * IndexedDB 在存储压力下可能被浏览器清理，申请 persist 可显著降低风险（§18 K2）。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = navigator.storage
  if (!storage?.persist) return false
  try {
    if (await storage.persisted?.()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export interface StorageEstimate {
  usage: number
  quota: number
  /** 使用率 0~1；quota 不可用时为 0 */
  ratio: number
  persisted: boolean
}

/** 读取存储用量（设置页"数据与存储"面板使用） */
export async function estimateStorage(): Promise<StorageEstimate> {
  const storage = navigator.storage
  const empty: StorageEstimate = { usage: 0, quota: 0, ratio: 0, persisted: false }
  if (!storage?.estimate) return empty

  try {
    const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
      storage.estimate(),
      storage.persisted?.() ?? Promise.resolve(false),
    ])
    return { usage, quota, ratio: quota > 0 ? usage / quota : 0, persisted }
  } catch {
    return empty
  }
}

/** 版本与许可信息（"关于"面板使用） */
export function aboutInfo(): { name: string; version: string; repo: string; license: string } {
  return {
    name: `${APP.nameZh} ${APP.nameEn}`,
    version: APP.version,
    repo: APP.repo,
    license: APP.license,
  }
}
