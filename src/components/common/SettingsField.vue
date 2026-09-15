<script setup lang="ts">
/**
 * 设置项容器：统一"标签 + 说明 + 控件"的排版
 *
 * 每个设置面板都由若干 SettingsField 组成，避免各面板各写一套间距。
 */
defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <div class="field">
    <div class="field__head">
      <span class="field__label">{{ label }}</span>
      <span v-if="hint" class="field__hint">{{ hint }}</span>
    </div>
    <div class="field__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.field {
  margin-bottom: var(--sp-5);
}

.field__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--sp-2);
}

.field__label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.field__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field__control {
  max-width: 420px;
}
</style>
