<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import type { ModuleEditorProps } from '../types'
import type { KeyValueData, KeyValueRow } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<KeyValueData>(() => {
  const raw = props.module.data as Partial<KeyValueData> | undefined
  return { rows: Array.isArray(raw?.rows) ? raw.rows : [] }
})

function updateRow(index: number, patch: Partial<KeyValueRow>): void {
  const rows = data.value.rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
  props.patchData({ rows })
}

function addRow(): void {
  props.patchData({ rows: [...data.value.rows, { key: '', value: '' }] })
}

function removeRow(index: number): void {
  const rows = data.value.rows.filter((_, i) => i !== index)
  // 至少保留一行，避免表格消失后用户找不到入口
  props.patchData({ rows: rows.length > 0 ? rows : [{ key: '', value: '' }] })
}
</script>

<template>
  <div class="editor">
    <div v-for="(row, index) in data.rows" :key="index" class="editor__row">
      <input
        class="editor__input"
        type="text"
        :value="row.key"
        :readonly="readonly"
        :placeholder="t('keyValue.keyPlaceholder')"
        @input="updateRow(index, { key: ($event.target as HTMLInputElement).value })"
      />
      <input
        class="editor__input"
        type="text"
        :value="row.value"
        :readonly="readonly"
        :placeholder="t('keyValue.valuePlaceholder')"
        @input="updateRow(index, { value: ($event.target as HTMLInputElement).value })"
      />
      <button
        class="editor__remove"
        type="button"
        :disabled="readonly"
        :title="t('common.remove')"
        :aria-label="t('common.remove')"
        @click="removeRow(index)"
      >
        <AppIcon name="close" :size="12" />
      </button>
    </div>

    <button class="editor__add" type="button" :disabled="readonly" @click="addRow">
      <AppIcon name="plus" :size="13" />
      {{ t('keyValue.addRow') }}
    </button>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__row {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.editor__input {
  flex: 1;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__remove {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
}

.editor__remove:hover:not(:disabled) {
  color: var(--danger);
  background: var(--bg-hover);
}

.editor__add {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  width: fit-content;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-full);
}

.editor__add:hover:not(:disabled) {
  color: var(--text-primary);
}
</style>
