<script setup lang="ts">
/**
 * 通用图标组件
 *
 * 用法：<AppIcon name="plus" :size="16" />
 * 大小与颜色由 font-size / color 继承，也可用 size 显式指定。
 *
 * 实现要点：图标本体来自 `@/data/iconMap`（语义名 → Lucide）。
 * 本组件只负责尺寸与无障碍，不做选型——选型集中在映射表里，
 * 这样"某个图标不好看"永远只需要改一个文件。
 */
import { computed } from 'vue'
import { getIcon } from '@/data/iconMap'

interface Props {
  name: string
  /** 边长（px）；不传则跟随 font-size（1em） */
  size?: number | string
  /** 无障碍标签；不传则视为装饰性图标 */
  label?: string
}

const props = defineProps<Props>()

const icon = computed(() => getIcon(props.name))

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
  >
    <!--
      stroke-width 用 1.75 而不是 Lucide 默认的 2：
      本应用的图标大量出现在 13–16px 的小尺寸上，默认线宽在这么小的尺寸下
      会糊成一团，1.75 在 13px 与 24px 下都清晰。
    -->
    <component :is="icon" v-if="icon" :stroke-width="1.75" />
  </span>
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
