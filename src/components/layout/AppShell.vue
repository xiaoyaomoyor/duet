<script setup lang="ts">
/**
 * 应用外壳（AppShell）
 *
 * 四区结构：顶栏 / 项目侧栏 / 主内容区 / 属性面板（可折叠）。
 * 设置界面与对比界面都挂在主内容区。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TopBar from './TopBar.vue'
import ProjectSidebar from './ProjectSidebar.vue'
import TabBar from './TabBar.vue'
import InspectorPanel from '@/components/editor/InspectorPanel.vue'
import ExportDialog from '@/components/export/ExportDialog.vue'
import AppToasts from '@/components/common/AppToasts.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectStore } from '@/stores/useProjectStore'

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()
const project = useProjectStore()

/** 设置界面不显示对比标签页 */
const showTabs = computed(() => route.meta.layout !== 'settings')

/** 属性面板只在对比界面、且存在打开的项目时出现 */
const showInspector = computed(() => showTabs.value && ui.inspectorOpen && project.hasProject)

/** 导出对话框（由顶栏触发） */
const exportOpen = ref(false)

/** 路由级别的标题（供侧栏与顶栏共享的语义区域使用） */
const sectionTitle = computed(() => (showTabs.value ? t('nav.compare') : t('nav.settings')))
</script>

<template>
  <div class="shell" :class="{ 'shell--compact': ui.sidebarCollapsed }">
    <TopBar class="shell__topbar" @export="exportOpen = true" />

    <ProjectSidebar class="shell__sidebar" :aria-label="sectionTitle" />

    <main class="shell__main">
      <TabBar v-if="showTabs" />
      <div class="shell__content u-scroll-y">
        <RouterView />
      </div>
    </main>

    <InspectorPanel v-if="showInspector" class="shell__inspector" />

    <ExportDialog :open="exportOpen" @close="exportOpen = false" />

    <AppToasts />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template:
    'topbar topbar topbar' var(--size-topbar)
    'sidebar main inspector' 1fr / var(--size-sidebar) 1fr auto;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}

.shell--compact {
  grid-template-columns: var(--size-sidebar-collapsed) 1fr auto;
}

.shell__topbar {
  grid-area: topbar;
}

.shell__sidebar {
  grid-area: sidebar;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.shell__main {
  display: flex;
  flex-direction: column;
  grid-area: main;
  min-width: 0; /* 允许内部内容收缩，避免长文本撑破网格 */
  overflow: hidden;
}

.shell__content {
  flex: 1;
  min-height: 0;
}

.shell__inspector {
  grid-area: inspector;
}
</style>
