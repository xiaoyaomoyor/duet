<script setup lang="ts">
/**
 * 外观设置：主题 / 动效强度
 *
 * v1 只有一套紫夜主题；其余主题以禁用态呈现并标注"后续版本"，
 * 不做假选项（§11.4）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'

const { t } = useI18n()
const settings = useSettingsStore()

const motionOptions = computed(() => [
  { value: 'auto' as const, label: t('settings.reducedMotionAuto') },
  { value: 'always' as const, label: t('settings.reducedMotionAlways') },
  { value: 'never' as const, label: t('settings.reducedMotionNever') },
])

async function updateMotion(value: 'auto' | 'always' | 'never'): Promise<void> {
  await settings.patch({ reducedMotion: value })
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.appearance') }}</h3>

  <SettingsField :label="t('settings.theme')" :hint="t('settings.themeMore')">
    <div class="theme-card theme-card--active">
      <span class="theme-card__swatch" aria-hidden="true">
        <span class="theme-card__dot" style="background: var(--side-a)" />
        <span class="theme-card__dot" style="background: var(--side-b)" />
      </span>
      <span class="theme-card__name">{{ t('settings.themeVioletDark') }}</span>
      <AppIcon name="check" :size="16" class="theme-card__check" />
    </div>
  </SettingsField>

  <SettingsField :label="t('settings.reducedMotion')">
    <select
      class="control"
      :value="settings.settings.reducedMotion"
      @change="
        updateMotion(($event.target as HTMLSelectElement).value as 'auto' | 'always' | 'never')
      "
    >
      <option v-for="option in motionOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </SettingsField>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.theme-card {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
}

.theme-card__swatch {
  display: inline-flex;
  gap: 3px;
}

.theme-card__dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.theme-card__name {
  font-size: var(--fs-sm);
}

.theme-card__check {
  margin-left: auto;
  color: var(--accent-500);
}

.control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}
</style>
