<script setup lang="ts">
import { computed } from 'vue'
import MediaImage from '@/components/media/MediaImage.vue'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { ImageProps } from './data'

const props = defineProps<ModuleRendererProps>()

// computed 而非快照：见 CoverRenderer 的注释（M2 根因）
const data = computed(() => props.module.data as MediaData)
const imageProps = computed(() => props.module.props as unknown as ImageProps)
</script>

<template>
  <MediaImage
    class="image anim-enter-up"
    :asset-id="data.assetId"
    :source-url="data.sourceUrl"
    :alt="data.name ?? ''"
    :fit="imageProps.fit ?? 'contain'"
    :ratio="imageProps.ratio === 'auto' ? undefined : imageProps.ratio"
  />
</template>

<style scoped>
.image {
  background: var(--bg-void);
}
</style>
