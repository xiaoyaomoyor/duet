<script setup lang="ts">
/**
 * 语言设置：切换即时生效并落盘
 */
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { SUPPORTED_LOCALES } from '@/i18n'
import type { LanguageCode } from '@/types/project'

const { t } = useI18n()
const settings = useSettingsStore()

async function select(code: LanguageCode): Promise<void> {
  if (settings.settings.language === code) return
  await settings.setLanguage(code)
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.language') }}</h3>

  <ul class="options">
    <li v-for="locale in SUPPORTED_LOCALES" :key="locale.code">
      <button
        class="option"
        type="button"
        :class="{ 'option--active': settings.settings.language === locale.code }"
        :aria-pressed="settings.settings.language === locale.code"
        @click="select(locale.code)"
      >
        <span>{{ locale.label }}</span>
        <AppIcon
          v-if="settings.settings.language === locale.code"
          name="check"
          :size="16"
          class="option__check"
        />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: 320px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  text-align: left;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.option:hover {
  border-color: var(--border-strong);
}

.option--active {
  border-color: var(--accent-500);
}

.option__check {
  color: var(--accent-500);
}
</style>
