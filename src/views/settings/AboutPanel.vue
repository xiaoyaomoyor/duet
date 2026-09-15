<script setup lang="ts">
/**
 * 关于：版本、协议、仓库、快捷键一览
 */
import { useI18n } from 'vue-i18n'
import { APP } from '@/app.config'
import { isDesktop } from '@/services/themeService'

const { t } = useI18n()

const shortcuts: Array<{ keys: string; labelKey: string }> = [
  { keys: 'Ctrl/Cmd + K', labelKey: 'topbar.commandPalette' },
  { keys: 'Ctrl/Cmd + B', labelKey: 'nav.toggleSidebar' },
  { keys: 'Ctrl/Cmd + Z', labelKey: 'nav.undo' },
  { keys: 'Shift + Ctrl/Cmd + Z', labelKey: 'nav.redo' },
]
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.about') }}</h3>

  <dl class="about">
    <div class="about__row">
      <dt>{{ t('app.name') }}</dt>
      <dd>{{ APP.nameZh }} · {{ APP.nameEn }}</dd>
    </div>
    <div class="about__row">
      <dt>Version</dt>
      <dd>v{{ APP.version }}</dd>
    </div>
    <div class="about__row">
      <dt>License</dt>
      <dd>{{ APP.license }}</dd>
    </div>
    <div class="about__row">
      <dt>Repository</dt>
      <dd>
        <a :href="APP.repo" target="_blank" rel="noopener noreferrer">{{ APP.repo }}</a>
      </dd>
    </div>
    <div class="about__row">
      <dt>Platform</dt>
      <dd>{{ isDesktop() ? 'Desktop (Tauri)' : 'Web' }}</dd>
    </div>
    <div class="about__row">
      <dt>{{ t('app.tagline') }}</dt>
      <dd>{{ APP.taglineZh }}</dd>
    </div>
  </dl>

  <h4 class="about__subheading">{{ t('topbar.commandPalette') }}</h4>
  <ul class="shortcuts">
    <li v-for="item in shortcuts" :key="item.keys">
      <kbd>{{ item.keys }}</kbd>
      <span>{{ t(item.labelKey) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
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

.about__subheading {
  margin: var(--sp-6) 0 var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
}

.shortcuts li {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}

kbd {
  min-width: 150px;
  padding: 2px var(--sp-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
}
</style>
