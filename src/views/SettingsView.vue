<script setup lang="ts">
/**
 * 设置界面（§9.3）
 *
 * 结构：左侧分组导航 + 右侧面板（面板组件由 views/settings/index.ts 注册）。
 * 当前分组由路由参数决定（#/settings/:panel），因此可深链、可刷新保持。
 */
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { DEFAULT_PANEL_ID, SETTINGS_PANELS, findPanel, type PanelId } from './settings'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useToolsStore } from '@/stores/useToolsStore'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const tools = useToolsStore()

const activePanel = computed<PanelId>(() => {
  const raw = route.params.panel
  const value = Array.isArray(raw) ? raw[0] : raw
  return findPanel(value)?.id ?? DEFAULT_PANEL_ID
})

const activeComponent = computed(
  () => findPanel(activePanel.value)?.component ?? SETTINGS_PANELS[0]?.component,
)

function selectPanel(id: PanelId): void {
  void router.push({ name: 'settings', params: { panel: id } })
}

onMounted(() => {
  // 工具库面板需要自定义工具数据
  if (tools.customTools.length === 0) void tools.load()
})
</script>

<template>
  <div class="settings">
    <nav class="settings__nav" :aria-label="t('settings.title')">
      <h2 class="settings__nav-title">{{ t('settings.title') }}</h2>
      <ul>
        <li v-for="panel in SETTINGS_PANELS" :key="panel.id">
          <button
            class="settings__nav-item"
            type="button"
            :class="{ 'settings__nav-item--active': activePanel === panel.id }"
            :aria-current="activePanel === panel.id ? 'true' : undefined"
            @click="selectPanel(panel.id)"
          >
            <AppIcon :name="panel.icon" :size="15" />
            <span>{{ t(panel.titleKey) }}</span>
          </button>
        </li>
      </ul>
    </nav>

    <section class="settings__panel u-scroll-y">
      <component :is="activeComponent" />
      <p v-if="settings.lastError" class="settings__error">{{ t('errors.settingsLoad') }}</p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--sp-6);
  max-width: 1040px;
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

.settings__panel {
  min-height: 320px;
  padding: var(--sp-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.settings__error {
  margin-top: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--danger);
}
</style>
