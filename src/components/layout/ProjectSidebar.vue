<script setup lang="ts">
/**
 * 项目侧栏（Obsidian 式项目列表，§9.1）
 *
 * 结构：头部操作 → 搜索 → 置顶分组 → 最近分组 → 底部统计
 * 交互：点击打开、右键菜单（置顶/重命名/复制/删除）、删除后 10 秒可撤销
 *
 * M7（用户实测反馈）：
 *   1. 头部的 ＋ 不再就地展开模板列表，而是把**主区**切回"从一次对比开始"。
 *      侧栏只有 260px 宽，四个模板挤进去只能各显示一行小字，
 *      而画廊里的卡片有名字、说明和组成模块——信息明明有地方放，没必要挤。
 *      折叠态的图标条同理（此前那个 ＋ 甚至只是把侧栏展开，连新建都没做）。
 *   2. 删掉条目右侧悬浮出现的六点图标。它长得像拖拽手柄，实际只是右键菜单的
 *      另一个入口，语义与外形对不上。菜单改为**只**由右键唤出（与 Obsidian 一致）。
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { formatRelative } from '@/lib/time'

const { t, locale } = useI18n()
const router = useRouter()
const ui = useUiStore()
const projects = useProjectsStore()
const store = useProjectStore()
const sidebar = useSidebarStore()

const collapsed = computed(() => ui.sidebarCollapsed)
const currentLocale = computed(() => (locale.value === 'en-US' ? 'en-US' : 'zh-CN'))

// ————————————————————————————————————————————————————————
// 新建：回到"从一次对比开始"
// ————————————————————————————————————————————————————————

/**
 * 点 ＋ ＝ 去空状态选模板。
 *
 * 先切路由再清 current：反过来的话 CompareView 里那个"current 变 null → 退回
 * #/compare"的 watcher 会先跑，路由与状态各更新一半，中间那一帧画廊和画布都可能在。
 */
async function startNew(): Promise<void> {
  menuFor.value = null
  if (router.currentRoute.value.name !== 'compare') await router.replace({ name: 'compare' })
  await store.startNewComparison()
}

// ————————————————————————————————————————————————————————
// 打开与右键菜单
// ————————————————————————————————————————————————————————

async function openProject(id: string): Promise<void> {
  const result = await store.open(id)
  if (!result.ok) ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
}

const menuFor = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function toggleMenu(id: string): void {
  menuFor.value = menuFor.value === id ? null : id
}

async function startRename(id: string, title: string): Promise<void> {
  menuFor.value = null
  renaming.value = id
  renameDraft.value = title
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function commitRename(): void {
  if (renaming.value) store.rename(renaming.value, renameDraft.value)
  renaming.value = null
}

async function togglePin(id: string): Promise<void> {
  menuFor.value = null
  await store.togglePinned(id)
}

async function duplicate(id: string): Promise<void> {
  menuFor.value = null
  const result = await store.duplicate(id)
  if (!result.ok) ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
}

// —— 删除（带 10 秒撤销窗口） ——

const deleteTarget = ref<{ id: string; title: string } | null>(null)

function askDelete(id: string, title: string): void {
  menuFor.value = null
  deleteTarget.value = { id, title }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return

  const result = await store.remove(target.id)
  if (!result.ok) {
    ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
    return
  }

  const undo = result.value.undo
  ui.notify(t('toast.projectDeleted', { title: target.title }), 'info', {
    duration: 10_000,
    actionLabel: t('toast.undo'),
    onAction: () => void undo(),
  })
}

function relativeTime(timestamp: number): string {
  return formatRelative(timestamp, Date.now(), currentLocale.value)
}

function rowCount(projectId: string): number {
  return projects.byId(projectId)?.sheet.rows.length ?? 0
}
</script>

<template>
  <aside class="sidebar">
    <!-- 折叠态：图标条 -->
    <div v-if="collapsed" class="sidebar__rail">
      <button
        class="sidebar__icon-btn"
        type="button"
        :title="t('sidebar.newProject')"
        :aria-label="t('sidebar.newProject')"
        @click="startNew"
      >
        <AppIcon name="plus" :size="18" />
      </button>
      <button
        class="sidebar__icon-btn"
        type="button"
        :title="t('nav.toggleSidebar')"
        :aria-label="t('nav.toggleSidebar')"
        @click="ui.toggleSidebar()"
      >
        <AppIcon name="sidebar" :size="18" />
      </button>
    </div>

    <template v-else>
      <div class="sidebar__head">
        <span class="sidebar__title">{{ t('sidebar.projects') }}</span>
        <button
          class="sidebar__icon-btn"
          type="button"
          :title="t('sidebar.newProject')"
          :aria-label="t('sidebar.newProject')"
          @click="startNew"
        >
          <AppIcon name="plus" :size="16" />
        </button>
      </div>

      <div class="sidebar__search">
        <AppIcon name="search" :size="14" class="sidebar__search-icon" />
        <input
          :value="sidebar.query"
          class="sidebar__search-input"
          type="search"
          :placeholder="t('sidebar.searchPlaceholder')"
          :aria-label="t('sidebar.searchPlaceholder')"
          @input="sidebar.setQuery(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="sidebar__body u-scroll-y" @click="menuFor = null">
        <p v-if="projects.isEmpty && !projects.hasQuery" class="sidebar__empty">
          {{ t('sidebar.noProjects') }}
        </p>
        <p v-else-if="projects.visible.length === 0" class="sidebar__empty">
          {{ t('sidebar.emptySearch') }}
        </p>

        <template v-else>
          <template
            v-for="group in [
              { key: 'pinned' as const, items: projects.pinned },
              { key: 'recent' as const, items: projects.recent },
            ]"
            :key="group.key"
          >
            <p v-if="group.items.length > 0" class="sidebar__section">
              {{ t(`sidebar.${group.key}`) }}
            </p>
            <ul class="sidebar__list">
              <li v-for="project in group.items" :key="project.id" class="sidebar__item-wrap">
                <input
                  v-if="renaming === project.id"
                  ref="renameInput"
                  v-model="renameDraft"
                  class="sidebar__rename"
                  type="text"
                  @blur="commitRename"
                  @keydown.enter.prevent="commitRename"
                  @keydown.esc.prevent="renaming = null"
                />
                <button
                  v-else
                  class="sidebar__item"
                  type="button"
                  :class="{ 'sidebar__item--active': store.current?.id === project.id }"
                  :aria-current="store.current?.id === project.id ? 'true' : undefined"
                  @click="openProject(project.id)"
                  @contextmenu.prevent="toggleMenu(project.id)"
                >
                  <AppIcon v-if="project.pinned" name="star" :size="12" class="sidebar__item-pin" />
                  <span class="sidebar__item-text">
                    <span class="sidebar__item-title u-truncate">{{ project.title }}</span>
                    <span class="sidebar__item-meta">
                      {{ relativeTime(project.updatedAt) }} ·
                      {{ t('compare.rows', { n: rowCount(project.id) }) }}
                    </span>
                  </span>
                </button>

                <ul v-if="menuFor === project.id" class="ctx-menu">
                  <li>
                    <button type="button" @click="togglePin(project.id)">
                      {{ project.pinned ? t('sidebar.unpin') : t('sidebar.pin') }}
                    </button>
                  </li>
                  <li>
                    <button type="button" @click="startRename(project.id, project.title)">
                      {{ t('common.rename') }}
                    </button>
                  </li>
                  <li>
                    <button type="button" @click="duplicate(project.id)">
                      {{ t('common.duplicate') }}
                    </button>
                  </li>
                  <li>
                    <button
                      class="ctx-menu__danger"
                      type="button"
                      @click="askDelete(project.id, project.title)"
                    >
                      {{ t('common.delete') }}
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </template>
        </template>
      </div>

      <div class="sidebar__foot">
        <span class="sidebar__hint">{{ t('sidebar.count', { n: projects.items.length }) }}</span>
        <!--
          菜单只由右键唤出（六点图标已按实测反馈删除），
          因此这里必须留一句提示——否则"能置顶/重命名/删除"这件事
          对新用户来说完全不可见。
        -->
        <span class="sidebar__hint sidebar__hint--dim">{{ t('sidebar.rightClickHint') }}</span>
      </div>
    </template>

    <AppDialog
      :open="deleteTarget !== null"
      tone="danger"
      :title="t('dialog.deleteProjectTitle')"
      :message="t('dialog.deleteProjectMessage', { title: deleteTarget?.title ?? '' })"
      :confirm-label="t('common.delete')"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sidebar__rail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  align-items: center;
  padding: var(--sp-3) 0;
}

.sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-3) var(--sp-2);
}

.sidebar__title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
}

.sidebar__icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sidebar__search {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  margin: 0 var(--sp-3) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.sidebar__search-icon {
  color: var(--text-muted);
}

.sidebar__search-input {
  width: 100%;
  height: 30px;
  background: none;
  border: none;
  outline: none;
}

.sidebar__search-input::placeholder {
  color: var(--text-disabled);
}

.sidebar__body {
  flex: 1;
  min-height: 0;
  padding: 0 var(--sp-2);
}

.sidebar__section {
  padding: var(--sp-2) var(--sp-2) var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sidebar__item-wrap {
  position: relative;
}

.sidebar__item {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
}

.sidebar__item:hover {
  background: var(--bg-hover);
}

.sidebar__item--active {
  background: var(--accent-soft);
}

.sidebar__item-pin {
  flex: none;
  color: var(--warning);
}

.sidebar__item-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sidebar__item-title {
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.sidebar__item-meta {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__rename {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.ctx-menu {
  position: absolute;
  top: 100%;
  right: var(--sp-2);
  z-index: var(--z-sticky);
  min-width: 132px;
  padding: var(--sp-1);
  margin-top: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
}

.ctx-menu button {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: left;
  border-radius: var(--radius-xs);
}

.ctx-menu button:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ctx-menu__danger {
  color: var(--danger) !important;
}

.sidebar__empty {
  padding: var(--sp-4) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: center;
}

.sidebar__foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border-top: 1px solid var(--border-subtle);
}

.sidebar__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.sidebar__hint--dim {
  color: var(--text-disabled);
  opacity: 0.8;
}
</style>
