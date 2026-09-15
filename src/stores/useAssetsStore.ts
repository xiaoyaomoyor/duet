/**
 * 资源元数据 Store
 *
 * 只保存**元数据**（尺寸/时长/名称），绝不保存 Blob
 * —— Blob 进入响应式对象会导致 Vue 深度代理二进制内容，直接卡死页面（§18 K6）。
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { listAssets } from '@/db/assetsRepo'
import type { Asset, AssetKind } from '@/types/project'

/** 去掉了 blob 的资源视图 */
export type AssetMeta = Omit<Asset, 'blob'>

export const useAssetsStore = defineStore('assets', () => {
  const items = shallowRef<AssetMeta[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const index = computed(() => new Map(items.value.map((item) => [item.id, item])))
  const count = computed(() => items.value.length)
  const totalBytes = computed(() => items.value.reduce((sum, item) => sum + item.size, 0))

  async function load(): Promise<void> {
    loading.value = true
    try {
      const assets = await listAssets()
      // 剥离 blob：只保留元数据进入响应式层
      items.value = assets.map(({ blob: _blob, ...meta }) => meta)
      lastError.value = null
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }

  function metaById(assetId: string): AssetMeta | undefined {
    return index.value.get(assetId)
  }

  function byKind(kind: AssetKind): AssetMeta[] {
    return items.value.filter((item) => item.kind === kind)
  }

  function upsert(meta: AssetMeta): void {
    const exists = items.value.some((item) => item.id === meta.id)
    items.value = exists
      ? items.value.map((item) => (item.id === meta.id ? meta : item))
      : [...items.value, meta]
  }

  return { items, loading, lastError, count, totalBytes, load, metaById, byKind, upsert }
})
