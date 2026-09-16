<script setup lang="ts">
/**
 * 工具卡片编辑弹窗
 *
 * 卡片本身在编辑视图里"就是最终效果"，所有调整都在这里：
 *   ① 从工具库选择工具（M6 之前这个能力根本不存在，见 ToolPicker 的说明）
 *   ② 名称与版本（名称可覆盖工具原名，如「可灵 · 1.6 大师版」）
 *   ③ 备注
 *   ④ 替换图标（存为本侧专属的资源，不污染工具库）
 *   ⑤ 图标 / 名称 / 版本 / 备注 各自是否显示
 *   ⑥ 名称 / 版本的字号（M7 新增：工具名长度差异极大，
 *      "MJ" 和"可灵 · 1.6 大师版"用同一个字号必然有一边不合适）
 *
 * 与模块编辑弹窗一致：改动即时保存，底部只有"完成"。
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import ToolPicker from './ToolPicker.vue'
import { useToolsStore } from '@/stores/useToolsStore'
import { clampScale, SCALE_MAX, SCALE_MIN, SCALE_STEP } from './sideScale'
import type { Side, ToolRef } from '@/types/project'

const props = defineProps<{
  open: boolean
  side: Side
  /** 当前显示用的名称（可能是 labelOverride） */
  displayName: string
}>()

const emit = defineEmits<{
  close: []
  /** 写入侧字段（走项目的命令层） */
  patch: [patch: Record<string, unknown>]
}>()

const { t } = useI18n()
const tools = useToolsStore()

const tool = computed(() => tools.resolve(props.side.toolRef))

/** 开关类字段：省略 = 显示，只有显式 false 才隐藏 */
const toggles = computed(() => [
  { key: 'showIcon' as const, labelKey: 'compare.showIcon', value: props.side.showIcon !== false },
  { key: 'showName' as const, labelKey: 'compare.showName', value: props.side.showName !== false },
  {
    key: 'showVersion' as const,
    labelKey: 'compare.showVersion',
    value: props.side.showVersion !== false,
  },
  { key: 'showNote' as const, labelKey: 'compare.showNote', value: props.side.showNote !== false },
])

/** 匿名开关：省略 = 不匿名（与上面那组相反，因为"默认遮住"没有道理） */
const anonymizeToggles = computed(() => [
  {
    key: 'anonymizeName' as const,
    labelKey: 'compare.anonymizeName',
    value: props.side.anonymizeName === true,
  },
  {
    key: 'anonymizeVersion' as const,
    labelKey: 'compare.anonymizeVersion',
    value: props.side.anonymizeVersion === true,
  },
  {
    key: 'anonymizeIcon' as const,
    labelKey: 'compare.anonymizeIcon',
    value: props.side.anonymizeIcon === true,
  },
])

function onSelectTool(toolRef: ToolRef): void {
  // 换工具时清掉名称覆盖：否则会留下上一个工具的名字，很困惑
  emit('patch', { toolRef, labelOverride: undefined })
}

/** 名称输入用 change 而不是 input：避免每敲一个字都进撤销栈 */
function onNameChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim()
  emit('patch', { labelOverride: value && value !== tool.value.name ? value : undefined })
}

function onVersionChange(event: Event): void {
  emit('patch', { modelVersion: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onNoteChange(event: Event): void {
  emit('patch', { note: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onToggle(key: string, value: boolean): void {
  emit('patch', { [key]: value })
}

/** 名称 / 版本的字号倍率（1 = 默认；越界一律夹回区间） */
const nameScale = computed(() => clampScale(props.side.nameScale ?? 1))
const versionScale = computed(() => clampScale(props.side.versionScale ?? 1))

/**
 * 滑块拖动写回。
 *
 * 用 input 而不是 change：字号是**所见即所得**的参数，
 * 必须一边拖一边看卡片上的字变大变小，松手才生效等于盲拖。
 * 撤销栈不会因此爆掉——setSideField 带了 coalesceKey，
 * 同一侧的连续改动会在时间窗内合并成一步。
 */
function onScale(key: 'nameScale' | 'versionScale', event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  emit('patch', { [key]: clampScale(raw) })
}

function resetScale(key: 'nameScale' | 'versionScale'): void {
  emit('patch', { [key]: undefined })
}

/*
 * Esc 监听在 window 上而不是弹窗元素上：
 * 挂在元素上要求"焦点恰好在弹窗内"，自动聚焦一旦失败 Esc 就失效，
 * 模态遮罩会留在页面上拦截所有后续点击（这个坑在模块编辑弹窗里已经踩过）。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" role="presentation" @click.self="emit('close')">
      <div
        class="side-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('compare.editSide', { name: displayName })"
        :style="{ '--accent': side.accent }"
        tabindex="-1"
      >
        <header class="side-dialog__head">
          <AppIcon name="options" :size="16" class="side-dialog__icon" />
          <h2 class="side-dialog__title">{{ t('compare.editSide', { name: displayName }) }}</h2>
          <button
            class="side-dialog__close"
            type="button"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="15" />
          </button>
        </header>

        <div class="side-dialog__body">
          <section class="section">
            <h3 class="section__title">{{ t('compare.changeTool') }}</h3>
            <ToolPicker :current="side.toolRef" @select="onSelectTool" />
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.textFields') }}</h3>

            <label class="field">
              <span class="field__label">{{ t('compare.name') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.labelOverride ?? tool.name"
                :placeholder="tool.name"
                @change="onNameChange"
              />
            </label>

            <!-- 字号：紧跟在它要调的那个字段下面，而不是另起一节 -->
            <div class="scale">
              <span class="scale__label">{{ t('compare.nameSize') }}</span>
              <input
                class="scale__range"
                type="range"
                :min="SCALE_MIN"
                :max="SCALE_MAX"
                :step="SCALE_STEP"
                :value="nameScale"
                :aria-label="t('compare.nameSize')"
                @input="onScale('nameScale', $event)"
              />
              <span class="scale__value">{{ Math.round(nameScale * 100) }}%</span>
              <button
                class="scale__reset"
                type="button"
                :title="t('common.reset')"
                :aria-label="t('common.reset')"
                :disabled="side.nameScale === undefined"
                @click="resetScale('nameScale')"
              >
                <AppIcon name="undo" :size="12" />
              </button>
            </div>

            <label class="field">
              <span class="field__label">{{ t('compare.version') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.modelVersion ?? ''"
                :placeholder="t('compare.versionPlaceholder')"
                @change="onVersionChange"
              />
            </label>

            <div class="scale">
              <span class="scale__label">{{ t('compare.versionSize') }}</span>
              <input
                class="scale__range"
                type="range"
                :min="SCALE_MIN"
                :max="SCALE_MAX"
                :step="SCALE_STEP"
                :value="versionScale"
                :aria-label="t('compare.versionSize')"
                @input="onScale('versionScale', $event)"
              />
              <span class="scale__value">{{ Math.round(versionScale * 100) }}%</span>
              <button
                class="scale__reset"
                type="button"
                :title="t('common.reset')"
                :aria-label="t('common.reset')"
                :disabled="side.versionScale === undefined"
                @click="resetScale('versionScale')"
              >
                <AppIcon name="undo" :size="12" />
              </button>
            </div>

            <label class="field">
              <span class="field__label">{{ t('compare.note') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.note ?? ''"
                :placeholder="t('compare.notePlaceholder')"
                @change="onNoteChange"
              />
            </label>
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.icon') }}</h3>
            <p class="section__hint">{{ t('compare.iconHint') }}</p>
            <MediaPicker
              accept="image"
              :asset-id="side.iconAssetId"
              :name="displayName"
              :preview-height="72"
              @select="(payload) => emit('patch', { iconAssetId: payload.assetId || undefined })"
              @clear="emit('patch', { iconAssetId: undefined })"
            />
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.visibleParts') }}</h3>
            <label v-for="item in toggles" :key="item.key" class="toggle">
              <input
                type="checkbox"
                :checked="item.value"
                @change="onToggle(item.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t(item.labelKey) }}</span>
            </label>
          </section>

          <!--
            匿名处理（v0.3.5）。
            与上面那组"显示内容"刻意分开成两节：语义不同——
            那边是"不显示"（信息消失），这边是"打码"（信息还在，只是被盖住）。
            混在一起用户会以为勾了就是不显示。
          -->
          <section class="section">
            <h3 class="section__title">{{ t('compare.anonymize') }}</h3>
            <p class="section__hint">{{ t('compare.anonymizeHint') }}</p>
            <label v-for="item in anonymizeToggles" :key="item.key" class="toggle">
              <input
                type="checkbox"
                :checked="item.value"
                @change="onToggle(item.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t(item.labelKey) }}</span>
            </label>
          </section>
        </div>

        <footer class="side-dialog__foot">
          <span class="side-dialog__note">{{ t('module.autosaveNote') }}</span>
          <button class="btn btn--primary" type="button" @click="emit('close')">
            {{ t('common.done') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6);
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
}

.side-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(780px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  animation: duet-pop-in var(--dur-base) var(--ease-spring) both;
}

.side-dialog__head {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--border-subtle);
}

.side-dialog__icon {
  color: var(--accent, var(--accent-500));
}

.side-dialog__title {
  flex: 1;
  overflow: hidden;
  font-size: var(--fs-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-dialog__close {
  flex: none;
  padding: var(--sp-1);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.side-dialog__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.side-dialog__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-5);
  overflow-y: auto;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.section__title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field__control {
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

/* —— 字号调节行：标签 · 滑块 · 百分比 · 复位 —— */
.scale {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.scale__label {
  flex: none;
  min-width: 60px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/*
 * 滑块：自己画轨道与滑块，**不用 accent-color**。
 *
 * 实测（Chromium，同一个页面上三种写法并排对比）：
 *   · 不设 accent-color        → 蓝色填充 + 浅灰轨道（蓝色和任何一套主题都不搭）
 *   · 只设 accent-color        → 紫色填充 + **近黑的轨道**（Chromium 把未填充那一段
 *                                画成了深色，在浅色主题下像一根黑色进度条）
 *   · appearance:none 自绘      → 浅灰轨道 + 主题色滑块（干净，且完全走 token）
 * 顺手排掉一个错误的猜想：给 input 设 `color` **完全不影响**轨道——
 * 设成红色后截图与原来逐字节相同。所以这里没有"改个颜色就好"的捷径。
 *
 * 代价：自绘之后没有"左半段已填充"的视觉，值只由右侧的百分比数字表达。
 * 这个交换是划算的——数字本来就在旁边，而一根黑色横条是实打实的观感问题。
 * WebKit 与 Firefox 各有一套伪元素，必须分别写。
 */
.scale__range {
  flex: 1;
  min-width: 0;
  height: 16px;
  cursor: pointer;
  appearance: none;
  background: transparent;
}

.scale__range::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--bg-active);
  border-radius: var(--radius-full);
}

.scale__range::-moz-range-track {
  height: 4px;
  background: var(--bg-active);
  border-radius: var(--radius-full);
}

.scale__range::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  /* (轨道 4px − 滑块 12px) / 2：让滑块压在轨道中心 */
  margin-top: -4px;
  appearance: none;
  background: var(--accent, var(--accent-500));
  border: none;
  border-radius: var(--radius-full);
}

.scale__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--accent, var(--accent-500));
  border: none;
  border-radius: var(--radius-full);
}

/* 百分比定宽等宽字体：拖动时数字位数变化不会把滑块挤来挤去 */
.scale__value {
  flex: none;
  width: 40px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: right;
}

.scale__reset {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.scale__reset:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.scale__reset:disabled {
  color: var(--text-disabled);
  opacity: 0.4;
}

.toggle {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.side-dialog__foot {
  display: flex;
  flex: none;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-5);
  border-top: 1px solid var(--border-subtle);
}

.side-dialog__note {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.btn {
  padding: var(--sp-2) var(--sp-5);
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}

.btn--primary {
  color: var(--accent-fg);
  background: var(--accent-solid);
  border: 1px solid var(--accent-solid);
}

.btn--primary:hover {
  background: var(--accent-solid-hover);
}
</style>
