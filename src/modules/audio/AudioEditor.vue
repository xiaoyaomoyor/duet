<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaPicker from '@/components/media/MediaPicker.vue'
import { formatDuration } from '@/lib/time'
import { useAssetsStore } from '@/stores/useAssetsStore'
import type { ModuleEditorProps } from '../types'
import type { MediaData } from '../shared/mediaData'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const assets = useAssetsStore()

const data = computed(() => props.module.data as MediaData)

/** 导入时已探测过时长，这里直接展示，避免用户二次点击才知道有多长 */
const durationLabel = computed(() => {
  const assetId = data.value.assetId
  if (!assetId) return null
  const meta = assets.metaById(assetId)
  if (!meta?.derived?.durationMs) return null
  return formatDuration(meta.derived.durationMs)
})
</script>

<template>
  <div class="editor">
    <MediaPicker
      accept="audio"
      :asset-id="data.assetId"
      :source-url="data.sourceUrl"
      :name="data.name"
      :readonly="readonly"
      :preview-height="92"
      @select="
        (payload) =>
          patchData({
            assetId: payload.assetId || undefined,
            sourceUrl: payload.sourceUrl,
            name: payload.name,
          })
      "
      @clear="patchData({ assetId: undefined, sourceUrl: undefined, name: undefined })"
    />

    <p v-if="durationLabel" class="editor__meta">
      {{ t('media.duration') }}: {{ durationLabel }}
    </p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__meta {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
</style>
