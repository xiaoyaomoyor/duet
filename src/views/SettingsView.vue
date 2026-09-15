<script setup lang="ts">
/**
 * 设置界面（§9.3）
 *
 * M0 已可用：外观（主题 / 动效）、语言、行为（保持位置、自动保存、空模块）、关于。
 * 其余分组给出明确的"归属里程碑"，不做假交互。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import { aboutInfo } from '@/services/themeService'
import { SUPPORTED_LOCALES } from '@/i18n'
import { APP } from '@/app.config'
import type { LanguageCode } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const ui = useUiStore()

const about = aboutInfo()

type PanelId = 'appearance' | 'language' | 'behavior' | 'compare' | 'tools' | 'storage' | 'about'

const panels: Array<{ id: PanelId; icon: string; titleKey: string; milestone?: string }> = [
  { id: 'appearance', icon: 'image', titleKey: 'settings.appearance' },
  { id: 'language', icon: 'text', titleKey: 'settings.language' },
  { id: 'behavior', icon: 'settings', titleKey: 'settings.behavior' },
  { id: 'compare', icon: 'divider', titleKey: 'settings.compareDefaults', milestone: 'M2' },
  { id: 'tools', icon: 'cube', titleKey: 'settings.tools', milestone: 'M2' },
  { id: 'storage', icon: 'export', titleKey: 'settings.storage', milestone: 'M3' },
  { id: 'about', icon: 'comment', titleKey: 'settings.about' },
]

/** 当前面板由路由参数决定（/settings/:panel?），便于深链与刷新保持 */
const activePanel = computed<PanelId>(() => {
  const raw = route.params.panel
  const value = Array.isArray(raw) ? raw[0] : raw
  const found = panels.find((panel) => panel.id === value)
  return found?.id ?? 'appearance'
})

function selectPanel(id: PanelId): void {
  void router.push({ name: 'settings', params: { panel: id } })
}

const motionOptions = computed(() => [
  { value: 'auto' as const, label: t('settings.reducedMotionAuto') },
  { value: 'always' as const, label: t('settings.reducedMotionAlways') },
  { value: 'never' as const, label: t('settings.reducedMotionNever') },
])

async function setLanguage(code: LanguageCode): Promise<void> {
  await settings.setLanguage(code)
  ui.notify(t('toast.saved'), 'success')
}

async function updateMotion(value: 'auto' | 'always' | 'never'): Promise<void> {
  await settings.patch({ reducedMotion: value })
}

async function toggleRestoreLastPosition(): Promise<void> {
  await settings.patch({ restoreLastPosition: !settings.settings.restoreLastPosition })
}

async function toggleEmptyModules(): Promise<void> {
  await settings.patch({ editorShowEmptyModules: !settings.settings.editorShowEmptyModules })
}

async function updateAutosave(value: number): Promise<void> {
  await settings.patch({ autosaveDebounceMs: value })
}

function activeMilestone(): string | undefined {
  return panels.find((panel) => panel.id === activePanel.value)?.milestone
}
</script>

<template>
  <div class="settings">
    <nav class="settings__nav" :aria-label="t('settings.title')">
      <h2 class="settings__nav-title">{{ t('settings.title') }}</h2>
      <ul>
        <li v-for="panel in panels" :key="panel.id">
          <button
            class="settings__nav-item"
            type="button"
            :class="{ 'settings__nav-item--active': activePanel === panel.id }"
            :aria-current="activePanel === panel.id ? 'true' : undefined"
            @click="selectPanel(panel.id)"
          >
            <AppIcon :name="panel.icon" :size="15" />
            <span>{{ t(panel.titleKey) }}</span>
            <span v-if="panel.milestone" class="settings__nav-badge">{{ panel.milestone }}</span>
          </button>
        </li>
      </ul>
    </nav>

    <section class="settings__panel u-scroll-y">
      <!-- 外观 -->
      <template v-if="activePanel === 'appearance'">
        <h3 class="settings__heading">{{ t('settings.appearance') }}</h3>

        <div class="field">
          <span class="field__label">{{ t('settings.theme') }}</span>
          <div class="theme-card theme-card--active">
            <span class="theme-card__swatch" aria-hidden="true">
              <span class="theme-card__dot" style="background: var(--side-a)" />
              <span class="theme-card__dot" style="background: var(--side-b)" />
            </span>
            <span class="theme-card__name">{{ t('settings.themeVioletDark') }}</span>
            <AppIcon name="check" :size="16" class="theme-card__check" />
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="motion-select">{{ t('settings.reducedMotion') }}</label>
          <select
            id="motion-select"
            class="field__control"
            :value="settings.settings.reducedMotion"
            @change="
              updateMotion(($event.target as HTMLSelectElement).value as 'auto' | 'always' | 'never')
            "
          >
            <option v-for="option in motionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </template>

      <!-- 语言 -->
      <template v-else-if="activePanel === 'language'">
        <h3 class="settings__heading">{{ t('settings.language') }}</h3>
        <div class="option-list">
          <button
            v-for="locale in SUPPORTED_LOCALES"
            :key="locale.code"
            class="option"
            type="button"
            :class="{ 'option--active': settings.settings.language === locale.code }"
            @click="setLanguage(locale.code)"
          >
            <span>{{ locale.label }}</span>
            <AppIcon
              v-if="settings.settings.language === locale.code"
              name="check"
              :size="16"
              class="option__check"
            />
          </button>
        </div>
      </template>

      <!-- 行为 -->
      <template v-else-if="activePanel === 'behavior'">
        <h3 class="settings__heading">{{ t('settings.behavior') }}</h3>

        <label class="row-toggle">
          <span class="row-toggle__text">
            <span class="row-toggle__label">{{ t('settings.restoreLastPosition') }}</span>
            <span class="row-toggle__hint">{{ t('settings.restoreLastPositionHint') }}</span>
          </span>
          <input
            type="checkbox"
            class="row-toggle__input"
            :checked="settings.settings.restoreLastPosition"
            @change="toggleRestoreLastPosition"
          />
        </label>

        <label class="row-toggle">
          <span class="row-toggle__text">
            <span class="row-toggle__label">{{ t('settings.editorShowEmptyModules') }}</span>
            <span class="row-toggle__hint">{{ t('settings.editorShowEmptyModulesHint') }}</span>
          </span>
          <input
            type="checkbox"
            class="row-toggle__input"
            :checked="settings.settings.editorShowEmptyModules"
            @change="toggleEmptyModules"
          />
        </label>

        <div class="field">
          <label class="field__label" for="autosave-input">
            {{ t('settings.autosaveDebounce') }}
          </label>
          <input
            id="autosave-input"
            class="field__control"
            type="number"
            min="100"
            max="2000"
            step="50"
            :value="settings.settings.autosaveDebounceMs"
            @change="updateAutosave(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </template>

      <!-- 关于 -->
      <template v-else-if="activePanel === 'about'">
        <h3 class="settings__heading">{{ t('settings.about') }}</h3>
        <dl class="about">
          <div class="about__row">
            <dt>{{ t('app.name') }}</dt>
            <dd>{{ about.name }}</dd>
          </div>
          <div class="about__row">
            <dt>Version</dt>
            <dd>{{ about.version }}</dd>
          </div>
          <div class="about__row">
            <dt>License</dt>
            <dd>{{ about.license }}</dd>
          </div>
          <div class="about__row">
            <dt>Repository</dt>
            <dd>
              <a :href="about.repo" target="_blank" rel="noopener noreferrer">{{ about.repo }}</a>
            </dd>
          </div>
          <div class="about__row">
            <dt>{{ t('app.tagline') }}</dt>
            <dd>{{ APP.taglineZh }}</dd>
          </div>
        </dl>
      </template>

      <!-- 未实现的其余分组 -->
      <template v-else>
        <h3 class="settings__heading">
          {{ t(panels.find((panel) => panel.id === activePanel)?.titleKey ?? 'settings.title') }}
        </h3>
        <p class="settings__placeholder">
          {{ t('settings.placeholder') }}
          <span v-if="activeMilestone()" class="settings__milestone">{{ activeMilestone() }}</span>
        </p>
      </template>
    </section>

    <p v-if="settings.lastError" class="settings__error">{{ t('errors.settingsLoad') }}</p>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--sp-6);
  max-width: 960px;
  padding: var(--sp-6) var(--sp-8);
  margin: 0 auto;
}

.settings__nav-title {
  margin-bottom: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings__nav ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings__nav-item {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: left;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
}

.settings__nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.settings__nav-item--active {
  color: var(--text-primary);
  background: var(--accent-soft);
}

.settings__nav-badge {
  margin-left: auto;
  padding: 0 5px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.settings__panel {
  padding: var(--sp-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.settings__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.settings__placeholder {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.settings__milestone {
  padding: 0 6px;
  font-size: var(--fs-xs);
  color: var(--accent-500);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
}

.settings__error {
  grid-column: 1 / -1;
  font-size: var(--fs-sm);
  color: var(--danger);
}

/* —— 表单元素 —— */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-5);
}

.field__label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.field__control {
  width: 100%;
  max-width: 320px;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.theme-card {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  max-width: 320px;
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

.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: 320px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  text-align: left;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
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
  accent-color: var(--accent-600);
}

.about {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
}

.about__row {
  display: flex;
  gap: var(--sp-4);
}

.about__row dt {
  flex: none;
  width: 120px;
  color: var(--text-muted);
}

.about__row dd {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
