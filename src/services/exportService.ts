/**
 * 导出服务：`.duet` 工程文件 / 长图 PNG / 只读 HTML
 *
 * 三条纪律（§8.6 / §8.7 / §18 K3）：
 *   1. 导出前**等待**媒体就绪，否则会得到空白图
 *   2. 外链资源先内联，否则 canvas 会被跨域污染（导出直接失败）
 *   3. 失败必须可解释：返回 Result 而不是抛异常，UI 才能给出可行动的建议
 */

import { listAssets } from '@/db/assetsRepo'
import { getDb } from '@/db/db'
import { STORE } from '@/db/schema'
import { putMany } from '@/db/core'
import { blobToDataUrl, dataUrlToBlob, shouldEmbed } from '@/lib/blob'
import { deepClone } from '@/lib/clone'
import { err, ok, type Result } from '@/lib/result'
import { APP } from '@/app.config'
import { parseProjectFile, serializeProjects, type ProjectFileEnvelope } from './projectService'
import { validateProject } from '@/types/validate'
import { SCHEMA_VERSION } from '@/types/project'
import type { Asset, Project } from '@/types/project'

// ——————————————————————————————————————————————————————————
// `.duet` 工程文件
// ——————————————————————————————————————————————————————————

export interface SerializedAsset {
  id: string
  kind: Asset['kind']
  mime: string
  name: string
  size: number
  createdAt: number
  derived?: Asset['derived']
  origin?: Asset['origin']
  /** 是否内嵌了二进制 */
  embedded: boolean
  /** 内嵌的 data URI（embedded 为 false 时不存在） */
  data?: string
}

export interface DuetFile extends ProjectFileEnvelope {
  assets: SerializedAsset[]
  /** 未能内嵌的资源（体积超限或读取失败），导入方需要知道 */
  warnings: string[]
}

export interface ExportDuetOptions {
  /** 是否内嵌媒体（默认 true） */
  embedMedia?: boolean
  /** 单个媒体的内嵌体积上限 */
  embedLimit?: number
  /** 进度回调（0~1） */
  onProgress?: (ratio: number, label: string) => void
}

/**
 * 导出为 `.duet` 信封。
 *
 * 只导出**被这些项目引用**的资源：把整个资源库塞进文件会让导出毫无意义地臃肿。
 */
export async function exportDuet(
  projects: readonly Project[],
  options: ExportDuetOptions = {},
): Promise<Result<DuetFile, string>> {
  if (projects.length === 0) return err('没有可导出的项目')

  const embedMedia = options.embedMedia !== false
  const embedLimit = options.embedLimit ?? 20 * 1024 * 1024
  const envelope = serializeProjects(projects)

  // 收集被引用的 assetId（含工具图标等）
  const referenced = new Set<string>()
  for (const project of projects) {
    for (const id of collectReferencedAssetIds(project)) referenced.add(id)
  }

  const serialized: SerializedAsset[] = []
  const warnings: string[] = []

  if (referenced.size > 0) {
    const all = await listAssets()
    const byId = new Map(all.map((asset) => [asset.id, asset]))
    const targets = Array.from(referenced)

    for (const [index, assetId] of targets.entries()) {
      const asset = byId.get(assetId)
      if (!asset) {
        warnings.push(`资源 ${assetId.slice(0, 8)} 已丢失，导出文件中将不包含它`)
        continue
      }

      const entry: SerializedAsset = {
        id: asset.id,
        kind: asset.kind,
        mime: asset.mime,
        name: asset.name,
        size: asset.size,
        createdAt: asset.createdAt,
        embedded: false,
      }
      if (asset.derived) entry.derived = deepClone(asset.derived)
      if (asset.origin) entry.origin = deepClone(asset.origin)

      if (embedMedia && shouldEmbed(asset.size, embedLimit)) {
        const dataUrl = await blobToDataUrl(asset.blob)
        if (dataUrl.ok) {
          entry.embedded = true
          entry.data = dataUrl.value
        } else {
          warnings.push(`${asset.name}：读取失败，未内嵌`)
        }
      } else if (embedMedia) {
        warnings.push(`${asset.name}：体积超过内嵌上限，导出文件不含它的二进制`)
      }

      serialized.push(entry)
      options.onProgress?.((index + 1) / targets.length, asset.name)
    }
  }

  return ok({
    ...envelope,
    assets: serialized,
    warnings,
  })
}

export interface ImportDuetOptions {
  /** 冲突时是否生成新 id（默认 true，避免覆盖本机已有项目） */
  renameOnConflict?: boolean
  onProgress?: (ratio: number, label: string) => void
}

export interface ImportDuetResult {
  projects: Project[]
  importedAssets: number
  missingAssets: string[]
  warnings: string[]
}

/**
 * 从 `.duet` 文本导入。
 *
 * 顺序：先落资源，再落项目——否则项目会短暂引用不存在的资源，
 * 若此时用户刷新页面就会看到"媒体缺失"。
 */
export async function importDuet(
  text: string,
  options: ImportDuetOptions = {},
): Promise<Result<ImportDuetResult, string>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return err('文件不是合法的 JSON，可能已损坏或并非对奏工程文件')
  }

  const envelope = parsed as Partial<DuetFile>
  if (envelope.$format !== 'duet-project') {
    return err('不是对奏工程文件（缺少 $format 标记）')
  }
  if (typeof envelope.schemaVersion === 'number' && envelope.schemaVersion > SCHEMA_VERSION) {
    return err(
      `工程文件版本（v${envelope.schemaVersion}）高于当前应用（v${SCHEMA_VERSION}），请先升级应用`,
    )
  }

  // 项目结构校验复用同一套逻辑，避免两处规则漂移
  const projectCheck = parseProjectFile(text)
  if (!projectCheck.ok) return projectCheck

  const warnings: string[] = [...(envelope.warnings ?? [])]
  const missingAssets: string[] = []

  // —— 1. 资源 ——
  const assets: Asset[] = []
  for (const [index, entry] of (envelope.assets ?? []).entries()) {
    if (!entry.data) {
      missingAssets.push(entry.id)
      continue
    }
    const blob = dataUrlToBlob(entry.data)
    if (!blob.ok) {
      warnings.push(`${entry.name}：${blob.error}`)
      missingAssets.push(entry.id)
      continue
    }
    const asset: Asset = {
      id: entry.id,
      kind: entry.kind,
      mime: entry.mime,
      name: entry.name,
      size: entry.size,
      createdAt: entry.createdAt,
      blob: blob.value,
    }
    if (entry.derived) asset.derived = entry.derived
    if (entry.origin) asset.origin = entry.origin

    assets.push(asset)
    options.onProgress?.((index + 1) / Math.max(1, envelope.assets?.length ?? 1), entry.name)
  }

  if (assets.length > 0) {
    try {
      const db = await getDb()
      await putMany(db, STORE.assets, assets)
    } catch (error) {
      return err(`写入媒体失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // —— 2. 项目 ——
  const renameOnConflict = options.renameOnConflict !== false
  const projects = projectCheck.value.map((project) => {
    if (!renameOnConflict) return project
    return { ...project, id: crypto.randomUUID(), updatedAt: Date.now() }
  })

  return ok({
    projects,
    importedAssets: assets.length,
    missingAssets,
    warnings,
  })
}

// ——————————————————————————————————————————————————————————
// 引用收集
// —————————————————————————————————————————————————————————

/** 收集项目引用的全部 assetId（与 validate.collectAssetIds 同源，此处再导出一次便于就近使用） */
function collectReferencedAssetIds(project: Project): Set<string> {
  const ids = new Set<string>()

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'waveform') continue
      // i 标志必不可少：字段名是 `assetId`（小写开头）
      if (/assetId$/i.test(key) && typeof item === 'string' && item) {
        ids.add(item)
        continue
      }
      visit(item)
    }
  }

  for (const side of project.sheet.sides) {
    if (side.toolRef.kind === 'inline' && side.toolRef.iconAssetId) {
      ids.add(side.toolRef.iconAssetId)
    }
  }
  for (const row of project.sheet.rows) {
    for (const cell of Object.values(row.cells)) {
      for (const module of cell.modules) {
        visit(module.data)
        visit(module.props)
      }
    }
  }

  return ids
}

/** 供 UI 展示的导出体积估算（不实际序列化，避免大项目卡顿） */
export function estimateDuetSize(projects: readonly Project[], embedMedia = true): number {
  const projectBytes = JSON.stringify(projects).length
  if (!embedMedia) return projectBytes
  // 内嵌时 base64 膨胀约 33%，这里按 1.4 倍保守估算
  return Math.round(projectBytes * 1.4)
}

/** 导出文件名（含日期，便于用户区分多次导出） */
export function duetFileName(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  return `${APP.slug}-${stamp}.${APP.fileExt}`
}

/** 校验一个可能来自 `.duet` 的项目对象（供 UI 在导入前预检） */
export function precheckProject(value: unknown): Result<Project, string> {
  return validateProject(value)
}
