/**
 * 媒体来源解析层（§8.4）
 *
 * 唯一职责：把「assetId 或外链 URL」变成能塞进 <img>/<audio>/<video> 的 src。
 *
 * 实现取舍（记录了踩坑过程）：
 *   早期版本用"引用计数 + 延迟 revoke"管理 blob URL 生命周期，非常脆弱：
 *   同一资源被多个组件各持一次引用，任一方卸载就可能撤掉仍在使用的 URL，
 *   表现为"上传成功但预览一直加载失败"。
 *
 *   现在改为**有界 LRU 缓存 + 页面卸载时统一清理**：
 *     - 同一资源在全应用内只创建一个 blob URL（天然去重，含并发去重）
 *     - 谁也不负责释放，因此不可能出现"提前撤销"
 *     - 缓存上限 64 条，超出时淘汰最久未用的条目
 *     - 换项目 / 清空数据 / 页面卸载时调用 clearMediaCache() 主动回收
 *
 *   对本地优先应用而言，这个取舍明显优于逐次引用计数：内存有界，正确性高得多。
 */

import { getAsset } from '@/db/assetsRepo'
import { LruCache } from '@/lib/lru'
import type { MediaSource } from '@/types/project'

export type MediaErrorKind = 'cors' | 'network' | 'unsupported' | 'too-large' | 'missing' | 'unknown'

export interface MediaError {
  kind: MediaErrorKind
  /** i18n key：media.error.<kind> */
  messageKey: string
  /** 原始错误信息，仅供开发排查 */
  detail?: string
}

export interface ResolvedMedia {
  src: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** 把 src 关联回 assetId（缓存与调试用） */
  assetId?: string
  error?: MediaError
}

/** 缓存上限：同一时刻最多保留这么多资源的 blob URL */
const MAX_CACHED_URLS = 64

/** 并发闸门：最多同时进行 4 个 IndexedDB 读取 */
const MAX_CONCURRENT_READS = 4
let activeReads = 0
const readQueue: Array<() => void> = []

/** assetId → blob: URL */
const urlCache = new LruCache<string, string>(MAX_CACHED_URLS)

/** 进行中的解析：避免同一资源被并发读取多次 */
const inflight = new Map<string, Promise<ResolvedMedia>>()

function acquireSlot(): Promise<void> {
  if (activeReads < MAX_CONCURRENT_READS) {
    activeReads += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    readQueue.push(() => {
      activeReads += 1
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeReads -= 1
  const next = readQueue.shift()
  if (next) next()
}

/**
 * 解析一个媒体来源。
 * 调用方**不需要**释放：blob URL 由本模块统一缓存与回收。
 */
export async function resolveMedia(source: MediaSource): Promise<ResolvedMedia> {
  if (source.kind === 'url') {
    // 外链交给浏览器：可用性由 <img>/<audio> 的 onerror 反映
    return { src: source.url, status: 'ready' }
  }

  const assetId = source.assetId

  const cached = urlCache.get(assetId)
  if (cached) return { src: cached, status: 'ready', assetId }

  const pending = inflight.get(assetId)
  if (pending) return pending

  const task = loadAssetUrl(assetId).finally(() => inflight.delete(assetId))
  inflight.set(assetId, task)
  return task
}

async function loadAssetUrl(assetId: string): Promise<ResolvedMedia> {
  await acquireSlot()
  try {
    // 竞态：等锁期间可能已被其他调用者创建
    const again = urlCache.get(assetId)
    if (again) return { src: again, status: 'ready', assetId }

    const asset = await getAsset(assetId)
    if (!asset) {
      return {
        src: null,
        status: 'error',
        assetId,
        error: { kind: 'missing', messageKey: 'media.error.missing' },
      }
    }

    const url = URL.createObjectURL(asset.blob)
    urlCache.set(assetId, url)
    return { src: url, status: 'ready', assetId }
  } catch (error) {
    return {
      src: null,
      status: 'error',
      assetId,
      error: {
        kind: 'unknown',
        messageKey: 'media.error.unknown',
        detail: error instanceof Error ? error.message : String(error),
      },
    }
  } finally {
    releaseSlot()
  }
}

/** 读取已缓存的 URL（同步，用于渲染占位判断） */
export function peekMedia(assetId: string): string | null {
  return urlCache.get(assetId) ?? null
}

/** 清空缓存并回收全部 blob URL（换项目、清空数据、页面卸载时调用） */
export function clearMediaCache(): void {
  for (const assetId of urlCache.keys()) {
    const url = urlCache.delete(assetId)
    if (url) URL.revokeObjectURL(url)
  }
  inflight.clear()
}

/** 当前缓存状态（测试与调试用） */
export function mediaCacheStats(): { cached: number; reading: number; inflight: number } {
  return { cached: urlCache.size, reading: activeReads, inflight: inflight.size }
}

// 页面卸载时统一回收，避免残留
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => clearMediaCache(), { once: true })
}
