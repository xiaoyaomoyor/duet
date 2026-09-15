/**
 * 媒体工具（纯函数 + 轻量宿主 API 封装）
 *
 * 边界说明：本文件只做"判定"与"探测"，**不做持久化**（那是 assetService 的职责）。
 */

import { attemptAsync, ok, type Result } from './result'
import type { AssetKind } from '@/types/project'

/** 由 MIME / 扩展名判定资源种类 */
export function sniffAssetKind(input: { mime?: string; name?: string }): AssetKind {
  const mime = (input.mime ?? '').toLowerCase()
  const ext = (input.name ?? '').split('.').pop()?.toLowerCase() ?? ''

  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/') || mime === 'application/json') return 'text'

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg', 'ico'].includes(ext)) {
    return 'image'
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['glb', 'gltf', 'obj', 'fbx', 'stl', 'usdz'].includes(ext)) return 'model3d'
  if (['txt', 'md', 'json', 'csv', 'srt', 'lrc', 'vtt'].includes(ext)) return 'text'

  return 'text'
}

/** 该种类是否需要探测尺寸/时长 */
export function needsProbe(kind: AssetKind): boolean {
  return kind === 'image' || kind === 'audio' || kind === 'video'
}

export interface ProbeResult {
  width?: number
  height?: number
  durationMs?: number
}

/**
 * 探测媒体的尺寸与时长。
 *
 * 说明：本函数会创建临时的 object URL 并在完成后立即释放，
 * 因此不会泄漏内存；失败时返回 Result 错误而非抛异常（§8.4 约束 3）。
 */
export async function probeMedia(
  blob: Blob,
  kind: AssetKind,
): Promise<Result<ProbeResult, string>> {
  if (!needsProbe(kind)) return ok({})

  const url = URL.createObjectURL(blob)
  try {
    if (kind === 'image') return await probeImage(url)
    if (kind === 'audio' || kind === 'video') return await probeAv(url, kind)
    return ok({})
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function probeImage(url: string): Promise<Result<ProbeResult, string>> {
  return attemptAsync(
    () =>
      new Promise<ProbeResult>((resolve, reject) => {
        const image = new Image()
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => reject(new Error('图片解码失败'))
        image.src = url
      }),
    (e) => `读取图片尺寸失败：${describe(e)}`,
  )
}

async function probeAv(url: string, kind: 'audio' | 'video'): Promise<Result<ProbeResult, string>> {
  return attemptAsync(
    () =>
      new Promise<ProbeResult>((resolve, reject) => {
        // 用显式类型标注避免联合类型无法访问 videoWidth/videoHeight
        const element: HTMLAudioElement | HTMLVideoElement =
          kind === 'video' ? document.createElement('video') : document.createElement('audio')
        element.preload = 'metadata'

        const cleanup = (): void => {
          element.removeAttribute('src')
          element.load()
        }

        element.onloadedmetadata = () => {
          const duration = Number.isFinite(element.duration) ? element.duration : 0
          const result: ProbeResult = { durationMs: Math.round(duration * 1000) }
          if (element instanceof HTMLVideoElement) {
            result.width = element.videoWidth
            result.height = element.videoHeight
          }
          cleanup()
          resolve(result)
        }

        element.onerror = () => {
          cleanup()
          reject(new Error('媒体元数据读取失败（格式可能不受浏览器支持）'))
        }

        element.src = url
      }),
    (e) => `读取${kind === 'video' ? '视频' : '音频'}元数据失败：${describe(e)}`,
  )
}

/** 人类可读的文件体积 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

/** 从 URL 猜测文件名（取 pathname 最后一段，去掉查询串） */
export function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : 'remote-asset'
  } catch {
    return 'remote-asset'
  }
}

/** 是否为本机可用的媒体代理（桌面端 / 自建部署时提供，§8.5） */
export function mediaProxyUrl(url: string): string | null {
  const proxy = import.meta.env.VITE_MEDIA_PROXY
  if (!proxy) return null
  return `${proxy}${proxy.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
