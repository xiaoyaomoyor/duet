<script setup lang="ts">
import MediaImage from '@/components/media/MediaImage.vue'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { CoverProps } from './data'

const props = defineProps<ModuleRendererProps>()

const data = props.module.data as MediaData
// props 是 Record<string, unknown>，必须经 unknown 中转才能收窄到具体形状
const coverProps = props.module.props as unknown as CoverProps
</script>

<template>
  <MediaImage
    class="cover anim-enter-up"
    :asset-id="data.assetId"
    :source-url="data.sourceUrl"
    :alt="data.name ?? ''"
    fit="cover"
    :ratio="coverProps.ratio === 'auto' ? undefined : coverProps.ratio"
  />
</template>

<style scoped>
.cover {
  box-shadow: var(--shadow-md);
}
</style>
