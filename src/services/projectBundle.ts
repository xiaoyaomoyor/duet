import type { Project, Asset } from '@/types/project'
import { collectAssetIds } from '@/types/validate'
import { listAssets } from '@/db/assetsRepo'
import { serializeProjects, parseProjectFile } from './projectService'
import {
  importDuet,
  type DuetFile,
  type SerializedAsset,
  type ImportDuetResult,
} from './exportService'
import { blobToDataUrl } from '@/lib/blob'
import { createZip, readZip, ZIP_LIMIT } from '@/lib/zip'
import { err, ok, type Result } from '@/lib/result'
export interface AssetInventory {
  assets: Asset[]
  missing: string[]
  external: number
  bytes: number
}
/** Only playable/rendered sources; provenance URLs and links are not offline dependencies. */
export function externalMediaCount(value: unknown): number {
  const urls = new Set<string>()
  const add = (url: unknown) => {
    if (typeof url === 'string' && url.trim() && !/^data:/i.test(url)) urls.add(url)
  }
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const v = value as Record<string, unknown>
    if (v.kind === 'url') add(v.url)
    if (!v.assetId) add(v.sourceUrl)
    if (v.type === 'iframe' && v.data && typeof v.data === 'object')
      add((v.data as Record<string, unknown>).url)
    Object.values(v).forEach(visit)
  }
  visit(value)
  return urls.size
}
export async function assetInventory(project: Project): Promise<AssetInventory> {
  const byId = new Map((await listAssets()).map((a) => [a.id, a])),
    ids = new Set(collectAssetIds(project))
  for (const id of ids) {
    const thumb = byId.get(id)?.derived?.thumbAssetId
    if (thumb) ids.add(thumb)
  }
  const assets = [...ids].map((id) => byId.get(id)).filter((a): a is Asset => !!a)
  return {
    assets,
    missing: [...ids].filter((id) => !byId.has(id)),
    external: externalMediaCount(project),
    bytes: assets.reduce((n, a) => n + a.blob.size, 0),
  }
}
export async function exportProjectBundle(project: Project): Promise<Result<Blob, string>> {
  try {
    const inventory = await assetInventory(project)
    if (inventory.missing.length || inventory.external)
      return err(
        `完整素材包需要全部媒体在本地：缺失 ${inventory.missing.length} 项，未镜像外链 ${inventory.external} 项。请补回资源或先镜像外链；在线嵌入页请移除或改用普通工程。`,
      )
    if (inventory.bytes > ZIP_LIMIT) return err('素材超过 128 MiB，请拆分项目后导出')
    const entries = inventory.assets.map((a, n) => ({
      id: a.id,
      path: `media/${String(n + 1).padStart(6, '0')}.bin`,
    }))
    const assets: SerializedAsset[] = inventory.assets.map(({ blob: _blob, ...a }) => ({
      ...a,
      size: _blob.size,
      embedded: false,
    }))
    const envelope: DuetFile = { ...serializeProjects([project]), assets, warnings: [] }
    return ok(
      await createZip([
        { name: 'project.duet', blob: new Blob([JSON.stringify(envelope)]) },
        {
          name: 'manifest.json',
          blob: new Blob([JSON.stringify({ $format: 'duet-bundle', version: 1, entries })]),
        },
        {
          name: 'README.txt',
          blob: new Blob([
            'Duet 完整素材包 v1\n导入整个 .duetpack 即可恢复项目与媒体。此文件使用标准 ZIP（无压缩）。\n包含非激活作品与历史恢复快照引用的资源。上限 128 MiB；外链必须先镜像。',
          ]),
        },
        ...inventory.assets.map((a, n) => ({ name: entries[n]!.path, blob: a.blob })),
      ]),
    )
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  }
}
export async function importProjectBundle(blob: Blob): Promise<Result<ImportDuetResult, string>> {
  try {
    const files = await readZip(blob),
      manifest = JSON.parse((await files.get('manifest.json')?.text()) ?? 'null')
    const text = await files.get('project.duet')?.text()
    if (
      !manifest ||
      manifest.$format !== 'duet-bundle' ||
      manifest.version !== 1 ||
      !Array.isArray(manifest.entries) ||
      !text
    )
      return err('不是有效的 Duet 素材包')
    const checked = parseProjectFile(text)
    if (!checked.ok) return checked
    const envelope = JSON.parse(text) as DuetFile
    if (!Array.isArray(envelope.assets) || envelope.assets.length !== manifest.entries.length)
      return err('素材包资源清单不一致')
    const expected = new Set(['project.duet', 'manifest.json', 'README.txt']),
      ids = new Set<string>()
    for (const [n, entry] of envelope.assets.entries()) {
      const item = manifest.entries[n],
        path = `media/${String(n + 1).padStart(6, '0')}.bin`,
        data = files.get(path)
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        ids.has(entry.id) ||
        item?.id !== entry.id ||
        item?.path !== path ||
        !data ||
        entry.size !== data.size ||
        !['image', 'audio', 'video', 'text', 'icon', 'model3d'].includes(entry.kind) ||
        typeof entry.mime !== 'string' ||
        typeof entry.name !== 'string' ||
        !Number.isFinite(entry.createdAt)
      )
        return err('素材包媒体元数据损坏')
      ids.add(entry.id)
      expected.add(path)
    }
    if (files.size !== expected.size || [...files.keys()].some((p) => !expected.has(p)))
      return err('素材包含未登记的文件')
    if (
      checked.value.some(
        (p) => externalMediaCount(p) > 0 || [...collectAssetIds(p)].some((id) => !ids.has(id)),
      ) ||
      envelope.assets.some((a) => a.derived?.thumbAssetId && !ids.has(a.derived.thumbAssetId))
    )
      return err('素材包不完整：缺少被引用的媒体')
    for (const [n, entry] of envelope.assets.entries()) {
      const data = await blobToDataUrl(
        new Blob([files.get(manifest.entries[n].path)!], { type: entry.mime }),
      )
      if (!data.ok) return data
      entry.data = data.value
      entry.embedded = true
    }
    envelope.warnings = []
    return importDuet(JSON.stringify(envelope))
  } catch (e) {
    return err(`素材包导入失败：${e instanceof Error ? e.message : String(e)}`)
  }
}
