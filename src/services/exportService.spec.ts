/**
 * 导出/导入单测
 *
 * 最重要的一条：**`.duet` 往返必须内容完全一致**。
 * 这是"工程文件可携带"这个承诺的硬保证——一旦往返丢字段，
 * 用户会在"导出→换台电脑→导入"时丢失数据，而且很难发现。
 *
 * ⚠️ 测试环境限制（务必知悉）：
 *   fake-indexeddb 的存储层用的是 Node 的 structuredClone，它**不认 jsdom 的 Blob**，
 *   写进去再读出来会退化成空对象 `{}`（与 M0 在 deepClone 上踩过的是同一个坑）。
 *   因此：
 *     - 需要"真实二进制"的用例，用内存里的 Asset 直接喂给 exportDuet（见 mockAssetList）
 *     - 需要验证"确实落库"的用例，只断言记录数与元数据，不读回 Blob
 *   生产环境走浏览器原生 IndexedDB，没有这个问题。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportDuet, importDuet, duetFileName, estimateDuetSize } from './exportService'
import { createProject } from './projectService'
import * as assetsRepo from '@/db/assetsRepo'
import { countAssets } from '@/db/assetsRepo'
import { resetDb, getDb } from '@/db/db'
import { clearProjects } from '@/db/projectsRepo'
import { clearStore } from '@/db/core'
import { STORE } from '@/db/schema'
import {
  blobToDataUrl,
  dataUrlToBlob,
  shouldEmbed,
  estimateDataUrlSize,
  toStandardBlob,
  EMBED_SIZE_LIMIT,
} from '@/lib/blob'
import type { Asset, Project } from '@/types/project'

/** 造一个带媒体的项目（资源保存在内存中，见文件头的环境说明） */
async function makeProjectWithAsset(): Promise<{ project: Project; asset: Asset }> {
  const project = createProject({ name: '往返测试', templateId: 'music' })

  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])
  const blob = new Blob([bytes], { type: 'image/png' })
  const asset: Asset = {
    id: 'a'.repeat(32),
    kind: 'image',
    mime: 'image/png',
    name: 'cover.png',
    size: blob.size,
    createdAt: 1_700_000_000_000,
    blob,
    derived: { width: 2, height: 2 },
  }

  // 把资源挂到第一行左侧的模块上
  const row = project.sheet.rows[0]!
  const sideId = project.sheet.sides[0]!.id
  row.cells[sideId]!.modules[0]!.data = { assetId: asset.id, name: asset.name }

  return { project, asset }
}

/** 让仓储返回内存中的真实 Asset（绕过 fake-indexeddb 的 Blob 退化） */
function mockAssetList(assets: Asset[]): void {
  vi.spyOn(assetsRepo, 'listAssets').mockResolvedValue(assets)
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await resetDb()
  const db = await getDb()
  await clearStore(db, STORE.assets)
  await clearStore(db, STORE.projects)
  await clearProjects()
})

/**
 * 派生资源（内嵌封面）必须随导出一起走。
 *
 * 这是 M8 修掉的一个真 bug：封面的 id 挂在**资源记录**的 `derived.thumbAssetId` 上，
 * 不在 module.data 里，因此"扫模块数据收集 assetId"那一轮永远收集不到它。
 * 结果：音频被导出、封面图没有，但音频上的 derived 被原样保留 ——
 * 回导之后就是一个指向不存在资源的**悬空引用**，界面表现为错误占位。
 */
describe('导出包含派生资源（内嵌封面）', () => {
  it('音频资源带 thumbAssetId 时，封面图也进导出集合', async () => {
    const project = createProject({ name: '封面往返', templateId: 'music' })

    const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })
    const coverBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

    const audio: Asset = {
      id: 'b'.repeat(32),
      kind: 'audio',
      mime: 'audio/mpeg',
      name: 'song.mp3',
      size: audioBlob.size,
      createdAt: 1,
      blob: audioBlob,
      derived: { thumbAssetId: 'c'.repeat(32) },
    }
    const cover: Asset = {
      id: 'c'.repeat(32),
      kind: 'image',
      mime: 'image/png',
      name: 'song.mp3 · 封面',
      size: coverBlob.size,
      createdAt: 1,
      blob: coverBlob,
    }

    // 音频挂在第一行左侧的模块上；封面**只**出现在 derived 里
    const row = project.sheet.rows[0]!
    const sideId = project.sheet.sides[0]!.id
    row.cells[sideId]!.modules[0]!.data = { assetId: audio.id, name: audio.name }

    mockAssetList([audio, cover])

    const result = await exportDuet([project])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const ids = (result.value.assets ?? []).map((item) => item.id)
    expect(ids).toContain(audio.id)
    // 关键断言：封面不在 module.data 里，但仍然必须被带上
    expect(ids).toContain(cover.id)
  })

  it('悬空引用不会让导出崩（指向的资源已经不存在）', async () => {
    const project = createProject({ name: '悬空', templateId: 'music' })

    const audioBlob = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' })
    const audio: Asset = {
      id: 'd'.repeat(32),
      kind: 'audio',
      mime: 'audio/mpeg',
      name: 'ghost.mp3',
      size: audioBlob.size,
      createdAt: 1,
      blob: audioBlob,
      derived: { thumbAssetId: 'e'.repeat(32) },
    }

    const row = project.sheet.rows[0]!
    const sideId = project.sheet.sides[0]!.id
    row.cells[sideId]!.modules[0]!.data = { assetId: audio.id }

    mockAssetList([audio])

    const result = await exportDuet([project])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 缺失的派生资源只应产生一条警告，不该让整个导出失败
    expect(result.value.warnings?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('blob 工具', () => {
  it('Blob → data URI → Blob 往返保持字节一致', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' })
    const dataUrl = await blobToDataUrl(original)
    expect(dataUrl.ok).toBe(true)
    if (!dataUrl.ok) return

    const back = dataUrlToBlob(dataUrl.value)
    expect(back.ok).toBe(true)
    if (!back.ok) return

    expect(back.value.type).toBe('image/png')
    expect(back.value.size).toBe(original.size)

    const bytes = new Uint8Array(await back.value.arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3, 250])
  })

  it('非法 data URI 返回错误而不是抛异常', () => {
    expect(dataUrlToBlob('not-a-data-url').ok).toBe(false)
    expect(dataUrlToBlob('data:image/png;base64,!!!').ok).toBe(false)
  })

  it('体积上限判定', () => {
    expect(shouldEmbed(1024)).toBe(true)
    expect(shouldEmbed(0)).toBe(false)
    expect(shouldEmbed(EMBED_SIZE_LIMIT + 1)).toBe(false)
  })

  it('估算体积接近真实值', async () => {
    const blob = new Blob([new Uint8Array(3000)], { type: 'application/octet-stream' })
    const dataUrl = await blobToDataUrl(blob)
    if (!dataUrl.ok) return
    const estimated = estimateDataUrlSize(dataUrl.value)
    // base64 膨胀约 33%，允许 5% 误差
    expect(Math.abs(estimated - blob.size) / blob.size).toBeLessThan(0.05)
  })

  it('toStandardBlob 能兜住"退化的存储结果"', () => {
    // 数组缓冲
    expect(toStandardBlob(new ArrayBuffer(4)).ok).toBe(true)
    // 类型化数组
    expect(toStandardBlob(new Uint8Array([1, 2, 3])).ok).toBe(true)
    // { data: ArrayBuffer } 形态
    expect(toStandardBlob({ data: new ArrayBuffer(2) }).ok).toBe(true)
    // 真正无法识别时才报错（且是错误而不是抛异常）
    const bad = toStandardBlob({})
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('二进制')
  })
})

describe('.duet 导出', () => {
  it('内嵌被引用的资源', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const result = await exportDuet([project])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.$format).toBe('duet-project')
    expect(result.value.projects).toHaveLength(1)
    expect(result.value.assets).toHaveLength(1)

    const exported = result.value.assets[0]!
    expect(exported.id).toBe(asset.id)
    expect(exported.embedded).toBe(true)
    expect(exported.data?.startsWith('data:image/png;base64,')).toBe(true)
    expect(exported.derived).toEqual({ width: 2, height: 2 })
  })

  it('关闭内嵌时不包含二进制', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const result = await exportDuet([project], { embedMedia: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.assets[0]?.embedded).toBe(false)
    expect(result.value.assets[0]?.data).toBeUndefined()
  })

  it('只导出被引用的资源（不把整个资源库塞进文件）', async () => {
    const { project, asset } = await makeProjectWithAsset()
    const unused: Asset = {
      id: 'b'.repeat(32),
      kind: 'image',
      mime: 'image/png',
      name: 'unused.png',
      size: 4,
      createdAt: Date.now(),
      blob: new Blob([new Uint8Array(4)]),
    }
    mockAssetList([asset, unused])

    const result = await exportDuet([project])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.assets).toHaveLength(1)
  })

  it('资源已丢失时给出警告而不是静默跳过', async () => {
    const { project } = await makeProjectWithAsset()
    mockAssetList([])

    const result = await exportDuet([project])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.warnings.join()).toContain('已丢失')
  })

  it('空项目列表被拒绝', async () => {
    const result = await exportDuet([])
    expect(result.ok).toBe(false)
  })
})

describe('.duet 往返', () => {
  it('导出再导入后项目内容完全一致（deepEqual）', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    expect(exported.ok).toBe(true)
    if (!exported.ok) return

    // renameOnConflict: false —— 默认会换新 id，那样就不是"同一份工程"了；
    // 这里要验证的是**内容不丢字段**，因此保留原 id
    const imported = await importDuet(JSON.stringify(exported.value), {
      renameOnConflict: false,
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    expect(imported.value.projects).toHaveLength(1)
    // 硬保证：内容必须逐字段一致
    expect(imported.value.projects[0]).toEqual(project)
    expect(imported.value.importedAssets).toBe(1)
    expect(imported.value.missingAssets).toEqual([])
  })

  it('默认导入会换新 id，避免覆盖本机项目', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    if (!exported.ok) return

    const imported = await importDuet(JSON.stringify(exported.value))
    if (!imported.ok) return

    const restored = imported.value.projects[0]!
    expect(restored.id).not.toBe(project.id)
    // 除 id 与时间戳外，内容仍应一致
    expect({ ...restored, id: project.id, updatedAt: project.updatedAt }).toEqual(project)
  })

  it('导入的媒体确实写入了资源库', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    if (!exported.ok) return

    const imported = await importDuet(JSON.stringify(exported.value))
    expect(imported.ok).toBe(true)

    // 只断言"记录确实落库"（不读回 Blob，原因见文件头）
    expect(await countAssets()).toBe(1)
  })

  it('默认生成新 id，避免覆盖本机同名项目', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    if (!exported.ok) return

    const imported = await importDuet(JSON.stringify(exported.value))
    if (!imported.ok) return

    expect(imported.value.projects[0]?.id).not.toBe(project.id)
  })

  it('可关闭 id 重命名（用于精确还原）', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    if (!exported.ok) return

    const imported = await importDuet(JSON.stringify(exported.value), { renameOnConflict: false })
    if (!imported.ok) return

    expect(imported.value.projects[0]?.id).toBe(project.id)
  })
})

describe('.duet 导入的异常输入', () => {
  it('非 JSON', async () => {
    const result = await importDuet('这不是 JSON')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('JSON')
  })

  it('缺少 $format 标记', async () => {
    const result = await importDuet(JSON.stringify({ projects: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('$format')
  })

  it('版本高于当前应用时拒绝', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project])
    if (!exported.ok) return

    const future = { ...exported.value, schemaVersion: 999 }
    const result = await importDuet(JSON.stringify(future))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('升级')
  })

  it('未内嵌的资源被记为 missingAssets 而不是静默丢失', async () => {
    const { project, asset } = await makeProjectWithAsset()
    mockAssetList([asset])

    const exported = await exportDuet([project], { embedMedia: false })
    if (!exported.ok) return

    const imported = await importDuet(JSON.stringify(exported.value))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    expect(imported.value.missingAssets).toHaveLength(1)
    expect(imported.value.importedAssets).toBe(0)
  })
})

describe('辅助函数', () => {
  it('文件名带日期与正确扩展名', () => {
    const now = new Date(2026, 8, 15)
    expect(duetFileName(now)).toBe('duet-20260915.duet')
  })

  it('体积估算随项目增大而增大', () => {
    const small = createProject({ name: 'a' })
    const big = createProject({ name: 'b', templateId: 'music' })
    expect(estimateDuetSize([big])).toBeGreaterThan(estimateDuetSize([small]))
  })
})
