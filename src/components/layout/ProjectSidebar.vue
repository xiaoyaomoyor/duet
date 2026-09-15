<script setup lang="ts">
/**
 * 项目侧栏（Obsidian 式项目列表，§9.1）
 *
 * 结构：头部操作 → 模板选择 → 搜索 → 置顶分组 → 最近分组 → 底部统计
 * 交互：点击打开、右键菜单（置顶/重命名/复制/删除）、删除后 10 秒可撤销
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { BUILTIN_TEMPLATES } from '@/services/templateService'
import { t as translate } from '@/i18n/helper'
import { formatRelative } from '@/lib/time'
import { getModuleMeta } from '@/modules/meta'

const { t, locale } = useI18n()
const ui = useUiStore()
const projects = useProjectsStore()
const store = useProjectStore()
const sidebar = useSidebarStore()

const collapsed = computed(() => ui.sidebarCollapsed)
const currentLocale = computed(() => (locale.value === 'en-US' ? 'en-US' : 'zh-CN'))

// ————————————————————————————————————————————————————————
// 新建：模板选择
// ————————————————————————————————————————————————————————

const showTemplates = ref(false)

const templates = computed(() =>
  BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    name: translate(template.nameKey),
    desc: translate(template.descKey),
    accent: template.accent,
    icon: getModuleMeta(template.fields[0]?.field.type ?? 'text')?.icon ?? 'text',
  })),
)

async function createFrom(templateId: string, name: string): Promise<void> {
  showTemplates.value = false
  const result = await store.create({ templateId, name })
  if (result.ok) {
    ui.notify(t('toast.projectCreated', { title: result.value.title }), 'success')
  } else {
    ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
  }
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
        @click="ui.toggleSidebar()"
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
        <AppIcon name="search" :size="18" />
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
          :aria-expanded="showTemplates"
          @click="showTemplates = !showTemplates"
        >
          <AppIcon :name="showTemplates ? 'close' : 'plus'" :size="16" />
        </button>
      </div>

      <ul v-if="showTemplates" class="sidebar__templates">
        <li v-for="template in templates" :key="template.id">
          <button class="template-card" type="button" @click="createFrom(template.id, template.name)">
            <span
              class="template-card__mark"
              :style="{
                background: `linear-gradient(135deg, ${template.accent[0]}, ${template.accent[1]})`,
              }"
              aria-hidden="true"
            >
              <AppIcon :name="template.icon" :size="13" />
            </span>
            <span class="template-card__text">
              <span class="template-card__name">{{ template.name }}</span>
              <span class="template-card__desc">{{ template.desc }}</span>
            </span>
          </button>
        </li>
      </ul>

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
                  <span
                    class="sidebar__item-more"
                    role="button"
                    tabindex="0"
                    :aria-label="t('common.more')"
                    @click.stop="toggleMenu(project.id)"
                    @keydown.enter.stop="toggleMenu(project.id)"
                  >
                    <AppIcon name="grip" :size="14" />
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

.sidebar__templates {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: 0 var(--sp-3) var(--sp-2);
  margin-bottom: var(--sp-2);
  border-bottom: 1px solid var(--border-subtle);
}

.template-card {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  width: 100%;
  padding: var(--sp-2);
  text-align: left;
  border-radius: var(--radius-md);
  transition: background var(--dur-fast) var(--ease-out);
}

.template-card:hover {
  background: var(--bg-hover);
}

.template-card__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--text-inverse);
  border-radius: var(--radius-sm);
}

.template-card__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.template-card__name {
  font-size: var(--fs-sm);
}

.template-card__desc {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
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

.sidebar__item-more {
  flex: none;
  color: var(--text-disabled);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.sidebar__item:hover .sidebar__item-more {
  opacity: 1;
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
  padding: var(--sp-2) var(--sp-3);
  border-top: 1px solid var(--border-subtle);
}

.sidebar__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}
</style>
