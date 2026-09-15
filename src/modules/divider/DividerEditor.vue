<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModuleEditorProps } from '../types'
import type { DividerData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<DividerData>(() => {
  const raw = props.module.data as Partial<DividerData> | undefined
  return { style: raw?.style ?? 'solid', label: raw?.label ?? '' }
})
</script>

<template>
  <div class="editor">
    <input
      class="editor__label"
      type="text"
      :value="data.label"
      :readonly="readonly"
      :placeholder="t('moduleOption.dividerLabel')"
      @input="patchData({ label: ($event.target as HTMLInputElement).value })"
    />
    <select
      class="editor__style"
      :value="data.style"
      :disabled="readonly"
      @change="patchData({ style: ($event.target as HTMLSelectElement).value })"
    >
      <option value="solid">{{ t('moduleOption.dividerSolid') }}</option>
      <option value="dashed">{{ t('moduleOption.dividerDashed') }}</option>
    </select>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  gap: var(--sp-2);
}

.editor__label {
  flex: 1;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__style {
  flex: none;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}
</style>
