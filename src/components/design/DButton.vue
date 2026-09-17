<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue'
withDefaults(
  defineProps<{
    tone?: 'primary' | 'secondary' | 'quiet' | 'danger'
    icon?: string
    compact?: boolean
  }>(),
  { tone: 'secondary' },
)
</script>

<template>
  <button
    type="button"
    class="d-button"
    :class="[`d-button--${tone}`, { 'd-button--compact': compact }]"
  >
    <AppIcon v-if="icon" :name="icon" :size="16" />
    <slot />
  </button>
</template>

<style scoped>
.d-button {
  display: inline-flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid var(--d-line);
  border-radius: var(--d-radius-control);
  background: var(--d-surface);
  color: var(--d-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  transition:
    background var(--d-fast),
    border-color var(--d-fast);
}
.d-button:hover:not(:disabled) {
  border-color: var(--d-muted);
  background: var(--d-raised);
}
.d-button--primary {
  color: var(--d-accent-ink);
  background: var(--d-accent);
  border-color: var(--d-accent);
}
.d-button--primary:hover:not(:disabled) {
  color: var(--d-accent-ink);
  background: var(--d-accent);
  filter: brightness(1.08);
}
.d-button--quiet {
  border-color: transparent;
  background: transparent;
}
.d-button--danger {
  color: var(--d-danger);
}
.d-button--compact {
  min-height: 34px;
  padding: 6px 10px;
}
.d-button:disabled {
  color: var(--d-muted);
  background: var(--d-raised);
  opacity: 0.65;
}
</style>
