<script setup lang="ts">
/**
 * 对比界面（核心视图）
 *
 * 职责：
 *   1. 路由 `#/p/:projectId` → 打开对应项目
 *   2. 没有项目时展示模板画廊（空状态引导）
 *   3. 有项目时渲染「工具条 + 画布 + 对比配置」三件套
 *
 * M8 布局调整：**对比配置面板从 AppShell 搬到了这里**。
 *   它配置的是这一份对比页内部的东西，所以展开区域应该从工具条下面开始，
 *   而不是像左侧项目列表那样占满整个外壳高度——否则标签栏与工具条会被
 *   一个"页面内部的配置"截断，看上去像换了一整页。
 *   宽度也像侧栏一样可在分界处拖动调节，松手才落盘。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import TemplateGallery from '@/components/compare/TemplateGallery.vue'
import CompareCanvas from '@/components/compare/CompareCanvas.vue'
import CompareToolbar from '@/components/compare/CompareToolbar.vue'
import InspectorPanel from '@/components/editor/InspectorPanel.vue'
import PresentOverlay from '@/components/present/PresentOverlay.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { APP } from '@/app.config'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const projects = useProjectsStore()
const ui = useUiStore()
const settings = useSettingsStore()

const loading = ref(false)

/** 是否处于演示视图（编辑树在此时不渲染） */
const isPresent = computed(() => store.current?.ui.mode === 'present')

/** 对比配置只在编辑态出现：演示视图里它没有意义，还占地方 */
const showConfig = computed(() => ui.inspectorOpen && !isPresent.value)

const configStyle = computed(() => ({ '--config-width': `${ui.inspectorWidth}px` }))

const layout = computed(() => store.current?.sheet.layout)

/**
 * 整页壁纸（v0.5.5）。
 *
 * "填充形式 = 充满整页"时，背景由**滚动容器**自己画，并且用
 * `background-attachment: fixed` —— 这样它像壁纸一样钉在视口上、不随内容滚动，
 * 而且因为容器本来就在顶栏与侧栏**之内**，天然不会盖住它们（用户要求：
 * "不会遮挡顶栏等内容，只是壁纸"）。
 *
 * 编辑视图同样生效（用户要求："在编辑视图中也能看到作为壁纸的效果"）——
 * 早先只有演示遮罩层画这一层，编辑时看不到，等于这个选项在编辑期是隐形的。
 */
const pageFill = computed(() => layout.value?.backgroundFill === 'page')

const stageStyle = computed(() => {
  const current = layout.value
  if (!pageFill.value || !current) return undefined
  const scale = Number.isFinite(current.backgroundScale)
    ? Math.min(96, Math.max(8, current.backgroundScale as number))
    : 32
  return {
    '--bg-scale': `${scale}px`,
    '--bg-tint': current.backgroundTint ?? '',
    // 底色是图案的**底**：background-color 天然画在 background-image 之下
    '--page-fill': current.backgroundBase ?? '',
  }
})
// ——————————————————————————————————————————————————————————
// 对比配置面板：拖拽调宽（与左侧项目列表同一套做法）
// ——————————————————————————————————————————————————————————

// 设置加载完成后把持久化的宽度同步进来，否则用户上次调好的宽度会在
// 开始拖拽的一瞬间跳回默认值
watch(
  () => settings.settings.inspectorWidth,
  (width) => {
    if (!ui.inspectorDragging) ui.setInspectorWidth(width ?? APP.inspector.defaultWidth)
  },
  { immediate: true },
)

let dragStartX = 0
let dragStartWidth = 0

function onConfigResizeStart(event: PointerEvent): void {
  dragStartX = event.clientX
  dragStartWidth = ui.inspectorWidth
  ui.inspectorDragging = true
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onConfigResizeMove(event: PointerEvent): void {
  if (!ui.inspectorDragging) return
  // 向右拖 = 面板变窄，所以是减号
  ui.setInspectorWidth(dragStartWidth - (event.clientX - dragStartX))
  event.preventDefault()
}

function onConfigResizeEnd(event: PointerEvent): void {
  if (!ui.inspectorDragging) return
  ui.inspectorDragging = false
  ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  void settings.patch({ inspectorWidth: ui.inspectorWidth })
}

function resetConfigWidth(): void {
  ui.setInspectorWidth(APP.inspector.defaultWidth)
  void settings.patch({ inspectorWidth: ui.inspectorWidth })
}

function onConfigResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 40 : 16
  if (event.key === 'ArrowLeft') ui.setInspectorWidth(ui.inspectorWidth + step)
  else if (event.key === 'ArrowRight') ui.setInspectorWidth(ui.inspectorWidth - step)
  else return

  event.preventDefault()
  void settings.patch({ inspectorWidth: ui.inspectorWidth })
}

onBeforeUnmount(() => {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})

onMounted(() => void 0)

const routeProjectId = computed(() => {
  const raw = route.params.projectId
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
})

/** 路由 → 打开项目 */
watch(
  routeProjectId,
  async (id) => {
    if (!id || store.current?.id === id) return

    loading.value = true
    const result = await store.open(id)
    loading.value = false

    if (!result.ok) {
      ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
      await router.replace({ name: 'compare' })
    }
  },
  { immediate: true },
)

/** 打开项目后同步 URL（从空状态进入项目，或关闭标签页回到空状态） */
watch(
  () => store.current?.id,
  (id) => {
    if (id && routeProjectId.value !== id) {
      void router.replace({ name: 'project', params: { projectId: id } })
    } else if (!id && routeProjectId.value) {
      void router.replace({ name: 'compare' })
    }
  },
)

// 首次进入时确保项目列表已加载（侧栏与画廊都依赖它）
if (projects.items.length === 0 && !projects.loading) {
  void projects.load()
}

/** 演示视图退出（PresentOverlay 已经写过 mode，这里只做 UI 收尾） */
function onPresentExit(): void {
  ui.inspectorOpen = false
}
</script>

<template>
  <div class="compare" :class="{ 'compare--fill': store.current !== null }" :style="configStyle">
    <div v-if="loading" class="compare__loading">{{ t('common.loading') }}</div>

    <template v-else-if="store.current">
      <!--
        对比页工具条：保存状态 / 切视图 / 对比配置 / 导入 / 导出。
        它是**对比页的第一行**，因此放在这里而不是 AppShell —— 空状态
        （还没打开任何项目）下这一行整个不该存在，而空状态是这个视图的分支。
        对比配置面板从它的**下面**开始展开，因此这一行始终是通栏的。
      -->
      <CompareToolbar />

      <div class="compare__main">
        <!--
          编辑态才渲染主区画布。

          M7 之前两种视图态都渲染：展示态下这里也挂着画布，同时
          PresentOverlay 里还有一份只读画布，于是**同一个项目同时存在两套画布**。
          在同步播放上这不是"多花点性能"，而是真的坏掉：
            1. AudioRenderer 按 sideId 向全局时钟登记音轨，两套画布的同名音轨
               会互相覆盖；展示态一挂载，编辑态那几个 element 的 loadedmetadata
               还没到，登记表就被清空，控制栏随即退化成"两侧都需要有音频"。
            2. SyncPlayerBar 的两份实例会互相 attach / detach 同一个同步引擎。
          展示态本来就被遮罩层完全盖住，把那块画布去掉既修掉了上面的问题，
          也顺带省掉一半的渲染与内存。
        -->
        <div
          class="compare__stage u-scroll-y"
          :class="pageFill ? `compare__stage--bg-${layout?.background}` : undefined"
          :style="stageStyle"
        >
          <CompareCanvas v-if="!isPresent" :project="store.current" />
        </div>

        <!--
          对比配置面板：只在编辑态出现（演示视图里它没有意义，还占地方）。
          分界处可拖拽调宽，双击恢复默认，方向键微调——与左侧项目列表同一套操作。
        -->
        <template v-if="showConfig">
          <div
            class="compare__config-resizer u-split u-split--v"
            role="separator"
            aria-orientation="vertical"
            :aria-label="t('inspector.resize')"
            :aria-valuenow="ui.inspectorWidth"
            :aria-valuemin="APP.inspector.min"
            :aria-valuemax="APP.inspector.max"
            tabindex="0"
            @pointerdown="onConfigResizeStart"
            @pointermove="onConfigResizeMove"
            @pointerup="onConfigResizeEnd"
            @pointercancel="onConfigResizeEnd"
            @dblclick="resetConfigWidth"
            @keydown="onConfigResizeKeydown"
          />
          <InspectorPanel />
        </template>
      </div>
    </template>

    <TemplateGallery v-else />
  </div>

  <!-- 演示视图：独立遮罩层（§9.2） -->
  <PresentOverlay
    v-if="store.current && isPresent"
    :project="store.current"
    @exit="onPresentExit"
  />
</template>

<style scoped>
.compare {
  min-height: 100%;
}

/*
 * 有项目时占满可用高度，并把自己切成「工具条 / 主体」两行。
 * 没有项目时保持普通流式布局，让模板画廊走外壳的滚动。
 *
 * position: relative 是给分界条定位用的：它必须相对**这个容器**定位，
 * 而不是相对整个外壳——否则分界条会从顶栏底下就开始，
 * 横跨标签栏与工具条，看上去像在切分整页。
 */
.compare--fill {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.compare__main {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 画布区自己滚动：面板与它并排，各自滚各自的 */
.compare__stage {
  flex: 1;
  min-width: 0;
}

/*
 * 只有"充满整页"时才会带上这几个类（见模板）。
 * "仅内容区"时图案仍由画布自己画——只铺在内容那一段，不到页面底部。
 */
.compare__stage--bg-grid,
.compare__stage--bg-dots,
.compare__stage--bg-solid {
  background-color: var(--page-fill, transparent);
  /*
   * `background-attachment: fixed` 是关键：它让背景相对**视口**绘制，
   * 于是内容滚动时图案不动——这正是"壁纸"该有的样子。
   * 而容器本身在顶栏与侧栏之内，所以图案不会盖到那两块上面去
   * （用户要求："不会遮挡顶栏等内容，只是壁纸"）。
   *
   * 底色与图案同处一层：`background-color` 天然画在 `background-image` 之下，
   * 所以"底色是图案的背景、不会挡住图案"是免费的。
   */
  background-attachment: fixed;
}

.compare__stage--bg-grid {
  background-image:
    linear-gradient(to right, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px),
    linear-gradient(to bottom, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px);
  background-size: var(--bg-scale, 32px) var(--bg-scale, 32px);
}

.compare__stage--bg-dots {
  background-image: radial-gradient(var(--bg-tint, var(--border-default)) 1px, transparent 1px);
  background-size: var(--bg-scale, 20px) var(--bg-scale, 20px);
}

/*
 * 分界条绝对定位在面板左侧、不占 flex 空间：
 * 这样面板宽度只需要由 --config-width 一个变量管（变量挂在 .compare 上，
 * 因此这里读得到；挂在面板自己身上时兄弟节点是读不到的）。
 */
.compare__config-resizer {
  position: absolute;
  top: 0;
  right: calc(var(--config-width, 280px) - 6px);
  bottom: 0;
  z-index: var(--z-sticky);
}

.compare__loading {
  padding: var(--sp-12);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
