<script setup lang="ts">
/**
 * 演示视图（Present）
 *
 * 三条硬性要求（§9.2）：
 *   1. **绝对只读**：不存在任何可输入元素，误触不改数据
 *   2. **动效全开**：供对外演示与录制对比视频
 *   3. 退出路径清晰：Esc / 工具栏按钮 / 缩放 / 全屏
 *
 * 实现取舍：用 `position: fixed` 的独立遮罩层，而不是把编辑视图"变灰"。
 * 这样能保证只读性由结构保证，而不是靠逐个禁用交互来维持。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import AppLogo from '@/components/common/AppLogo.vue'
import CompareCanvas from '@/components/compare/CompareCanvas.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { isPresentable } from '@/modules/visibility'
import { useResolvedTheme } from '@/composables/useResolvedTheme'
import { resolveAccent } from '@/data/accentPresets'
import { APP } from '@/app.config'
import type { Project } from '@/types/project'

const props = defineProps<{ project: Project }>()

const emit = defineEmits<{ exit: [] }>()

const { t } = useI18n()
const store = useProjectStore()

const zoom = ref(1)
const toolbarVisible = ref(true)
const isFullscreen = ref(false)
const container = ref<HTMLElement | null>(null)

/**
 * 是否有可展示的内容（决定显示画布还是空状态引导）。
 *
 * **不计「标题」模块**（v0.5.0）：它恒不为空（它显示的是"这一侧是谁"），
 * 如果把它算进来，那么"新建一份空白对比 → 进演示"就永远看不到
 * "还没有可展示的内容 → 返回编辑"这条引导了——而那一刻用户最需要的
 * 恰恰是这条引导，而不是两张写着"工具 A / 工具 B"的空卡片。
 *
 * 一旦真的填了内容，标题行自然一起出现（它就是普通的一行）。
 */
const hasContent = computed(() =>
  props.project.sheet.rows.some((row) =>
    props.project.sheet.sides.some((side) =>
      (row.cells[side.id]?.modules ?? []).some(
        (module) => module.type !== 'title' && isPresentable(module),
      ),
    ),
  ),
)

/** 两侧的强调色（用于中轴光带与工具栏点缀）；预设按当前主题解析 */
const accentTheme = useResolvedTheme()
const sideColors = computed(() => [
  resolveAccent(props.project.sheet.sides[0] ?? {}, accentTheme.value) || 'var(--side-a)',
  resolveAccent(props.project.sheet.sides[1] ?? {}, accentTheme.value) || 'var(--side-b)',
])

const rootStyle = computed(() => {
  const layout = props.project.sheet.layout
  const scale = Number.isFinite(layout.backgroundScale)
    ? Math.min(96, Math.max(8, layout.backgroundScale as number))
    : 32

  return {
    '--side-a': sideColors.value[0],
    '--side-b': sideColors.value[1],
    '--present-zoom': String(zoom.value),
    '--canvas-max': `${layout.maxWidth}px`,
    // 背景图案的变量在演示视图里也要有，否则"充满整页"铺不出来（见 pagePattern）
    '--bg-scale': `${scale}px`,
    '--bg-tint': layout.backgroundTint ?? '',
    '--bg-base': layout.backgroundBase ?? '',
  }
})

const showAxis = computed(() => props.project.sheet.layout.showAxis)

/**
 * 整页背景壁纸（v0.5.3 重做）。
 *
 * 规则（用户原话）："「充满整页」要作为对比页的背景，但不会遮挡顶栏等内容，
 * 只是壁纸"，而且**只要一种图案**。
 *
 * 因此：
 *   - 图案由**这一层**画；画布那边在"演示 + 充满整页"时不再画
 *     （见 CompareCanvas 的 drawPattern）——两边都画就是两张图案叠在一起；
 *   - 这一层固定定位、不跟随滚动：它是壁纸，不是贴在内容上的一张图；
 *   - 它从顶栏**下面**开始铺（`--present-topbar-h`），所以不会盖住顶栏。
 */
const pagePattern = computed(() => {
  const layout = props.project.sheet.layout
  if (layout.backgroundFill !== 'page') return false
  return layout.background === 'grid' || layout.background === 'dots'
})

/**
 * 背景图案是否要铺满**整个演示屏幕**（v0.5.0 引入，v0.5.3 去掉多余条件）。
 *
 * 只要求"填充形式 = 充满整页"。**不再要求** `backgroundInPresent`：
 * 那一项管的是"画布自己要不要画图案"（编辑期的对齐辅助），
 * 而"充满整页"本身选的就是"我要一张铺满整个演示页的背景"——
 * 两者叠加会让用户遇到"我明明选了充满整页却什么都没发生"。
 */
const patternClass = computed(() =>
  props.project.sheet.layout.background === 'dots' ? 'present__pattern--dots' : 'present__pattern--grid',
)

// ————————————————————————————————————————————————————————
// 交互
// ————————————————————————————————————————————————————————

function exit(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => void 0)
  store.setMode('edit')
  emit('exit')
}

function setZoom(next: number): void {
  zoom.value = Math.min(1.5, Math.max(0.5, Math.round(next * 100) / 100))
}

function resetZoom(): void {
  zoom.value = 1
}

async function toggleFullscreen(): Promise<void> {
  if (!container.value) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await container.value.requestFullscreen()
  } catch {
    // 某些环境（如 iframe 内）不允许全屏，忽略即可
  }
}

function onFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement !== null
}

/**
 * 工具栏的显隐（v0.4.5 改成按**鼠标位置**判断，不再按时间）。
 *
 *   普通演示态 → 常驻显示。
 *   全屏态     → 只有鼠标靠近屏幕**最上边**才显示，离开顶部立刻收起。
 *
 * 为什么把"3 秒后自动淡出"换掉（用户实测反馈）：
 *   按时间隐藏意味着"我正看着工具栏上的信息，它自己消失了"，
 *   想让它回来还得动一下鼠标。改成按位置之后规则是**可预期的**：
 *   鼠标在顶部就有工具栏，移开就没有，与停留多久无关。
 */
const TOOLBAR_HOT_ZONE = 72

function onPointerMove(event: MouseEvent): void {
  if (!isFullscreen.value) return
  toolbarVisible.value = event.clientY <= TOOLBAR_HOT_ZONE
}

watch(isFullscreen, (full) => {
  // 退出全屏 → 常驻；进入全屏 → 先收起，鼠标移到顶部再出现
  toolbarVisible.value = !full
})

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape':
      exit()
      break
    case 'f':
    case 'F':
      void toggleFullscreen()
      break
    case '0':
      resetZoom()
      break
    case '+':
    case '=':
      setZoom(zoom.value + 0.1)
      break
    case '-':
    case '_':
      setZoom(zoom.value - 0.1)
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  toolbarVisible.value = true
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})

/** 供父组件读取的当前缩放（导出时可能用到） */
defineExpose({ zoom, hasContent })
</script>

<template>
  <Teleport to="body">
    <div
      ref="container"
      class="present"
      role="region"
      :aria-label="t('compare.present')"
      :style="rootStyle"
      @mousemove.passive="onPointerMove"
    >
      <!--
        悬浮工具栏：仅展示用，导出长图时必须排除。
        结构（M8 按用户实测反馈重排）：
          左：对奏 LOGO + 名称（**去掉返回按钮**——退出走 Esc 或右侧的编辑按钮）
          右：缩放组（减 / 百分比 / 加）· 切换到编辑视图 · 全屏
      -->
      <header
        class="present__bar no-export"
        :class="{ 'present__bar--hidden': !toolbarVisible }"
      >
        <div class="present__brand">
          <AppLogo :size="20" />
          <span class="present__brand-zh">{{ t('app.name') }}</span>
          <span class="present__brand-en">{{ APP.nameEn }}</span>
        </div>

        <span class="present__title u-truncate">{{ project.title }}</span>

        <div class="present__group">
          <button
            class="present__icon"
            type="button"
            :title="t('present.zoomOut')"
            :aria-label="t('present.zoomOut')"
            @click="setZoom(zoom - 0.1)"
          >
            <!-- 缩小就该是一个减号；此前用了一个叉号，看着像"关闭" -->
            <AppIcon name="minus" :size="15" />
          </button>
          <button
            class="present__zoom"
            type="button"
            :title="t('present.resetZoom')"
            @click="resetZoom"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            class="present__icon"
            type="button"
            :title="t('present.zoomIn')"
            :aria-label="t('present.zoomIn')"
            @click="setZoom(zoom + 0.1)"
          >
            <AppIcon name="plus" :size="15" />
          </button>
        </div>

        <span class="present__divider" aria-hidden="true" />

        <button
          class="present__icon"
          type="button"
          :title="t('present.fullscreen')"
          :aria-label="t('present.fullscreen')"
          :aria-pressed="isFullscreen"
          @click="toggleFullscreen"
        >
          <!-- 全屏 / 退出全屏用两个图标，避免同一个图标表示相反动作 -->
          <AppIcon :name="isFullscreen ? 'minimize' : 'maximize'" :size="16" />
        </button>

        <!--
          「编辑视图」放在**最右**、并且带文字（用户要求）：
          它与应用顶栏最右的「演示」按钮位置对称、样式一致——
          进入与退出同一个模式的两个入口，长相和位置都该对得上。
        -->
        <button
          class="present__action"
          type="button"
          :title="t('nav.switchToEdit')"
          :aria-label="t('nav.switchToEdit')"
          data-testid="present-to-edit"
          @click="exit"
        >
          <AppIcon name="toEdit" :size="16" />
          <span>{{ t('common.edit') }}</span>
        </button>
      </header>

      <!--
        整屏背景图案（"充满整页"）。
        固定定位、不随内容滚动 —— 它铺的是**屏幕**，不是某一段内容。
      -->
      <div
        v-if="pagePattern"
        class="present__pattern"
        :class="patternClass"
        aria-hidden="true"
        data-testid="present-pattern"
      />

      <!-- 画布（只读） -->
      <div class="present__scroll u-scroll-y">
        <div v-if="showAxis" class="present__axis" aria-hidden="true" />

        <div class="present__stage" data-present-root>
          <CompareCanvas v-if="hasContent" :project="project" readonly />
          <div v-else class="present__empty">
            <AppIcon name="comment" :size="22" />
            <p class="present__empty-title">{{ t('compare.nothingToPresent') }}</p>
            <p class="present__empty-hint">{{ t('compare.nothingToPresentHint') }}</p>
            <button class="present__cta" type="button" @click="exit">
              {{ t('nav.switchToEdit') }}
            </button>
          </div>
        </div>
      </div>

      <p class="present__hotkeys no-export">{{ t('present.hotkeys') }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.present {
  position: fixed;
  inset: 0;
  z-index: var(--z-present);
  display: flex;
  flex-direction: column;
  background: var(--bg-void);
}

.present__bar {
  display: flex;
  flex: none;
  gap: var(--sp-3);
  align-items: center;
  height: var(--size-topbar);
  padding: 0 var(--sp-4);
  background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(8px);
  opacity: 1;
  transition: opacity var(--dur-slow) var(--ease-out);
}

/* 供整页背景壁纸定位用：它要从顶栏下面开始铺 */
.present {
  --present-topbar-h: var(--size-topbar);
}

.present__bar--hidden {
  opacity: 0;
  pointer-events: none;
}

.present__brand {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
}

.present__brand-zh {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.present__brand-en {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.present__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: center;
}

/* 缩放组与右侧两个动作之间的分隔线：避免"减号"和"编辑"看起来是一组 */
.present__divider {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 var(--sp-1);
  background: var(--border-default);
}

.present__group {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
  padding: 2px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-full);
}

/* 空状态里的主行动按钮：实心强调面 + 白字（走语义化 token，见 tokens.css） */
.present__cta {
  padding: var(--sp-2) var(--sp-5);
  font-size: var(--fs-sm);
  color: var(--accent-fg);
  background: var(--accent-solid);
  border: 1px solid var(--accent-solid);
  border-radius: var(--radius-full);
}

.present__cta:hover {
  background: var(--accent-solid-hover);
}

/*
 * 「编辑视图」：带文字的动作按钮，与顶栏那个「演示」按钮同一套长相。
 * 演示视图的工具栏本身就是半透明浮层，所以这个按钮只在被指到时才给底色，
 * 平时保持"安静"，免得在成稿上方一直亮着一块。
 */
.present__action {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  height: 28px;
  padding: 0 var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.present__action:hover {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.present__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-secondary);
  border-radius: var(--radius-full);
}

.present__icon:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.present__zoom {
  min-width: 46px;
  padding: 0 var(--sp-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

/*
 * 整屏背景图案（"充满整页"，v0.5.0）。
 *
 * 固定定位而不是给滚动容器加背景：滚动容器的背景默认跟着内容走
 * （background-attachment: local），那样看起来是"贴在内容上的一张壁纸"，
 * 而不是"整页铺满的底纹"。
 * z-index 压在内容之下、遮罩之上。
 */
.present__pattern {
  position: fixed;
  /*
   * 从顶栏**下面**开始铺（用户："不会遮挡顶栏等内容，只是壁纸"）。
   * inset: 0 会让图案一直铺到屏幕最上沿，从顶栏的透明缝隙里透出来，
   * 看起来像顶栏被"盖住"了。
   */
  inset: var(--present-topbar-h, 44px) 0 0 0;
  z-index: 0;
  pointer-events: none;
}

.present__pattern--grid {
  background-image:
    linear-gradient(to right, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px),
    linear-gradient(to bottom, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px);
  background-size: var(--bg-scale, 32px) var(--bg-scale, 32px);
}

.present__pattern--dots {
  background-image: radial-gradient(var(--bg-tint, var(--border-default)) 1px, transparent 1px);
  background-size: var(--bg-scale, 20px) var(--bg-scale, 20px);
}

.present__scroll {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
}

/* A2 中轴光带：视觉上把左右两方分开（§12.2） */
.present__axis {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  z-index: 0;
  width: 1px;
  overflow: hidden;
  background: var(--border-subtle);
}

.present__axis::after {
  display: block;
  width: 100%;
  height: 30%;
  content: '';
  background: var(--grad-axis);
  animation: duet-axis-scan 6s var(--ease-in-out) infinite;
}

.present__stage {
  position: relative;
  z-index: 1;
  /* 缩放只影响内容尺寸，不影响布局计算，因此用 zoom 而非 transform */
  zoom: var(--present-zoom, 1);
}

.present__empty {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: var(--text-muted);
}

.present__empty-title {
  font-size: var(--fs-lg);
  color: var(--text-secondary);
}

.present__empty-hint {
  font-size: var(--fs-sm);
}

/*
 * 快捷键提示（M9 按实测反馈挪到右下角）。
 *
 * 原先居中放在底部，正好压在成稿的下缘——而对比页往往是"上下两栏内容撑满"，
 * 居中的那一行会盖住内容。挪到右下角之后它与版本号同一侧、都在视觉死角里。
 *
 * 显隐跟随工具栏：工具栏收起时它也该收起（全屏演示时两样都不该出现）。
 */
.present__hotkeys {
  position: fixed;
  right: var(--sp-3);
  /* 让开右下角那枚版本徽标（它在演示视图里同样可见），两者上下叠放 */
  bottom: calc(var(--sp-2) + 16px);
  font-size: 10px;
  color: var(--text-disabled);
  text-align: right;
  opacity: 0.7;
  transition: opacity var(--dur-slow) var(--ease-out);
}

.present__bar--hidden ~ .present__hotkeys {
  opacity: 0;
}
</style>
