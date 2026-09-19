<script setup lang="ts">
/**
 * 应用外壳（AppShell）
 *
 * 四区结构：顶栏 / 项目侧栏 / 主内容区 / 属性面板（可折叠）。
 * 设置界面与对比界面都挂在主内容区。
 *
 * M6：侧栏宽度可拖拽调节（像 Obsidian 那样拖中缝）。
 *   拖拽中的实时值放在 ui store（不落盘，避免每一帧都写数据库），
 *   松手时才持久化到设置里。
 *
 * M7：
 *   1. 全局快捷键在这里注册一次（撤回/重做/切视图/命令面板）。
 *   2. 导出对话框的开关搬进 ui store —— 触发点在对比页工具条上，
 *      与对话框之间隔着 RouterView，事件传不上来。
 *   3. 右下角显示版本号：用户报 bug 时能直接念出来，不用去设置里翻。
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TopBar from './TopBar.vue'
import ProjectSidebar from './ProjectSidebar.vue'
import TabBar from './TabBar.vue'
import ExportDialog from '@/components/export/ExportDialog.vue'
import AppToasts from '@/components/common/AppToasts.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts'
import { applySidebarWidth } from '@/lib/theme'
import { APP } from '@/app.config'

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()
const settings = useSettingsStore()
const project = useProjectStore()
const studio = computed(
  () =>
    route.meta.layout === 'compare' && project.current?.sheet.layout.presentation?.enabled === true,
)

useGlobalShortcuts()

/** 设置界面不显示对比标签页 */
const showTabs = computed(() => route.meta.layout !== 'settings')

/** 路由级别的标题（供侧栏与顶栏共享的语义区域使用） */
const sectionTitle = computed(() => (showTabs.value ? t('nav.compare') : t('nav.settings')))

// ——————————————————————————————————————————————————————————
// 侧栏拖拽调宽
// ——————————————————————————————————————————————————————————

/*
 * 拖拽的实时值以 ui.sidebarWidth 为准（它在 setSidebarWidth 里已做区间夹取）。
 * 设置加载完成后要把持久化的值同步进来，否则用户上次调好的宽度
 * 会在开始拖拽的一瞬间跳回默认值。
 */
watch(
  () => settings.settings.sidebarWidth,
  (width) => {
    if (!ui.sidebarDragging) ui.setSidebarWidth(width)
  },
  { immediate: true },
)

/** 拖拽过程中的起始状态 */
let dragStartX = 0
let dragStartWidth = 0

function onResizeStart(event: PointerEvent): void {
  if (ui.sidebarCollapsed) return
  dragStartX = event.clientX
  dragStartWidth = ui.sidebarWidth
  ui.sidebarDragging = true
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

  // 拖拽期间禁用文本选中与过渡，否则会选中侧栏文字、宽度也会跟手迟滞
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onResizeMove(event: PointerEvent): void {
  if (!ui.sidebarDragging) return
  // 直接改 CSS 变量而不是等 Vue 重渲染：拖拽要跟手，一帧的延迟都能感觉到
  const next = dragStartWidth + (event.clientX - dragStartX)
  ui.setSidebarWidth(next)
  applySidebarWidth(ui.sidebarWidth)
  event.preventDefault()
}

function onResizeEnd(event: PointerEvent): void {
  if (!ui.sidebarDragging) return
  ui.sidebarDragging = false
  ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)

  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  // 松手才落盘：拖拽过程中每帧写一次数据库既慢又没必要
  void settings.patch({ sidebarWidth: ui.sidebarWidth })
}

/** 双击中缝：恢复默认宽度 */
function onResizeReset(): void {
  ui.setSidebarWidth(APP.sidebar.defaultWidth)
  applySidebarWidth(ui.sidebarWidth)
  void settings.patch({ sidebarWidth: ui.sidebarWidth })
}

/** 键盘可达：左右方向键调整宽度（拖拽本身对键盘用户不可用） */
function onResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 40 : 16
  if (event.key === 'ArrowLeft') ui.setSidebarWidth(ui.sidebarWidth - step)
  else if (event.key === 'ArrowRight') ui.setSidebarWidth(ui.sidebarWidth + step)
  else return

  event.preventDefault()
  applySidebarWidth(ui.sidebarWidth)
  void settings.patch({ sidebarWidth: ui.sidebarWidth })
}

// 窗口尺寸变化时若侧栏已超出可视范围，夹回合法区间
function onWindowResize(): void {
  ui.setSidebarWidth(Math.min(ui.sidebarWidth, Math.round(window.innerWidth / 3)))
  applySidebarWidth(ui.sidebarWidth)
}

onMounted(() => window.addEventListener('resize', onWindowResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})
</script>

<template>
  <RouterView v-if="route.meta.layout === 'showcase'" />
  <div
    v-else
    class="shell"
    :class="{
      'shell--compact': ui.sidebarCollapsed,
      'shell--studio': studio && !ui.studioProjects,
    }"
  >
    <TopBar class="shell__topbar" :inert="studio && project.current?.ui.mode === 'present'" />

    <ProjectSidebar
      v-show="!studio || ui.studioProjects"
      :inert="studio && project.current?.ui.mode === 'present'"
      class="shell__sidebar"
      :aria-label="sectionTitle"
    />

    <!--
      拖拽中缝。只在展开态出现：折叠后它会把 48px 的窄条再切一刀。
      用 role="separator" + aria-valuenow 让屏幕阅读器知道它是可调节的分隔条。
    -->
    <div
      v-if="
        !ui.sidebarCollapsed &&
        (!studio || (ui.studioProjects && project.current?.ui.mode !== 'present'))
      "
      class="shell__resizer u-split u-split--v"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('nav.resizeSidebar')"
      :aria-valuenow="ui.sidebarWidth"
      :aria-valuemin="APP.sidebar.min"
      :aria-valuemax="APP.sidebar.max"
      tabindex="0"
      :class="{ 'shell__resizer--active': ui.sidebarDragging }"
      @pointerdown="onResizeStart"
      @pointermove="onResizeMove"
      @pointerup="onResizeEnd"
      @pointercancel="onResizeEnd"
      @dblclick="onResizeReset"
      @keydown="onResizeKeydown"
    />

    <main class="shell__main">
      <TabBar v-if="showTabs && !studio" />
      <div class="shell__content u-scroll-y">
        <RouterView />
      </div>
    </main>

    <ExportDialog :open="ui.exportOpen" @close="ui.closeExport()" />

    <AppToasts />
  </div>
</template>

<style scoped>
.shell {
  position: relative; /* 分隔条的定位基准 */
  display: grid;
  grid-template:
    'topbar topbar' var(--size-topbar)
    'sidebar main' 1fr / var(--size-sidebar) 1fr;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}

/*
 * 折叠态只改第一列的宽度。
 * 对比配置面板已搬到 CompareView 内部（它属于对比页，不属于外壳），
 * 因此这里不再需要第三列，--size-inspector 也随之取消。
 */
.shell--compact {
  grid-template-columns: var(--size-sidebar-collapsed) 1fr;
}
.shell--studio {
  grid-template-columns: 0 minmax(0, 1fr);
}

.shell__topbar {
  grid-area: topbar;
}

.shell__sidebar {
  grid-area: sidebar;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

/*
 * 分隔条绝对定位、**不占网格列**：
 * 这样 grid-template-columns 仍然是"侧栏 1fr auto"，
 * 宽度只需要由 --size-sidebar 一个变量管。
 *
 * 可见线宽与抓取宽度由 .u-split--v 统一提供（3px / 12px），
 * 与中轴、对比配置、行高四条线对齐。
 */
.shell__resizer {
  position: absolute;
  top: var(--size-topbar);
  bottom: 0;
  left: calc(var(--size-sidebar) - 6px);
  z-index: var(--z-sticky);
}

/* 拖拽过程中保持亮起：鼠标偶尔划出 12px 抓取区时线不该闪一下 */
.shell__resizer--active::after {
  background: var(--accent-500);
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
</style>
