<script setup lang="ts">
/**
 * 行为设置：保持位置 / 自动保存间隔 / 空模块可见性 / 侧栏宽度
 */
import { useI18n } from 'vue-i18n'
import SettingsField from '@/components/common/SettingsField.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { APP } from '@/app.config'

const { t } = useI18n()
const settings = useSettingsStore()

async function updateAutosave(value: number): Promise<void> {
  await settings.patch({ autosaveDebounceMs: value })
}

async function updateSidebarWidth(value: number): Promise<void> {
  await settings.patch({ sidebarWidth: value })
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.behavior') }}</h3>

  <label class="row-toggle">
    <span class="row-toggle__text">
      <span class="row-toggle__label">{{ t('settings.restoreLastPosition') }}</span>
      <span class="row-toggle__hint">{{ t('settings.restoreLastPositionHint') }}</span>
    </span>
    <input
      class="row-toggle__input"
      type="checkbox"
      :checked="settings.settings.restoreLastPosition"
      @change="
        settings.patch({ restoreLastPosition: !settings.settings.restoreLastPosition })
      "
    />
  </label>

  <label class="row-toggle">
    <span class="row-toggle__text">
      <span class="row-toggle__label">{{ t('settings.editorShowEmptyModules') }}</span>
      <span class="row-toggle__hint">{{ t('settings.editorShowEmptyModulesHint') }}</span>
    </span>
    <input
      class="row-toggle__input"
      type="checkbox"
      :checked="settings.settings.editorShowEmptyModules"
      @change="
        settings.patch({ editorShowEmptyModules: !settings.settings.editorShowEmptyModules })
      "
    />
  </label>

  <div class="spacer" />

  <SettingsField
    :label="t('settings.autosaveDebounce')"
    :hint="t('settings.autosaveDebounceHint')"
  >
    <input
      class="control"
      type="number"
      min="100"
      max="2000"
      step="50"
      :value="settings.settings.autosaveDebounceMs"
      @change="updateAutosave(Number(($event.target as HTMLInputElement).value))"
    />
  </SettingsField>

  <SettingsField :label="t('settings.sidebarWidth')">
    <input
      class="control"
      type="range"
      :min="APP.sidebar.min"
      :max="APP.sidebar.max"
      step="10"
      :value="settings.settings.sidebarWidth"
      @input="updateSidebarWidth(Number(($event.target as HTMLInputElement).value))"
    />
  </SettingsField>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.row-toggle {
  display: flex;
  gap: var(--sp-4);
  align-items: center;
  justify-content: space-between;
  max-width: 480px;
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.row-toggle__text {
  display: flex;
  flex-direction: column;
}

.row-toggle__label {
  font-size: var(--fs-sm);
}

.row-toggle__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.row-toggle__input {
  flex: none;
  width: 34px;
  height: 18px;
  accent-color: var(--accent-solid);
}

.spacer {
  height: var(--sp-5);
}

.control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

input[type='range'].control {
  padding: 0;
  background: none;
  border: none;
  accent-color: var(--accent-solid);
}
</style>
