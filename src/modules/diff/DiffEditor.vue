<script setup lang="ts">
/**
 * 代码对比编辑器
 *
 * 两个并排的等宽文本框（左/右），加两个可选的标题输入。
 * 刻意不在这里显示 diff 预览：编辑视图的空间应该留给"输入"，
 * 结果看画布上的渲染器就够了（避免同一个 diff 算两遍）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModuleEditorProps } from '../types'
import type { DiffData } from './index'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed(() => props.module.data as DiffData)

/** 用行数给出"输入规模"的即时反馈，比字数更贴近代码的心理模型 */
function lineCount(text: string): number {
  if (text === '') return 0
  return text.replace(/\r\n?/g, '\n').split('\n').length
}

const leftLines = computed(() => lineCount(data.value.left ?? ''))
const rightLines = computed(() => lineCount(data.value.right ?? ''))

/** 只填了一侧时提醒——这几乎总是忘了粘另一边，而不是有意为之 */
const oneSided = computed(() => {
  const left = (data.value.left ?? '').trim()
  const right = (data.value.right ?? '').trim()
  return (left === '') !== (right === '')
})
</script>

<template>
  <div class="diff-editor">
    <div class="diff-editor__panes">
      <label class="diff-editor__pane">
        <span class="diff-editor__caption">
          <input
            class="diff-editor__label"
            type="text"
            :value="data.leftLabel"
            :disabled="readonly"
            :placeholder="t('diff.leftLabelPlaceholder')"
            @input="patchData({ leftLabel: ($event.target as HTMLInputElement).value })"
          />
          <span class="diff-editor__count">{{ t('diff.lineCount', { count: leftLines }) }}</span>
        </span>
        <textarea
          class="diff-editor__area"
          rows="8"
          spellcheck="false"
          :disabled="readonly"
          :value="data.left"
          :placeholder="t('diff.leftPlaceholder')"
          @input="patchData({ left: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>

      <label class="diff-editor__pane">
        <span class="diff-editor__caption">
          <input
            class="diff-editor__label"
            type="text"
            :value="data.rightLabel"
            :disabled="readonly"
            :placeholder="t('diff.rightLabelPlaceholder')"
            @input="patchData({ rightLabel: ($event.target as HTMLInputElement).value })"
          />
          <span class="diff-editor__count">{{ t('diff.lineCount', { count: rightLines }) }}</span>
        </span>
        <textarea
          class="diff-editor__area"
          rows="8"
          spellcheck="false"
          :disabled="readonly"
          :value="data.right"
          :placeholder="t('diff.rightPlaceholder')"
          @input="patchData({ right: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>
    </div>

    <p v-if="oneSided" class="diff-editor__hint">{{ t('diff.oneSidedHint') }}</p>
  </div>
</template>

<style scoped>
.diff-editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.diff-editor__panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

/* 窄屏（编辑器的侧栏很窄）时改为上下排列，否则两个框都挤到没法用 */
@media (max-width: 720px) {
  .diff-editor__panes {
    grid-template-columns: 1fr;
  }
}

.diff-editor__pane {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.diff-editor__caption {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.diff-editor__label {
  flex: 1;
  min-width: 0;
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-xs);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.diff-editor__count {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.diff-editor__area {
  width: 100%;
  min-height: 120px;
  padding: var(--sp-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  line-height: var(--lh-normal);
  resize: vertical;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.diff-editor__hint {
  font-size: var(--fs-xs);
  color: var(--warning);
}
</style>
