<script setup lang="ts">
/**
 * 「标题」模块的渲染器（v0.5.0）
 *
 * 内容就是原来画布顶部那张工具名卡片，只是现在它住在某一行的一格里。
 * 复用 `SideHeader` 而不是复制一份：那张卡片有字号倍率、图标覆盖、
 * 匿名打码等一堆细节，抄一份必然漂移。
 *
 * 数据从**对比方**读而不是从模块读——见 ../title/data.ts 的说明。
 */
import { computed } from 'vue'
import SideHeader from '@/components/compare/SideHeader.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import type { ModuleRendererProps } from '../types'
import type { Side } from '@/types/project'

const props = defineProps<ModuleRendererProps>()

const store = useProjectStore()

/** 本模块所在的那一侧（模块本身不存身份信息，只是指向它） */
const side = computed<Side | undefined>(() =>
  store.current?.sheet.sides.find((item) => item.id === props.sideId),
)
</script>

<template>
  <div class="title-module">
    <SideHeader
      v-if="side"
      :side="side"
      :readonly="true"
      :dimmed="false"
    />
  </div>
</template>

<style scoped>
.title-module {
  min-width: 0;
}
</style>
