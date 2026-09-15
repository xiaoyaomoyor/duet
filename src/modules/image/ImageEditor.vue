<script setup lang="ts">
import MediaPicker from '@/components/media/MediaPicker.vue'
import type { ModuleEditorProps } from '../types'
import type { MediaData } from '../shared/mediaData'

const props = defineProps<ModuleEditorProps>()

const data = props.module.data as MediaData
</script>

<template>
  <MediaPicker
    accept="image"
    :asset-id="data.assetId"
    :source-url="data.sourceUrl"
    :name="data.name"
    :readonly="readonly"
    :preview-height="200"
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
</template>
