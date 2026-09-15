<script setup lang="ts">
import { computed } from 'vue'
import type { ModuleRendererProps } from '../types'
import type { DividerData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<DividerData>(() => {
  const raw = props.module.data as Partial<DividerData> | undefined
  return { style: raw?.style ?? 'solid', label: raw?.label ?? '' }
})
</script>

<template>
  <div class="divider" :class="`divider--${data.style}`">
    <span v-if="data.label" class="divider__label">{{ data.label }}</span>
  </div>
</template>

<style scoped>
.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-2) 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.divider::before {
  flex: 1;
  height: 1px;
  content: '';
  background: var(--border-default);
}

.divider--dashed::before {
  background: repeating-linear-gradient(
    90deg,
    var(--border-strong) 0 6px,
    transparent 6px 12px
  );
}

.divider__label {
  padding: 0 var(--sp-3);
  letter-spacing: 0.08em;
}
</style>
