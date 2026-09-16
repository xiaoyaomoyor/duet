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

/** 用户上传的封面（没有则留空，由 MediaPicker 显示"未选择"） */
const overrideCoverId = computed(() => (props.module.data as { coverAssetId?: string }).coverAssetId)

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

    <!--
      封面（v0.5.0）。
      默认用音频文件里内嵌的那张（mp3 的 ID3 APIC，导入时自动抽出来）；
      这里传一张就会盖住它——"文件自带的"与"我想要的"是两件事，
      后者应当优先。清空即回到内嵌封面，两条信息都留着。
    -->
    <section class="editor__cover">
      <span class="editor__label">{{ t('media.cover') }}</span>
      <p class="editor__meta">{{ t('media.coverHint') }}</p>
      <MediaPicker
        accept="image"
        :asset-id="overrideCoverId"
        :name="data.name"
        :readonly="readonly"
        :preview-height="72"
        @select="(payload) => patchData({ coverAssetId: payload.assetId || undefined })"
        @clear="patchData({ coverAssetId: undefined })"
      />
    </section>
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

.editor__cover {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-3);
  margin-top: var(--sp-1);
  border-top: 1px solid var(--border-subtle);
}

.editor__label {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
