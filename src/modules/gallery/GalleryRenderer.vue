<script setup lang="ts">
import { computed } from 'vue'
import MediaImage from '@/components/media/MediaImage.vue'
import type { ModuleRendererProps } from '../types'
import type { GalleryData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<GalleryData>(() => {
  const raw = props.module.data as Partial<GalleryData> | undefined
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    columns: raw?.columns === 3 || raw?.columns === 4 ? raw.columns : 2,
  }
})
</script>

<template>
  <div class="gallery" :style="{ gridTemplateColumns: `repeat(${data.columns}, 1fr)` }">
    <MediaImage
      v-for="(item, index) in data.items"
      :key="index"
      class="gallery__item"
      :class="`stagger-${Math.min(index + 1, 6)}`"
      :asset-id="item.assetId"
      :source-url="item.sourceUrl"
      :alt="item.name ?? ''"
      fit="cover"
      ratio="1/1"
    />
  </div>
</template>

<style scoped>
.gallery {
  display: grid;
  gap: var(--sp-2);
}

.gallery__item {
  animation: duet-enter-up var(--dur-slower) var(--ease-out) both;
}
</style>
