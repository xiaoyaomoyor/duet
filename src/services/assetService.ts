/**
 * 资源服务：导入、去重、探测、外链镜像、引用回收
 *
 * 关键约定（§8.5 / §18 K1、K3）：
 *   1. 资源 id = 内容哈希 → 同一份文件重复导入天然去重
 *   2. 外链媒体必须走阶梯降级，**不允许静默失败**
 *   3. 删除项目时**不立即删资源**；回收由 cleanupUnreferencedAssets 统一做
 */

import { getAsset, deleteAssets, listAssets, putAsset } from '@/db/assetsRepo'
import { hashBlob } from '@/lib/hash'
import { hasId3, parseId3Cover, readId3TagSize } from '@/lib/id3'
import { deepClone } from '@/lib/clone'
import {
  fileNameFromUrl,
  mediaProxyUrl,
  probeMedia,
  sniffAssetKind,
} from '@/lib/media'
import { err, ok, type Result } from '@/lib/result'
import { collectAssetIds } from '@/types/validate'
import type { Asset, AssetKind, Project } from '@/types/project'

export interface ImportOptions {
  /** 已知的资源种类；缺省时由 MIME/扩展名推断 */
  kind?: AssetKind
  /** 是否探测尺寸与时长，默认 true */
  probe?: boolean
}

/**
 * 导入一个本地文件/Blob。
 * 相同内容的文件会命中已有资源并直接复用（不重复占用空间）。
 */
export async function importBlob(
  blob: Blob,
  name: string,
  options: ImportOptions = {},
): Promise<Result<Asset, string>> {
  const kind = options.kind ?? sniffAssetKind({ mime: blob.type, name })

  const hashed = await hashBlob(blob)
  if (!hashed.ok) return err(hashed.error)

  const existing = await getAsset(hashed.value)
  if (existing) return ok(existing)

  const asset: Asset = {
    id: hashed.value,
    kind,
    mime: blob.type || 'application/octet-stream',
    size: blob.size,
    name,
    createdAt: Date.now(),
    blob,
  }

  if (options.probe !== false) {
    const probed = await probeMedia(blob, kind)
    // 探测失败不阻断导入：媒体本身仍是可用的，只是缺少尺寸/时长
    if (probed.ok) {
      const derived = stripUndefined(probed.value)
      if (Object.keys(derived).length > 0) asset.derived = derived
    }

    // MP3 的内嵌封面：浏览器不会把它暴露成音频的 poster，只能自己解。
    // 失败一律忽略——封面是锦上添花，不该因为它让导入失败。
    if (kind === 'audio') {
      const thumb = await extractEmbeddedCover(blob, asset)
      if (thumb) asset.derived = { ...(asset.derived ?? {}), thumbAssetId: thumb }
    }
  }

  await putAsset(asset)
  return ok(asset)
}

/**
 * 尝试从音频里取出内嵌封面并落库为一张派生图片资源。
 *
 * 为什么存成独立 Asset 而不是塞进音频的 derived 里：
 *   渲染层需要的是一个能直接给 <img> 用的素材 id，
 *   复用已有的 assetId → blob URL 解析链路（mediaResolver）才最省事，
 *   也让"清理未引用媒体"能正确看待它。
 *
 * @returns 封面资源的 id；没有封面或解析失败时返回 null
 */
async function extractEmbeddedCover(blob: Blob, parent: Asset): Promise<string | null> {
  try {
    // 只读文件开头：ID3 标签在最前面，没必要把整首歌读进内存
    const header = await blob.slice(0, 10).arrayBuffer()
    if (!hasId3(header)) return null

    const size = readId3TagSize(header)
    // 留一点余量：标签声明长度之外还有帧头的 10 字节
    const probeBytes = Math.min(blob.size, size + 1024)
    const buffer = await blob.slice(0, probeBytes).arrayBuffer()

    const cover = parseId3Cover(buffer)
    if (!cover) return null

    const coverBlob = new Blob([cover.data], { type: cover.mime })
    const hashed = await hashBlob(coverBlob)
    if (!hashed.ok) return null

    const existing = await getAsset(hashed.value)
    if (existing) return existing.id

    const thumb: Asset = {
      id: hashed.value,
      kind: 'image',
      mime: cover.mime,
      size: coverBlob.size,
      name: `${parent.name} · 封面`,
      createdAt: Date.now(),
      blob: coverBlob,
      derived: { width: 0, height: 0 },
    }

    // 顺手探测封面的真实尺寸，供渲染层按比例预留空间
    const probed = await probeMedia(coverBlob, 'image')
    if (probed.ok && probed.value.width && probed.value.height) {
      thumb.derived = { width: probed.value.width, height: probed.value.height }
    }

    await putAsset(thumb)
    return thumb.id
  } catch {
    return null
  }
}

/** 批量导入文件（保持输入顺序，逐项返回结果） */
export async function importFiles(
  files: readonly File[],
  options: ImportOptions = {},
): Promise<Array<Result<Asset, string>>> {
  const results: Array<Result<Asset, string>> = []
  for (const file of files) {
    results.push(await importBlob(file, file.name, options))
  }
  return results
}

/**
 * 按需补抽内嵌封面（自愈）。
 *
 * 两个必须存在的理由：
 *   1. **老数据**。封面提取只在导入那一刻发生，而 M8 之前解析器有几个真 bug
 *      （v2.3 扩展头、去同步），那批文件导进来时就没抽出封面，
 *      光修解析器救不了已经躺在库里的资源。
 *   2. **悬空引用**。`.duet` 导出的资源集合曾经漏掉派生资源，
 *      回导后 `derived.thumbAssetId` 指向一个不存在的 id。
 *
 * 触发时机放在"读音频资源发现 thumbAssetId 指不到东西"的时候：
 * 不做全库扫描（可能很大），只在真正要显示封面的那一刻补一次，
 * 补完写回资源记录，下次就直接命中。
 *
 * @returns 可用的封面资源 id；确实没有内嵌图时返回 null
 */
export async function repairEmbeddedCover(audioAssetId: string): Promise<string | null> {
  const audio = await getAsset(audioAssetId)
  if (!audio || audio.kind !== 'audio') return null

  // 已登记的封面还有效 → 什么都不用做
  const known = audio.derived?.thumbAssetId
  if (known && (await getAsset(known))) return known

  const coverId = await extractEmbeddedCover(audio.blob, audio)
  if (!coverId) return null

  await putAsset({ ...audio, derived: { ...audio.derived, thumbAssetId: coverId } })
  return coverId
}

/**
 * 导入媒体（本地文件或外链）。
 *
 * 外链的阶梯降级：
 *   ① 直接 fetch —— 成功则镜像为本地资源，之后完全离线可用
 *   ② 失败且配置了代理 —— 走代理重试一次
 *   ③ 仍失败 —— 返回可读的错误，交由 UI 提示用户改用本地文件
 *
 * 只返回 `kind: 'url'` 的引用形式由调用方决定（例如用户选择"仅引用不缓存"）。
 */
export async function importUrl(
  url: string,
  options: ImportOptions & { allowProxy?: boolean; maxBytes?: number; timeoutMs?: number } = {},
): Promise<Result<Asset, string>> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const maxBytes = options.maxBytes ?? 200 * 1024 * 1024
  const allowProxy = options.allowProxy ?? true

  const attemptUrls = [url]
  if (allowProxy) {
    const proxied = mediaProxyUrl(url)
    if (proxied) attemptUrls.push(proxied)
  }

  let lastError = '未知错误'

  for (const [index, attemptUrl] of attemptUrls.entries()) {
    const viaProxy = index > 0
    const fetched = await fetchWithLimits(attemptUrl, timeoutMs, maxBytes)

    if (!fetched.ok) {
      lastError = fetched.error
      continue
    }

    const blob = fetched.value
    const name = fileNameFromUrl(url)
    const kind = options.kind ?? sniffAssetKind({ mime: blob.type, name })

    const imported = await importBlob(blob, name, { kind, ...(options.probe !== undefined ? { probe: options.probe } : {}) })
    if (!imported.ok) {
      lastError = imported.error
      continue
    }

    const asset = imported.value
    asset.origin = { url, mode: 'mirror', fetchedAt: Date.now() }
    if (viaProxy && import.meta.env.DEV) {
      console.info(`[duet/assets] 通过本地代理镜像：${url}`)
    }
    await putAsset(asset)
    return ok(asset)
  }

  return err(
    `无法获取该外链资源（${lastError}）。常见原因是对方站点未开放跨域访问（CORS）或启用了防盗链。请改为下载后手动上传本地文件。`,
  )
}

/** 带超时与体积上限的抓取 */
async function fetchWithLimits(
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<Result<Blob, string>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal, mode: 'cors' })
    if (!response.ok) return err(`HTTP ${response.status}`)

    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > maxBytes) {
      return err(`文件体积 ${Math.round(length / 1024 / 1024)}MB 超过上限`)
    }

    const blob = await response.blob()
    if (blob.size > maxBytes) {
      return err(`文件体积 ${Math.round(blob.size / 1024 / 1024)}MB 超过上限`)
    }

    return ok(blob)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return err('请求超时')
    return err(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timer)
  }
}

// ——————————————————————————————————————————————————————————
// 引用回收
// ——————————————————————————————————————————————————————————

export interface CleanupReport {
  scannedProjects: number
  scannedAssets: number
  removedAssets: number
  freedBytes: number
}

/**
 * 清理未被任何项目引用的资源（§6.2 约束 3）。
 *
 * 安全的做法是"扫描后回收"而非"删除项目时级联删除"：
 * 后者在撤销删除、复制项目等场景下会误删仍在使用的媒体。
 */
export async function cleanupUnreferencedAssets(
  projects: readonly Project[],
  extraToolIconIds: readonly string[] = [],
): Promise<CleanupReport> {
  const referenced = new Set<string>(extraToolIconIds)
  for (const project of projects) {
    for (const id of collectAssetIds(project)) referenced.add(id)
  }

  const assets = await listAssets()
  const orphans = assets.filter((asset) => !referenced.has(asset.id))
  const freedBytes = orphans.reduce((sum, asset) => sum + asset.size, 0)

  if (orphans.length > 0) {
    await deleteAssets(orphans.map((asset) => asset.id))
  }

  return {
    scannedProjects: projects.length,
    scannedAssets: assets.length,
    removedAssets: orphans.length,
    freedBytes,
  }
}

/** 统计资源占用（设置页"数据与存储"面板使用） */
export async function assetUsage(): Promise<{ count: number; bytes: number }> {
  const assets = await listAssets()
  return {
    count: assets.length,
    bytes: assets.reduce((sum, asset) => sum + asset.size, 0),
  }
}

/** 读取单个资源（转发到仓储，供 mediaResolver 在 M2 使用） */
export { getAsset }

/** 深拷贝一份资源元数据（不含 Blob 的浅层结构，供 UI 展示） */
export function assetMeta(asset: Asset): Omit<Asset, 'blob'> {
  const meta = deepClone(asset) as Asset
  const { blob: _blob, ...rest } = meta
  return rest
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) (out as Record<string, unknown>)[key] = item
  }
  return out
}
