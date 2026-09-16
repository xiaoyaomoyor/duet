<script setup lang="ts">
/**
 * 标签栏：显示当前打开的对比项目
 *
 * 行为：点击切换、中键/叉号关闭。
 * 关闭标签**不会**删除项目（删除只在侧栏右键菜单中）。
 *
 * M6：移除了此处的"＋ 新建"按钮——左侧项目列表已有同样入口（且更靠近项目本身），
 * 顶栏再放一个是重复的（用户实测反馈）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()

const tabs = computed(() => store.openProjects)
const hasTabs = computed(() => tabs.value.length > 0)

async function activate(id: string): Promise<void> {
  if (store.current?.id === id) return
  const result = await store.open(id)
  if (!result.ok) ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
}

async function close(id: string): Promise<void> {
  await store.closeTab(id)
}
</script>

<template>
  <nav class="tabbar" :aria-label="t('sidebar.projects')">
    <div class="tabbar__tabs">
      <p v-if="!hasTabs" class="tabbar__hint">{{ t('sidebar.noProjectsHint') }}</p>

      <button
        v-for="project in tabs"
        :key="project.id"
        class="tabbar__tab"
        :class="{ 'tabbar__tab--active': store.current?.id === project.id }"
        type="button"
        :aria-current="store.current?.id === project.id ? 'page' : undefined"
        @click="activate(project.id)"
        @auxclick.middle.prevent="close(project.id)"
      >
        <span class="tabbar__dot" aria-hidden="true" />
        <span class="tabbar__label u-truncate">{{ project.title }}</span>
        <span
          class="tabbar__close"
          role="button"
          tabindex="0"
          :aria-label="t('compare.tabClose')"
          :title="t('compare.tabClose')"
          @click.stop="close(project.id)"
          @keydown.enter.stop="close(project.id)"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  height: var(--size-tabbar);
  padding: 0 var(--sp-3);
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
}

.tabbar__tabs {
  display: flex;
  flex: 1;
  gap: var(--sp-1);
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.tabbar__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.tabbar__tab {
  display: inline-flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  max-width: 220px;
  height: 26px;
  padding: 0 var(--sp-1) 0 var(--sp-3);
  overflow: hidden;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  white-space: nowrap;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
}

.tabbar__tab:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.tabbar__tab--active {
  color: var(--text-primary);
  background: var(--bg-surface-2);
}

.tabbar__dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: var(--accent-500);
  border-radius: var(--radius-full);
}

.tabbar__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tabbar__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.tabbar__tab:hover .tabbar__close,
.tabbar__tab--active .tabbar__close {
  opacity: 1;
}

.tabbar__close:hover {
  color: var(--text-primary);
  background: var(--bg-active);
}

.tabbar__add {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.tabbar__add:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
