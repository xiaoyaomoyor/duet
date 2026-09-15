<script setup lang="ts">
/**
 * 顶栏：品牌 / 全局搜索 / 撤销重做 / 视图切换 / 导出 / 设置
 *
 * M1 可用：搜索（同时驱动侧栏列表）、撤销重做、保存状态、导入、设置。
 * M3 启用：视图切换（展示视图）与导出。
 * 未启用的按钮一律**禁用并标注所属里程碑**，不提供无法兑现的交互。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useUiStore } from '@/stores/useUiStore'
import { importDuet } from '@/services/exportService'
import { persistProject } from '@/services/projectService'
import { APP } from '@/app.config'

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()
const project = useProjectStore()
const projects = useProjectsStore()
const sidebar = useSidebarStore()

/** 导出由外壳统一托管（对话框挂在 AppShell 上） */
const emit = defineEmits<{ export: [] }>()

const searchInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

const saveState = computed<'saved' | 'saving' | 'dirty'>(() => {
  if (project.saving) return 'saving'
  if (project.dirty) return 'dirty'
  return 'saved'
})

const saveLabel = computed(() =>
  saveState.value === 'saving'
    ? t('compare.saving')
    : saveState.value === 'dirty'
      ? t('compare.unsaved')
      : t('compare.saved'),
)

const undoDisabled = computed(() => !project.canUndo)
const redoDisabled = computed(() => !project.canRedo)

/** 是否处于展示视图（由当前项目的视图态决定） */
const isPresent = computed(() => project.current?.ui.mode === 'present')

function togglePresent(): void {
  if (!project.current) return
  project.setMode(isPresent.value ? 'edit' : 'present')
}

function openSettings(): void {
  void router.push({ name: 'settings' })
}

function focusSearch(): void {
  searchInput.value?.focus()
  searchInput.value?.select()
}

// —— 导入工程文件 ——

function triggerImport(): void {
  fileInput.value?.click()
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importing.value = true
  try {
    const text = await file.text()
    // 统一走 exportService 的导入实现：它会先落媒体再落项目，
    // 并返回缺失媒体与警告信息，而不是静默吞掉问题
    const result = await importDuet(text)
    if (!result.ok) {
      ui.notify(t('export.failed', { message: result.error }), 'danger')
      return
    }

    for (const item of result.value.projects) {
      const saved = await persistProject(item)
      if (!saved.ok) {
        ui.notify(saved.error, 'danger')
        return
      }
      projects.upsert(saved.value)
    }

    ui.notify(t('export.importDone', { n: result.value.projects.length }), 'success')

    const notes = [...result.value.warnings]
    if (result.value.missingAssets.length > 0) {
      notes.push(t('export.missingAssets', { n: result.value.missingAssets.length }))
    }
    if (notes.length > 0) ui.notify(notes.join('；'), 'warning')

    await projects.load()
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), 'danger')
  } finally {
    importing.value = false
  }
}

// —— 快捷键：Ctrl/Cmd + K 聚焦搜索 ——

function onKeydown(event: KeyboardEvent): void {
  const meta = event.ctrlKey || event.metaKey
  if (meta && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    focusSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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

      <RouterLink class="topbar__brand" to="/compare" data-testid="nav-compare">
        <AppLogo :size="22" />
        <span class="topbar__brand-zh">{{ t('app.name') }}</span>
        <span class="topbar__brand-en">{{ APP.nameEn }}</span>
      </RouterLink>
    </div>

    <div class="topbar__search">
      <AppIcon name="search" :size="15" class="topbar__search-icon" />
      <input
        ref="searchInput"
        :value="sidebar.query"
        class="topbar__search-input"
        type="search"
        :placeholder="t('topbar.searchPlaceholder')"
        :aria-label="t('topbar.searchPlaceholder')"
        @input="sidebar.setQuery(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="topbar__group topbar__group--end">
      <span class="topbar__save" :class="`topbar__save--${saveState}`">{{ saveLabel }}</span>

      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="undoDisabled"
        :title="project.undoLabel ? `${t('nav.undo')} · ${project.undoLabel}` : t('nav.undo')"
        :aria-label="t('nav.undo')"
        @click="project.undo()"
      >
        <AppIcon name="undo" :size="18" />
      </button>
      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="redoDisabled"
        :title="project.redoLabel ? `${t('nav.redo')} · ${project.redoLabel}` : t('nav.redo')"
        :aria-label="t('nav.redo')"
        @click="project.redo()"
      >
        <AppIcon name="redo" :size="18" />
      </button>

      <span class="topbar__divider" aria-hidden="true" />

      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="!project.hasProject"
        :title="t('inspector.title')"
        :aria-label="t('inspector.title')"
        :aria-pressed="ui.inspectorOpen"
        @click="ui.toggleInspector()"
      >
        <AppIcon name="settings" :size="18" />
      </button>

      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="!project.hasProject"
        :title="isPresent ? t('present.exit') : t('present.enter')"
        :aria-label="isPresent ? t('present.exit') : t('present.enter')"
        :aria-pressed="isPresent"
        @click="togglePresent"
      >
        <AppIcon name="present" :size="18" />
      </button>

      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="importing"
        :title="t('nav.import')"
        :aria-label="t('nav.import')"
        @click="triggerImport"
      >
        <AppIcon name="import" :size="18" />
      </button>

      <button
        class="topbar__icon-btn"
        type="button"
        :disabled="!project.hasProject"
        :title="t('export.menu')"
        :aria-label="t('export.menu')"
        @click="emit('export')"
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

    <input
      ref="fileInput"
      class="u-visually-hidden"
      type="file"
      :accept="`.${APP.fileExt},application/json`"
      @change="onFilePicked"
    />
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

.topbar__save {
  padding: 0 var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-disabled);
  transition: color var(--dur-base) var(--ease-out);
}

.topbar__save--saving {
  color: var(--accent-500);
}

.topbar__save--dirty {
  color: var(--warning);
}

.topbar__divider {
  width: 1px;
  height: 18px;
  margin: 0 var(--sp-2);
  background: var(--border-default);
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
