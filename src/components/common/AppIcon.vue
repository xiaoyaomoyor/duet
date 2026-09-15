<script setup lang="ts">
/**
 * 通用图标组件
 *
 * 用法：<AppIcon name="plus" :size="16" />
 * 大小与颜色由 font-size / color 继承，也可用 size 显式指定。
 */
import { computed } from 'vue'
import { getIconSvg } from '@/data/icons'

interface Props {
  name: string
  /** 边长（px）；不传则跟随 font-size（1em） */
  size?: number | string
  /** 无障碍标签；不传则视为装饰性图标 */
  label?: string
}

const props = defineProps<Props>()

const svg = computed(() => getIconSvg(props.name))

const style = computed(() => {
  if (props.size === undefined) return undefined
  const value = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { width: value, height: value }
})
</script>

<template>
  <span
    class="app-icon"
    :style="style"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="svg"
  />
</template>

<style scoped>
.app-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 1;
  color: inherit;
}

.app-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
