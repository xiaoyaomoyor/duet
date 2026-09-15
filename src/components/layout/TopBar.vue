<script setup lang="ts">
/**
 * 顶栏：品牌 / 全局搜索 / 视图切换 / 导出 / 设置
 *
 * M0 阶段仅"侧栏折叠"与"设置跳转"为可用功能，
 * 其余按钮以禁用态呈现并标注所属里程碑，避免给出无法兑现的交互。
 */
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import { useUiStore } from '@/stores/useUiStore'
import { APP } from '@/app.config'

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()

function openSettings(): void {
  void router.push({ name: 'settings' })
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__group">
      <button
        class="topbar__icon-btn"
        type="button"
        :title="t('nav.toggleSidebar')"
        :aria-label="t('nav.toggleSidebar')"
        :aria-pressed="ui.sidebarCollapsed"
        @click="ui.toggleSidebar()"
      >
        <AppIcon name="sidebar" :size="18" />
      </button>

      <RouterLink class="topbar__brand" to="/compare">
        <AppLogo :size="22" />
        <span class="topbar__brand-zh">{{ t('app.name') }}</span>
        <span class="topbar__brand-en">{{ APP.nameEn }}</span>
      </RouterLink>
    </div>

    <div class="topbar__search">
      <AppIcon name="search" :size="15" class="topbar__search-icon" />
      <input
        class="topbar__search-input"
        type="search"
        disabled
        :placeholder="t('topbar.searchPlaceholder')"
        :aria-label="t('topbar.searchPlaceholder')"
      />
    </div>

    <div class="topbar__group topbar__group--end">
      <button
        class="topbar__icon-btn"
        type="button"
        disabled
        :title="`${t('nav.switchToPresent')} · M4`"
        :aria-label="t('nav.switchToPresent')"
      >
        <AppIcon name="present" :size="18" />
      </button>

      <button
        class="topbar__icon-btn"
        type="button"
        disabled
        :title="`${t('nav.export')} · M3`"
        :aria-label="t('nav.export')"
      >
        <AppIcon name="export" :size="18" />
      </button>

      <button
        class="topbar__icon-btn"
        type="button"
        :title="t('nav.settings')"
        :aria-label="t('nav.settings')"
        @click="openSettings"
      >
        <AppIcon name="settings" :size="18" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  height: 100%;
  padding: 0 var(--sp-3);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.topbar__group {
  display: flex;
  flex: none;
  gap: var(--sp-1);
  align-items: center;
}

.topbar__group--end {
  margin-left: auto;
}

.topbar__brand {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: 0 var(--sp-2);
  color: var(--text-primary);
  text-decoration: none;
}

.topbar__brand:hover {
  text-decoration: none;
}

.topbar__brand-zh {
  font-size: var(--fs-md);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.topbar__brand-en {
  padding: 1px 6px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.topbar__search {
  position: relative;
  display: flex;
  flex: 1;
  gap: var(--sp-2);
  align-items: center;
  max-width: 380px;
  padding: 0 var(--sp-3);
  margin: 0 auto;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.topbar__search-icon {
  color: var(--text-muted);
}

.topbar__search-input {
  width: 100%;
  height: 30px;
  background: none;
  border: none;
  outline: none;
}

.topbar__search-input::placeholder {
  color: var(--text-disabled);
}

.topbar__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.topbar__icon-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.topbar__icon-btn:disabled {
  color: var(--text-disabled);
}
</style>
