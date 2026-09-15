<script setup lang="ts">
import { computed } from 'vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import { formatDuration } from '@/lib/time'
import { useAssetsStore } from '@/stores/useAssetsStore'
import type { ModuleEditorProps } from '../types'
import type { MediaData } from '../shared/mediaData'

const props = defineProps<ModuleEditorProps>()

const assets = useAssetsStore()

// computed 而非快照：见 CoverRenderer 的注释
const data = computed(() => props.module.data as MediaData)

const metaLabel = computed(() => {
  if (!data.value.assetId) return null
  const meta = assets.metaById(data.value.assetId)
  if (!meta) return null

  const parts: string[] = []
  const { width, height, durationMs } = meta.derived ?? {}
  if (width && height) parts.push(`${width}×${height}`)
  if (durationMs) parts.push(formatDuration(durationMs))
  return parts.length > 0 ? parts.join(' · ') : null
})
</script>

<template>
  <div class="editor">
    <MediaPicker
      accept="video"
      :asset-id="data.assetId"
      :source-url="data.sourceUrl"
      :name="data.name"
      :readonly="readonly"
      :preview-height="160"
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

    <p v-if="metaLabel" class="editor__meta">{{ metaLabel }}</p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__meta {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
</style>
