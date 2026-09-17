<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModuleEditorProps } from '../types'
import type { TextData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<TextData>(() => {
  const raw = props.module.data as Partial<TextData> | undefined
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    align: raw?.align ?? 'left',
  }
})

const alignOptions: Array<{ value: TextData['align']; icon: string; labelKey: string }> = [
  { value: 'left', icon: 'alignLeft', labelKey: 'moduleOption.alignLeft' },
  { value: 'center', icon: 'alignCenter', labelKey: 'moduleOption.alignCenter' },
  { value: 'right', icon: 'alignRight', labelKey: 'moduleOption.alignRight' },
]

function setText(value: string): void {
  props.patchData({ text: value })
}

function setAlign(align: TextData['align']): void {
  props.patchData({ align })
}

const charCount = computed(() => Array.from(data.value.text.trim()).length)
</script>

<template>
  <div class="editor">
    <textarea
      class="editor__area"
      :value="data.text"
      :readonly="readonly"
      :placeholder="t('editor.fill')"
      rows="3"
      @input="setText(($event.target as HTMLTextAreaElement).value)"
    />

    <div class="editor__bar">
      <div class="editor__align" role="group" :aria-label="t('moduleOption.align')">
        <button
          v-for="option in alignOptions"
          :key="option.value"
          class="editor__align-btn"
          type="button"
          :class="{ 'editor__align-btn--active': data.align === option.value }"
          :aria-pressed="data.align === option.value"
          :title="t(option.labelKey)"
          @click="setAlign(option.value)"
        >
          <span :class="`align-mark align-mark--${option.value}`" aria-hidden="true" />
        </button>
      </div>

      <span class="editor__count">{{ charCount }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__area {
  width: 100%;
  min-height: 68px;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  resize: vertical;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__area::placeholder {
  color: var(--text-disabled);
}

.editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor__align {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.editor__align-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  border-radius: var(--radius-xs);
}

.editor__align-btn--active {
  background: var(--accent-soft);
}

.align-mark {
  display: block;
  width: 12px;
  height: 2px;
  background: var(--text-muted);
}

.align-mark--center {
  box-shadow: 0 -4px 0 var(--text-muted), 0 4px 0 var(--text-muted);
}

.align-mark--right {
  margin-left: auto;
  box-shadow: 0 -4px 0 var(--text-muted), 0 4px 0 var(--text-muted);
}

.align-mark--left {
  box-shadow: 0 -4px 0 var(--text-muted), 0 4px 0 var(--text-muted);
}

.editor__count {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}
</style>
