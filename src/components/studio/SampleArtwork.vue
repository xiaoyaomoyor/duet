<script setup lang="ts">
import { computed } from 'vue'
import type { Sample } from '@/types/presentation'
import { useResolvedMedia, assetSource } from '@/composables/useResolvedMedia'
const props = defineProps<{ sample: Sample }>()
const source = computed(() => {
  const modules = Object.values(props.sample.contentBySection).flatMap((c) => c.modules)
  const image = modules.find((m) => m.type === 'image')?.data as
    { assetId?: string; sourceUrl?: string } | undefined
  if (image?.assetId) return assetSource(image.assetId)
  if (image?.sourceUrl) return { kind: 'url' as const, url: image.sourceUrl }
  const audio = modules.find((m) => m.type === 'audio')?.data as
    { coverAssetId?: string } | undefined
  return assetSource(audio?.coverAssetId)
})
const media = useResolvedMedia(source)
</script>
<template>
  <span class="sample-artwork" aria-hidden="true"
    ><img v-if="media.status === 'ready' && media.src" :src="media.src" alt="" /><span v-else
      >♪</span
    ></span
  >
</template>
<style scoped>
.sample-artwork {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px !important;
  background: var(--d-raised);
  border-radius: 4px;
  overflow: hidden;
  color: var(--d-muted);
}
.sample-artwork img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sample-artwork > span {
  font: 20px var(--d-serif);
}
</style>
