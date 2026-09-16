<script setup lang="ts">
/**
 * 顶栏：品牌 + 两个一级入口
 *
 * M7 大幅瘦身（用户实测反馈"顶栏挤了一排图标，分不清哪个是哪个"）：
 *   移除 —— 撤回/重做（改由 Ctrl+Z / Ctrl+Shift+Z，见 useGlobalShortcuts）
 *          保存状态、属性、进入展示视图、导入、导出
 *   保留 —— 品牌，以及**对比 / 设置**这两个页面级入口
 *
 * 被移除的那一组的去处：对比页工具条（CompareToolbar）——
 * 它们全都作用于"当前这份对比"，跟着对比页走比钉在全局顶栏上更符合语义。
 *
 * 选中态用**圆角矩形紫底**而不是下划线：这两个按钮代表"我现在在哪个页面"，
 * 是一个状态而不是一次操作，实心色块比一根细线更容易一眼扫到。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import { useUiStore } from '@/stores/useUiStore'
import { APP } from '@/app.config'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const ui = useUiStore()

/**
 * 当前页面。
 *
 * 用路由 meta.layout 判断而不是 path 前缀：设置页的路径将来可能变，
 * 而"这页是不是设置"这个语义不会变。
 */
const activePage = computed<'compare' | 'settings'>(() =>
  route.meta.layout === 'settings' ? 'settings' : 'compare',
)

function goCompare(): void {
  void router.push({ name: 'compare' })
}

function goSettings(): void {
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

      <!--
        品牌：中文名与英文名**紧挨着**排。
        M6 之前英文名被包在一个描边胶囊里，看上去像一个可点击的标签/按钮，
        实测反馈是"这两个字为什么有个气泡框"。它只是名字的另一半写法，
        因此不加边框、不加背景，只靠字重与字距区分主次。
      -->
      <RouterLink class="topbar__brand" to="/compare" data-testid="nav-compare">
        <AppLogo :size="22" />
        <span class="topbar__brand-zh">{{ t('app.name') }}</span>
        <span class="topbar__brand-en">{{ APP.nameEn }}</span>
      </RouterLink>
    </div>

    <nav class="topbar__group topbar__group--end" :aria-label="t('nav.pages')">
      <RouterLink
        class="topbar__nav"
        :class="{ 'topbar__nav--active': activePage === 'compare' }"
        :to="{ name: 'compare' }"
        data-testid="nav-compare-page"
        @click="goCompare"
      >
        <AppIcon name="compare" :size="16" />
        <span>{{ t('nav.compare') }}</span>
      </RouterLink>

      <RouterLink
        class="topbar__nav"
        :class="{ 'topbar__nav--active': activePage === 'settings' }"
        :to="{ name: 'settings' }"
        data-testid="nav-settings-page"
        @click="goSettings"
      >
        <AppIcon name="settings" :size="16" />
        <span>{{ t('nav.settings') }}</span>
      </RouterLink>
    </nav>
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

/*
 * 英文名紧跟中文名，不做任何"气泡化"处理。
 * 用 --text-muted 而不是 --text-disabled：后者是"不可用"语义，
 * 而这个名字是正常内容，只是层级更低。
 */
.topbar__brand-en {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.topbar__nav {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  height: 32px;
  padding: 0 var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.topbar__nav:hover {
  color: var(--text-primary);
  text-decoration: none;
  background: var(--bg-hover);
}

/*
 * 选中态：紫底 + 白字。
 * 用 --accent-700 而不是 --accent-500：后者在紫夜主题下偏亮，
 * 白字压上去只有 4.2:1，不到 AA 的 4.5:1（浅色主题下 --accent-500
 * 本身是深紫，两个主题的"同一个色号"明暗是反的，不能共用）。
 */
.topbar__nav--active,
.topbar__nav--active:hover {
  color: var(--accent-fg);
  background: var(--accent-700);
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
