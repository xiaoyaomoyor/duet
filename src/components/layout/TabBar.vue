<script setup lang="ts">
/**
 * 标签栏：显示当前打开的对比项目
 *
 * M0：仅渲染一个"无项目"占位标签；
 * M1 接入 projectStore 的打开列表与关闭逻辑。
 */
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore } from '@/stores/useUiStore'

const { t } = useI18n()
const ui = useUiStore()
</script>

<template>
  <nav class="tabbar" :aria-label="t('sidebar.projects')">
    <div class="tabbar__tabs">
      <button
        class="tabbar__tab tabbar__tab--active"
        type="button"
        :aria-current="'page'"
        @click="ui.notify(t('common.comingSoon'), 'info')"
      >
        <span class="tabbar__dot" aria-hidden="true" />
        <span class="tabbar__label">{{ t('sidebar.noProjects') }}</span>
      </button>
    </div>

    <button
      class="tabbar__add"
      type="button"
      :title="t('sidebar.newProject')"
      :aria-label="t('sidebar.newProject')"
      @click="ui.notify(t('common.comingSoon'), 'info')"
    >
      <AppIcon name="plus" :size="15" />
    </button>
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
  min-width: 0;
  overflow-x: auto;
}

.tabbar__tab {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  max-width: 220px;
  padding: 0 var(--sp-3);
  overflow: hidden;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  white-space: nowrap;
  border-radius: var(--radius-sm);
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
