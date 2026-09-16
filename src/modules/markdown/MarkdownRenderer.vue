<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'
import type { ModuleRendererProps } from '../types'
import type { MarkdownData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<MarkdownData>(() => {
  const raw = props.module.data as Partial<MarkdownData> | undefined
  return { text: typeof raw?.text === 'string' ? raw.text : '' }
})

/**
 * 安全说明：renderMarkdown 会**先整体转义 HTML 再做 Markdown 替换**，
 * 因此这里的 v-html 只可能渲染出本函数自己生成的标签。
 */
const html = computed(() => renderMarkdown(data.value.text))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- 内容已在 renderMarkdown 中整体转义 -->
  <div class="md anim-enter-up" v-html="html" />
</template>

<style scoped>
.md {
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.md :deep(.md__h1),
.md :deep(.md__h2),
.md :deep(.md__h3),
.md :deep(.md__h4) {
  margin: var(--sp-4) 0 var(--sp-2);
  line-height: var(--lh-tight);
}

.md :deep(.md__h1) {
  font-size: var(--fs-xl);
}

.md :deep(.md__h2) {
  font-size: var(--fs-lg);
}

.md :deep(.md__h3),
.md :deep(.md__h4) {
  font-size: var(--fs-md);
}

.md :deep(.md__p) {
  margin: 0 0 var(--sp-3);
}

.md :deep(.md__list) {
  padding-left: var(--sp-5);
  margin: 0 0 var(--sp-3);
  list-style: disc;
}

.md :deep(ol.md__list) {
  list-style: decimal;
}

.md :deep(.md__li) {
  margin: 2px 0;
}

.md :deep(.md__quote) {
  padding-left: var(--sp-3);
  margin: 0 0 var(--sp-3);
  color: var(--text-muted);
  border-left: 2px solid var(--accent, var(--accent-500));
}

.md :deep(.md__pre) {
  padding: var(--sp-3);
  margin: 0 0 var(--sp-3);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

/*
 * 行内代码。
 * 这里原本用的是 --accent-300 —— 它在紫夜主题下是浅紫（还行），
 * 但在**浅色主题下也是浅紫**（#c4b5fd），压在 #f4f4f6 的面板上只有 1.6:1，
 * 基本等于看不见。这是"同一个色号在不同主题下明暗关系相反"的又一个受害者。
 * 改用 --accent-500：三个主题下都是各自那套配色里**保证可读**的那一档。
 */
.md :deep(.md__inline-code) {
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 0.92em;
  color: var(--accent-500);
  background: var(--bg-surface-2);
  border-radius: var(--radius-xs);
}

.md :deep(.md__link) {
  color: var(--accent-500);
}

.md :deep(.md__hr) {
  margin: var(--sp-4) 0;
  border: none;
  border-top: 1px solid var(--border-default);
}

.md :deep(.md__strong) {
  font-weight: 600;
}

.md :deep(.md__del) {
  color: var(--text-muted);
}
</style>
