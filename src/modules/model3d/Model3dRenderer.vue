<script setup lang="ts">
import { computed } from 'vue'
import ModelViewer from '@/components/media/ModelViewer.vue'
import { useAssetBuffer } from '@/composables/useAssetBuffer'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { Model3dProps } from './index'

const props = defineProps<ModuleRendererProps>()

const data = computed(() => props.module.data as MediaData)
const modelProps = computed<Model3dProps>(() => ({
  autoRotate: props.module.props.autoRotate !== false,
  background:
    props.module.props.background === 'panel' || props.module.props.background === 'transparent'
      ? props.module.props.background
      : 'void',
}))

const { buffer } = useAssetBuffer(() => data.value.assetId)

const background = computed(() => {
  if (modelProps.value.background === 'panel') return 'var(--bg-surface-2)'
  if (modelProps.value.background === 'transparent') return 'transparent'
  return 'var(--bg-void)'
})
</script>

<template>
  <ModelViewer
    class="model3d-render anim-enter-up"
    :buffer="buffer"
    :auto-rotate="modelProps.autoRotate"
    :background="background"
  />
</template>

<style scoped>
.model3d-render {
  min-height: 240px;
}
</style>
