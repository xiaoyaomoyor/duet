<script setup lang="ts">
/**
 * 对比默认值：默认配色、配色预设管理、导出倍率
 *
 * 说明：布局比例、中轴光带等属于**每个对比页自身**的属性（sheet.layout），
 * 归 M2 的 InspectorPanel 管；这里只放"新建项目时套用的默认值"。
 */
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import { ACCENT_PAIRS } from '@/services/templateService'
import type { AccentPair } from '@/services/templateService'

const { t } = useI18n()
const settings = useSettingsStore()
const ui = useUiStore()

async function applyPair(colors: AccentPair): Promise<void> {
  await settings.patch({ defaultAccent: [...colors] })
  ui.notify(t('toast.saved'), 'success')
}

async function addPresetFromDefault(): Promise<void> {
  const current = settings.settings.defaultAccent
  const exists = settings.settings.accentPresets.some(
    (preset) => preset.colors[0] === current[0] && preset.colors[1] === current[1],
  )
  if (exists) {
    ui.notify(t('toast.saved'), 'info')
    return
  }

  await settings.patch({
    accentPresets: [
      ...settings.settings.accentPresets,
      { name: `${current[0]} / ${current[1]}`, colors: [...current] as AccentPair },
    ],
  })
  ui.notify(t('toast.saved'), 'success')
}

async function removePreset(index: number): Promise<void> {
  const presets = settings.settings.accentPresets.filter((_, i) => i !== index)
  if (presets.length === 0) return
  await settings.patch({ accentPresets: presets })
}

async function updateExportScale(value: number): Promise<void> {
  await settings.patch({ exportScale: value === 1 ? 1 : 2 })
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.compareDefaults') }}</h3>

  <SettingsField :label="t('settings.defaultAccent')" :hint="t('settings.defaultAccentHint')">
    <div class="accent-preview">
      <span class="accent-preview__swatch" :style="{ background: settings.settings.defaultAccent[0] }" />
      <span class="accent-preview__swatch" :style="{ background: settings.settings.defaultAccent[1] }" />
      <code class="accent-preview__code">
        {{ settings.settings.defaultAccent[0] }} · {{ settings.settings.defaultAccent[1] }}
      </code>
    </div>
  </SettingsField>

  <SettingsField :label="t('settings.accentPresets')" :hint="t('settings.accentPresetsHint')">
    <ul class="presets">
      <li v-for="preset in settings.settings.accentPresets" :key="preset.name" class="preset">
        <button class="preset__apply" type="button" @click="applyPair(preset.colors as AccentPair)">
          <span class="preset__dot" :style="{ background: preset.colors[0] }" />
          <span class="preset__dot" :style="{ background: preset.colors[1] }" />
          <span class="preset__name">{{ preset.name }}</span>
        </button>
        <button
          class="preset__remove"
          type="button"
          :title="t('common.remove')"
          :aria-label="t('common.remove')"
          @click="removePreset(settings.settings.accentPresets.indexOf(preset))"
        >
          <AppIcon name="close" :size="12" />
        </button>
      </li>
    </ul>

    <div class="preset-actions">
      <button class="ghost-btn" type="button" @click="addPresetFromDefault">
        <AppIcon name="plus" :size="14" />
        {{ t('common.apply') }}
      </button>
      <ul class="builtin-pairs">
        <li v-for="pair in ACCENT_PAIRS" :key="pair.name">
          <button
            class="preset__apply preset__apply--compact"
            type="button"
            :title="pair.name"
            @click="applyPair(pair.colors)"
          >
            <span class="preset__dot" :style="{ background: pair.colors[0] }" />
            <span class="preset__dot" :style="{ background: pair.colors[1] }" />
          </button>
        </li>
      </ul>
    </div>
  </SettingsField>

  <SettingsField :label="t('settings.exportScale')" :hint="t('settings.exportScaleHint')">
    <select
      class="control"
      :value="settings.settings.exportScale"
      @change="updateExportScale(Number(($event.target as HTMLSelectElement).value))"
    >
      <option :value="1">1×</option>
      <option :value="2">2×</option>
    </select>
  </SettingsField>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.accent-preview {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.accent-preview__swatch {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
}

.accent-preview__code {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.presets {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.preset {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

.preset__apply {
  display: flex;
  flex: 1;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.preset__apply:hover {
  border-color: var(--border-strong);
}

.preset__apply--compact {
  flex: none;
  padding: var(--sp-1) var(--sp-2);
}

.preset__dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.preset__name {
  font-size: var(--fs-sm);
}

.preset__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
}

.preset__remove:hover {
  color: var(--danger);
  background: var(--bg-hover);
}

.preset-actions {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  margin-top: var(--sp-3);
}

.ghost-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-full);
}

.ghost-btn:hover {
  color: var(--text-primary);
}

.builtin-pairs {
  display: flex;
  gap: var(--sp-1);
}

.control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}
</style>
