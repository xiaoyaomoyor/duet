<script setup lang="ts">
/**
 * 顶栏：品牌 + 两个页面级入口
 *
 * M7 大幅瘦身（用户实测反馈"顶栏挤了一排图标，分不清哪个是哪个"）：
 *   移除 —— 撤回/重做（改由 Ctrl+Z / Ctrl+Shift+Z，见 useGlobalShortcuts）
 *          保存状态、属性、进入展示视图、导入、导出
 *   保留 —— 品牌，以及**对比 / 设置**这两个页面级入口（只有图标）
 *
 * 被移除的那一组的去处：对比页工具条（CompareToolbar）——
 * 它们全都作用于"当前这份对比"，跟着对比页走比钉在全局顶栏上更符合语义。
 *
 * 两个入口用**圆角矩形紫底**表示选中，而不是下划线：
 * 它们代表"我现在在哪个页面"，是一个状态而不是一次操作，
 * 实心色块比一根细线更容易一眼扫到。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import { APP } from '@/app.config'

const { t } = useI18n()
const route = useRoute()

/**
 * 当前页面。
 *
 * 用路由 meta.layout 判断而不是 path 前缀：设置页的路径将来可能变，
 * 而"这页是不是设置"这个语义不会变。
 */
const activePage = computed<'compare' | 'settings'>(() =>
  route.meta.layout === 'settings' ? 'settings' : 'compare',
)
</script>

<template>
  <header class="topbar">
    <div class="topbar__group">
      <!--
        侧栏的折叠开关**不在这里**（M9 按实测反馈挪到了侧栏自己的标题栏里，
        紧挨着「项目列表」的 ＋）。此前顶栏一个 ☰、折叠后的窄条里又一个，
        同一件事有两个入口，而且那个 ☰ 折叠之后还赖着不走。
      -->
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
        :class="{ 'u-selected': activePage === 'compare' }"
        :to="{ name: 'compare' }"
        data-testid="nav-compare-page"
        :title="t('nav.compare')"
        :aria-label="t('nav.compare')"
      >
        <AppIcon name="versus" :size="17" class="u-selected-icon" />
      </RouterLink>

      <RouterLink
        class="topbar__nav"
        :class="{ 'u-selected': activePage === 'settings' }"
        :to="{ name: 'settings' }"
        data-testid="nav-settings-page"
        :title="t('nav.settings')"
        :aria-label="t('nav.settings')"
      >
        <AppIcon name="settings" :size="17" class="u-selected-icon" />
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

/*
 * 页面入口：**只有图标**（用户明确要求"顶栏右侧只留两个图标"）。
 * 图标本身有歧义风险（"网格"和"齿轮"都可能是设置），因此必须补 title + aria-label，
 * 两者也正好是可访问名与无障碍检查的落点。
 *
 * 选中态走 .u-selected（浅色底 + 主题色图标），与左侧项目列表里被选中的那一项同源。
 * 这里此前用的是 accent-700 实心深紫，看上去像两个大按钮——用户实测反馈"颜色不对"。
 */
.topbar__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 32px;
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

.topbar__nav.u-selected:hover {
  background: var(--accent-soft);
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
