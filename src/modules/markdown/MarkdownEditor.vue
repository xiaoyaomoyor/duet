<script setup lang="ts">
/**
 * Markdown 编辑器
 *
 * 取舍：不做所见即所得（那需要一套完整富文本引擎），
 * 而是"左侧写、右侧实时看"——Markdown 用户本来就习惯这个交互，
 * 而且它天然避免了富文本编辑器里"粘进来的样式污染"这类问题。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderMarkdown } from '@/lib/markdown'
import type { ModuleEditorProps } from '../types'
import type { MarkdownData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<MarkdownData>(() => {
  const raw = props.module.data as Partial<MarkdownData> | undefined
  return { text: typeof raw?.text === 'string' ? raw.text : '' }
})

/** 实时预览（renderMarkdown 已做转义，可安全用于 v-html） */
const html = computed(() => renderMarkdown(data.value.text))
</script>

<template>
  <div class="md-editor">
    <textarea
      class="md-editor__area"
      :value="data.text"
      :readonly="readonly"
      :placeholder="t('markdown.placeholder')"
      rows="6"
      @input="patchData({ text: ($event.target as HTMLTextAreaElement).value })"
    />
    <!-- eslint-disable-next-line vue/no-v-html -- 内容已在 renderMarkdown 中整体转义 -->
    <div v-if="data.text.trim()" class="md-editor__preview" v-html="html" />
  </div>
</template>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.md-editor__area {
  width: 100%;
  min-height: 120px;
  padding: var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  resize: vertical;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.md-editor__area::placeholder {
  color: var(--text-disabled);
}

.md-editor__preview {
  padding: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
}
</style>
