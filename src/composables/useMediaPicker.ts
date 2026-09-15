/**
 * 媒体选择的组合式逻辑
 *
 * 把「本地文件 / 拖拽 / 外链」三条入口收敛为一个函数，
 * 各模块的编辑器只关心"拿到 assetId 之后写进 data"。
 *
 * 错误一律以 Result 返回并附带**可读原因**（§8.5：不允许静默失败）。
 */

import { computed, ref } from 'vue'
import { importBlob, importUrl } from '@/services/assetService'
import { formatBytes, sniffAssetKind } from '@/lib/media'
import { err, ok, type Result } from '@/lib/result'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { AssetKind } from '@/types/project'

export interface PickedMedia {
  assetId: string
  /** 原始文件名；外链导入时为 URL 末段 */
  name: string
  /** 镜像成功时的来源 URL */
  sourceUrl?: string
  kind: AssetKind
}

export interface UseMediaPickerOptions {
  /** 期望的媒体种类；传入后会对不匹配的文件给出明确提示 */
  accept?: AssetKind
}

export function useMediaPicker(options: UseMediaPickerOptions = {}) {
  const settings = useSettingsStore()
  const importing = ref(false)
  /** 最近一次导入的失败原因（i18n 文案，直接展示） */
  const lastError = ref<string | null>(null)

  const maxBytes = computed(() => settings.settings.maxMirrorSizeMB * 1024 * 1024)

  /** 导入本地文件（File 来自 input 或 DataTransfer） */
  async function pickFile(file: File): Promise<Result<PickedMedia, string>> {
    lastError.value = null

    if (file.size > maxBytes.value) {
      const message = `文件体积 ${formatBytes(file.size)} 超过上限 ${settings.settings.maxMirrorSizeMB}MB，请在设置中调整上限或改用外链引用`
      lastError.value = message
      return err(message)
    }

    const kind = sniffAssetKind({ mime: file.type, name: file.name })
    if (options.accept && kind !== options.accept) {
      const message = `文件类型不符：需要${options.accept}，但识别为 ${kind}`
      lastError.value = message
      return err(message)
    }

    importing.value = true
    try {
      const result = await importBlob(file, file.name, { kind })
      if (!result.ok) {
        lastError.value = result.error
        return result
      }
      return ok({
        assetId: result.value.id,
        name: result.value.name,
        kind: result.value.kind,
      })
    } finally {
      importing.value = false
    }
  }

  /** 导入多个文件（图片集场景） */
  async function pickFiles(files: readonly File[]): Promise<Array<Result<PickedMedia, string>>> {
    const results: Array<Result<PickedMedia, string>> = []
    for (const file of files) results.push(await pickFile(file))
    return results
  }

  /**
   * 从外链导入。
   * linkOnly = true 时不下载，只保留 URL 引用（此时返回的是外链形式，
   * 由调用方写入 data.sourceUrl，而不是 assetId）。
   */
  async function pickUrl(
    url: string,
    opts: { linkOnly?: boolean } = {},
  ): Promise<Result<PickedMedia, string>> {
    lastError.value = null

    if (opts.linkOnly) {
      return ok({
        assetId: '',
        name: url,
        sourceUrl: url,
        kind: options.accept ?? 'image',
      })
    }

    importing.value = true
    try {
      const result = await importUrl(url, {
        maxBytes: maxBytes.value,
        ...(options.accept ? { kind: options.accept } : {}),
      })
      if (!result.ok) {
        lastError.value = result.error
        return result
      }
      const asset = result.value
      return ok({
        assetId: asset.id,
        name: asset.name,
        sourceUrl: url,
        kind: asset.kind,
      })
    } finally {
      importing.value = false
    }
  }

  function clearError(): void {
    lastError.value = null
  }

  return { importing, lastError, pickFile, pickFiles, pickUrl, clearError, maxBytes }
}
