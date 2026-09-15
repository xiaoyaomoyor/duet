<script setup lang="ts">
/**
 * 项目侧栏（Obsidian 式项目列表）
 *
 * M0：外壳、折叠、搜索框与空状态已就位；
 * M1 接入项目 CRUD 与列表渲染（模板卡片将真正创建项目）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore } from '@/stores/useUiStore'
import { BUILTIN_TEMPLATES } from '@/services/templateService'
import { t as translate } from '@/i18n/helper'
import { getModuleMeta } from '@/modules/meta'

const { t } = useI18n()
const ui = useUiStore()

/** 搜索关键词（M1 接入真实项目列表后生效） */
const query = ref('')

/** 折叠态：只留图标条 */
const collapsed = computed(() => ui.sidebarCollapsed)

function notifyComingSoon(): void {
  ui.notify(t('common.comingSoon'), 'info')
}

const templates = computed(() =>
  BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    name: translate(template.nameKey),
    desc: translate(template.descKey),
    accent: template.accent,
    icon: getModuleMeta(template.fields[0]?.field.type ?? 'text')?.icon ?? 'text',
  })),
)
</script>

<template>
  <aside class="sidebar">
    <div v-if="collapsed" class="sidebar__rail">
      <button
        class="sidebar__icon-btn"
        type="button"
        :title="t('sidebar.newProject')"
        :aria-label="t('sidebar.newProject')"
        @click="notifyComingSoon"
      >
        <AppIcon name="plus" :size="18" />
      </button>
      <button
        class="sidebar__icon-btn"
        type="button"
        :title="t('sidebar.searchPlaceholder')"
        :aria-label="t('sidebar.searchPlaceholder')"
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
          @click="notifyComingSoon"
        >
          <AppIcon name="plus" :size="16" />
        </button>
      </div>

      <div class="sidebar__search">
        <AppIcon name="search" :size="14" class="sidebar__search-icon" />
        <input
          v-model="query"
          class="sidebar__search-input"
          type="search"
          :placeholder="t('sidebar.searchPlaceholder')"
          :aria-label="t('sidebar.searchPlaceholder')"
        />
      </div>

      <div class="sidebar__body u-scroll-y">
        <p class="sidebar__section">{{ t('sidebar.noProjects') }}</p>

        <ul class="sidebar__templates">
          <li v-for="template in templates" :key="template.id">
            <button class="template-card" type="button" @click="notifyComingSoon">
              <span
                class="template-card__mark"
                :style="{
                  background: `linear-gradient(135deg, ${template.accent[0]}, ${template.accent[1]})`,
                }"
                aria-hidden="true"
              >
                <AppIcon :name="template.icon" :size="14" />
              </span>
              <span class="template-card__text">
                <span class="template-card__name">{{ template.name }}</span>
                <span class="template-card__desc">{{ template.desc }}</span>
              </span>
              <span class="template-card__badge">M1</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="sidebar__foot">
        <span class="sidebar__hint">{{ t('sidebar.noProjectsHint') }}</span>
      </div>
    </template>
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
  padding: 0 var(--sp-3);
}

.sidebar__section {
  margin-bottom: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.sidebar__templates {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.template-card {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.template-card:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.template-card__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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
  color: var(--text-primary);
}

.template-card__desc {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card__badge {
  flex: none;
  padding: 1px 5px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.sidebar__foot {
  padding: var(--sp-3);
  border-top: 1px solid var(--border-subtle);
}

.sidebar__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}
</style>
