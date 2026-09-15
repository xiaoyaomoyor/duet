<script setup lang="ts">
import { computed } from 'vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import type { ModuleEditorProps } from '../types'
import type { MediaData } from '../shared/mediaData'

const props = defineProps<ModuleEditorProps>()

/** 用 computed 读取，避免 setup 时快照化（详见 CoverRenderer 的注释） */
const data = computed(() => props.module.data as MediaData)
</script>

<template>
  <MediaPicker
    accept="image"
    :asset-id="data.assetId"
    :source-url="data.sourceUrl"
    :name="data.name"
    :readonly="readonly"
    :preview-height="180"
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
