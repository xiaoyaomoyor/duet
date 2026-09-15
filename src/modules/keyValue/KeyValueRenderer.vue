<script setup lang="ts">
import { computed } from 'vue'
import type { ModuleRendererProps } from '../types'
import type { KeyValueData, KeyValueProps } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<KeyValueData>(() => {
  const raw = props.module.data as Partial<KeyValueData> | undefined
  return { rows: Array.isArray(raw?.rows) ? raw.rows : [] }
})

const variant = computed<KeyValueProps['variant']>(() =>
  props.module.props.variant === 'striped' ? 'striped' : 'plain',
)

/** 只渲染填了内容的行；全空的行在展示视图没有意义（§7.4） */
const visibleRows = computed(() =>
  data.value.rows.filter((row) => row && (row.key?.trim() || row.value?.trim())),
)
</script>

<template>
  <dl class="kv" :class="`kv--${variant}`">
    <div v-for="(row, index) in visibleRows" :key="index" class="kv__row">
      <dt class="kv__key">{{ row.key || '—' }}</dt>
      <dd class="kv__value">{{ row.value || '—' }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.kv {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: var(--fs-sm);
}

.kv__row {
  display: flex;
  gap: var(--sp-3);
  align-items: baseline;
  padding: var(--sp-2) 0;
}

.kv--striped .kv__row:nth-child(odd) {
  background: var(--bg-surface-2);
}

.kv--striped .kv__row {
  padding: var(--sp-2) var(--sp-2);
  border-radius: var(--radius-xs);
}

.kv__key {
  flex: none;
  width: 40%;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.kv__value {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
</style>
