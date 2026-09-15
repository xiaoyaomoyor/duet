<script setup lang="ts">
import { computed } from 'vue'
import MediaImage from '@/components/media/MediaImage.vue'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { CoverProps } from './data'

const props = defineProps<ModuleRendererProps>()

/**
 * 必须用 computed 读 props.module，不能写成 `const data = props.module.data`。
 * 后者是 setup 时的**快照**：store 换掉模块对象（如导入媒体写入 assetId）后，
 * 渲染器仍指向旧对象，界面就不会更新——这正是 M2 那个
 * "上传成功但预览不变、刷新后才正常"的根因。
 */
const data = computed(() => props.module.data as MediaData)
const coverProps = computed(() => props.module.props as unknown as CoverProps)
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
