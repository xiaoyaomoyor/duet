<script setup lang="ts">
/**
 * 顶栏：品牌 + 两个页面级入口
 *
 * M7 大幅瘦身（用户实测反馈"顶栏挤了一排图标，分不清哪个是哪个"）：
 *   移除 —— 撤回/重做（改由 Ctrl+Z / Ctrl+Shift+Z，见 useGlobalShortcuts）
 *          保存状态、属性、进入演示视图、导入、导出
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
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { APP } from '@/app.config'

const { t } = useI18n()
const route = useRoute()
const project = useProjectStore()
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

/** 是否处于演示视图（由当前项目的视图态决定） */
const isPresent = computed(() => project.current?.ui.mode === 'present')

function togglePresent(): void {
  if (!project.current) return
  project.setMode(isPresent.value ? 'edit' : 'present')
}
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
        <!--
          版本号紧跟在 DUET 后面，小字、**不加气泡边框**（v0.5.0 按实测反馈）。
          此前它固定在左下角，与侧栏底部的统计挤在一起；
          而"这是哪个版本"本来就是品牌名的一种读法：对奏 Duet v0.5.0。
        -->
        <span class="topbar__brand-version" data-testid="app-version">v{{ APP.version }}</span>
      </RouterLink>
    </div>

    <nav class="topbar__group topbar__group--end" :aria-label="t('nav.pages')">
      <button
        v-if="project.current?.sheet.layout.presentation?.enabled"
        class="topbar__action"
        type="button"
        :aria-pressed="ui.studioProjects"
        @click="ui.studioProjects = !ui.studioProjects"
      >
        {{ t('studio.projectList') }}
      </button>
      <RouterLink
        class="topbar__nav"
        :to="{ name: 'showcase' }"
        :aria-label="t('showcase.entry')"
        :title="t('showcase.entry')"
        ><AppIcon name="palette" :size="17"
      /></RouterLink>
      <RouterLink
        class="topbar__nav"
        :class="{ 'u-selected': activePage === 'compare' }"
        :to="{ name: 'compare' }"
        data-testid="nav-compare-page"
        :title="t('nav.compare')"
        :aria-label="t('nav.compare')"
      >
        <!--
          「对比」用 VS. 文字标记（用户要求），见下方 .topbar__vs 的说明。
          挂上 u-selected-icon 才能跟随 `.u-selected` 变成主题色——
          这个类原本只认 AppIcon，纯文字的元素得自己声明（用户实测反馈
          "VS. 图标被选中后没有变成和齿轮一样的着色效果"）。
        -->
        <span class="topbar__vs u-selected-icon" aria-hidden="true">VS.</span>
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

      <!--
        「演示」按钮（v0.4.0 从对比页工具条搬到这里，用户要求"和演示模式里的
        「编辑」按钮相呼应"）。两个按钮的位置对称：进入演示在应用顶栏最右，
        退出演示在演示视图顶栏最右。
        它**带文字**，与那三个纯图标入口刻意区分：这是一个动作，
        不是"我在哪一页"的状态。没有打开项目时禁用。
      -->
      <button
        v-if="!project.current?.sheet.layout.presentation?.enabled"
        class="topbar__action"
        type="button"
        :disabled="!project.hasProject"
        :title="`${isPresent ? t('present.exit') : t('present.enter')} (Ctrl+E)`"
        :aria-label="isPresent ? t('present.exit') : t('present.enter')"
        :aria-pressed="isPresent"
        data-testid="toggle-present"
        @click="togglePresent"
      >
        <AppIcon :name="isPresent ? 'toEdit' : 'present'" :size="16" />
        <span>{{ isPresent ? t('common.edit') : t('compare.present') }}</span>
      </button>
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
 * 版本号：紧跟品牌名之后的小字，**没有边框也没有底色**。
 * 用等宽字体与最弱一级的文字色，读得到但不抢戏。
 */
.topbar__brand-version {
  margin-left: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-disabled);
  letter-spacing: 0.04em;
}

/*
 * 「对比」入口用 **VS. 文字**而不是图标（用户明确要求）。
 *
 * 图标库里没有"VS."这种东西，而"两把剑"表达的是对抗、不是并列对比。
 * 直接排两个字反而最准确：它就是这一页在做的事。
 * 字号略小、加粗、收紧字距，让它在 36px 的方框里看起来像一个标记而不是一段文字。
 */
.topbar__vs {
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
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

/*
 * 「演示」按钮：带文字的动作按钮。
 * 与左边三个纯图标入口刻意做出区别——那边是"我在哪一页"，这边是"做一件事"。
 */
.topbar__action {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  height: 32px;
  padding: 0 var(--sp-3);
  margin-left: var(--sp-1);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.topbar__action:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.topbar__action:disabled {
  color: var(--text-disabled);
  opacity: 0.6;
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
