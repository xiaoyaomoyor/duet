<script setup lang="ts">
/**
 * 展示视图（Present）
 *
 * 三条硬性要求（§9.2）：
 *   1. **绝对只读**：不存在任何可输入元素，误触不改数据
 *   2. **动效全开**：供对外演示与录制对比视频
 *   3. 退出路径清晰：Esc / 工具栏按钮 / 缩放 / 全屏
 *
 * 实现取舍：用 `position: fixed` 的独立遮罩层，而不是把编辑视图"变灰"。
 * 这样能保证只读性由结构保证，而不是靠逐个禁用交互来维持。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import CompareCanvas from '@/components/compare/CompareCanvas.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { isPresentable } from '@/modules/visibility'
import type { Project } from '@/types/project'

const props = defineProps<{ project: Project }>()

const emit = defineEmits<{ exit: [] }>()

const { t } = useI18n()
const store = useProjectStore()

const zoom = ref(1)
const toolbarVisible = ref(true)
const isFullscreen = ref(false)
const container = ref<HTMLElement | null>(null)

/** 是否有可展示的内容（决定显示画布还是空状态引导） */
const hasContent = computed(() =>
  props.project.sheet.rows.some((row) =>
    props.project.sheet.sides.some((side) =>
      (row.cells[side.id]?.modules ?? []).some((module) => isPresentable(module)),
    ),
  ),
)

/** 两侧的强调色（用于中轴光带与工具栏点缀） */
const sideColors = computed(() => [
  props.project.sheet.sides[0]?.accent ?? 'var(--side-a)',
  props.project.sheet.sides[1]?.accent ?? 'var(--side-b)',
])

const rootStyle = computed(() => ({
  '--side-a': sideColors.value[0],
  '--side-b': sideColors.value[1],
  '--present-zoom': String(zoom.value),
  '--canvas-max': `${props.project.sheet.layout.maxWidth}px`,
}))

const showAxis = computed(() => props.project.sheet.layout.showAxis)

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

/** 鼠标移到顶部才显示工具栏，3 秒后自动淡出（录屏时不出鼠标） */
let hideTimer: ReturnType<typeof setTimeout> | null = null

function revealToolbar(): void {
  toolbarVisible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    toolbarVisible.value = false
  }, 3000)
}

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
  revealToolbar()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (hideTimer) clearTimeout(hideTimer)
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
      @mousemove.passive="revealToolbar"
    >
      <!-- 悬浮工具栏：仅展示用，导出长图时必须排除 -->
      <header
        class="present__bar no-export"
        :class="{ 'present__bar--hidden': !toolbarVisible }"
      >
        <button class="present__btn" type="button" @click="exit">
          <AppIcon name="chevron-left" :size="15" />
          {{ t('nav.switchToEdit') }}
        </button>

        <span class="present__title u-truncate">{{ project.title }}</span>

        <div class="present__group">
          <button
            class="present__icon"
            type="button"
            :title="t('present.zoomOut')"
            :aria-label="t('present.zoomOut')"
            @click="setZoom(zoom - 0.1)"
          >
            <AppIcon name="close" :size="14" />
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
            <AppIcon name="plus" :size="14" />
          </button>
        </div>

        <button
          class="present__icon"
          type="button"
          :title="t('present.fullscreen')"
          :aria-label="t('present.fullscreen')"
          :aria-pressed="isFullscreen"
          @click="toggleFullscreen"
        >
          <AppIcon name="present" :size="15" />
        </button>
      </header>

      <!-- 画布（只读） -->
      <div class="present__scroll u-scroll-y">
        <div v-if="showAxis" class="present__axis" aria-hidden="true" />

        <div class="present__stage" data-present-root>
          <CompareCanvas v-if="hasContent" :project="project" readonly />
          <div v-else class="present__empty">
            <AppIcon name="comment" :size="22" />
            <p class="present__empty-title">{{ t('compare.nothingToPresent') }}</p>
            <p class="present__empty-hint">{{ t('compare.nothingToPresentHint') }}</p>
            <button class="present__btn present__btn--primary" type="button" @click="exit">
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

.present__bar--hidden {
  opacity: 0;
  pointer-events: none;
}

.present__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: center;
}

.present__group {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-full);
}

.present__btn {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
}

.present__btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.present__btn--primary {
  color: var(--accent-fg);
  background: var(--accent-600);
  border-color: var(--accent-600);
}

.present__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
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

.present__scroll {
  position: relative;
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

.present__hotkeys {
  position: fixed;
  bottom: var(--sp-4);
  left: 50%;
  font-size: 10px;
  color: var(--text-disabled);
  transform: translateX(-50%);
  opacity: 0.7;
  transition: opacity var(--dur-slow) var(--ease-out);
}

.present__bar--hidden ~ .present__hotkeys {
  opacity: 0;
}
</style>
