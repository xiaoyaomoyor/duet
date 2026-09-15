/**
 * 按需读取资源的原始字节（ArrayBuffer）
 *
 * 与 mediaResolver 的分工：
 *   mediaResolver 产出的是"能塞进 <img>/<audio> 的 URL"；
 *   而 3D 解析、文本预览这类场景需要的是**字节本身**。
 *
 * 纪律：同样不进响应式、不缓存 Blob（只缓存解码后的结果由调用方决定），
 * 并且要处理"来源变化时旧结果作废"的竞态（与 useResolvedMedia 同一套思路）。
 */

import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { getAsset } from '@/db/assetsRepo'
import { toStandardBlob } from '@/lib/blob'

export interface UseAssetBufferResult {
  buffer: ReturnType<typeof ref<ArrayBuffer | null>>
  loading: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  retry: () => void
}

/**
 * @param assetId 取值函数；返回 undefined 表示"未选择资源"
 */
export function useAssetBuffer(assetId: MaybeRefOrGetter<string | undefined>): UseAssetBufferResult {
  const buffer = ref<ArrayBuffer | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let token = 0

  async function run(): Promise<void> {
    const id = toValue(assetId)
    buffer.value = null
    error.value = null

    if (!id) {
      loading.value = false
      return
    }

    const current = ++token
    loading.value = true

    try {
      const asset = await getAsset(id)
      if (current !== token) return

      if (!asset) {
        error.value = '资源不存在，可能已被清理'
        return
      }

      // 归一化：某些存储实现读回来的不是标准 Blob（见 lib/blob.ts）
      const normalized = toStandardBlob(asset.blob)
      if (!normalized.ok) {
        error.value = normalized.error
        return
      }

      const array = await normalized.value.arrayBuffer()
      if (current !== token) return
      buffer.value = array
    } catch (e) {
      if (current !== token) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (current === token) loading.value = false
    }
  }

  watch(() => toValue(assetId), () => void run(), { immediate: true })
  onUnmounted(() => {
    token += 1
  })

  return { buffer, loading, error, retry: () => void run() }
}
