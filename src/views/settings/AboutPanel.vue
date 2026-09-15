<script setup lang="ts">
/**
 * 关于：版本、协议、仓库、快捷键一览、安装入口
 */
import { useI18n } from 'vue-i18n'
import { APP } from '@/app.config'
import { isDesktop } from '@/services/themeService'
import { install, pwaState } from '@/composables/usePwa'
import { useUiStore } from '@/stores/useUiStore'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const ui = useUiStore()

const { canInstall, installed } = pwaState()

const shortcuts: Array<{ keys: string; labelKey: string }> = [
  { keys: 'Ctrl/Cmd + K', labelKey: 'topbar.commandPalette' },
  { keys: 'Ctrl/Cmd + B', labelKey: 'nav.toggleSidebar' },
  { keys: 'Ctrl/Cmd + Z', labelKey: 'nav.undo' },
  { keys: 'Shift + Ctrl/Cmd + Z', labelKey: 'nav.redo' },
]

/**
 * iOS Safari 与部分浏览器不提供 beforeinstallprompt，
 * 此时按钮没用——但也不能让用户对着一个点不动的按钮猜原因，
 * 所以给出"怎么手动装"的说明。
 */
async function onInstall(): Promise<void> {
  if (!canInstall.value) {
    ui.notify(t('pwa.installUnavailable'), 'info', { duration: 6000 })
    return
  }
  await install()
}
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

  <!-- 已经装过就不再劝装一次；装在 Tauri 里也没有意义 -->
  <template v-if="!isDesktop() && !installed">
    <h4 class="about__subheading">{{ t('pwa.install') }}</h4>
    <button class="install-btn" type="button" @click="onInstall">
      <AppIcon name="export" :size="13" />
      {{ t('pwa.install') }}
    </button>
    <p class="install-hint">{{ t('pwa.installHint') }}</p>
  </template>

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

.install-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  width: fit-content;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: color var(--dur-fast) var(--ease-out);
}

.install-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.install-hint {
  margin-top: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
</style>
