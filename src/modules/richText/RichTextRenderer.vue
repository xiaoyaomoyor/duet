<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeHtml } from '@/lib/sanitize'
import type { ModuleRendererProps } from '../types'
import type { RichTextData } from './data'

const props = defineProps<ModuleRendererProps>()

/**
 * 安全说明：展示前**再净化一次**。
 * 数据可能是从 .duet 文件导入的（别人给的），
 * 因此不能假定它写入时已经过净化——只在写入时净化等于信任外部输入。
 */
const html = computed(() => {
  const raw = props.module.data as Partial<RichTextData> | undefined
  return sanitizeHtml(typeof raw?.html === 'string' ? raw.html : '')
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过白名单净化（lib/sanitize.ts） -->
  <div class="rt-render anim-enter-up" v-html="html" />
</template>

<style scoped>
.rt-render {
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.rt-render :deep(ul),
.rt-render :deep(ol) {
  padding-left: var(--sp-5);
  margin: var(--sp-2) 0;
  list-style: disc;
}

.rt-render :deep(ol) {
  list-style: decimal;
}

.rt-render :deep(blockquote) {
  padding-left: var(--sp-3);
  margin: var(--sp-2) 0;
  color: var(--text-muted);
  border-left: 2px solid var(--accent, var(--accent-500));
}

.rt-render :deep(code) {
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--bg-surface-2);
  border-radius: var(--radius-xs);
}

.rt-render :deep(p) {
  margin: 0 0 var(--sp-2);
}
</style>
