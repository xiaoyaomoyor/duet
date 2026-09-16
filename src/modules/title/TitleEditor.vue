<script setup lang="ts">
/**
 * 「标题」模块的编辑器（v0.5.0）
 *
 * 内容与原「工具卡片编辑弹窗」完全一致，只是换了宿主：
 * 工具名卡片变成模块之后，编辑入口统一走模块卡片的编辑按钮，
 * 而模块编辑器有它自己的弹窗外壳（ModuleEditorDialog），
 * 所以这里只保留**表单本身**，不再自带遮罩与标题栏。
 *
 * 数据写在 `Side` 上（不是模块上）——见 ../title/data.ts 的说明。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import ToolPicker from '@/components/compare/ToolPicker.vue'
import { clampScale, SCALE_MAX, SCALE_MIN, SCALE_STEP } from '@/components/compare/sideScale'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToolsStore } from '@/stores/useToolsStore'
import type { ModuleEditorProps } from '../types'
import type { Side, ToolRef } from '@/types/project'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const tools = useToolsStore()
const store = useProjectStore()

const side = computed<Side | undefined>(() =>
  store.current?.sheet.sides.find((item) => item.id === props.sideId),
)

const tool = computed(() => tools.resolve(side.value?.toolRef ?? { kind: 'inline', name: '' }))

const displayName = computed(() => side.value?.labelOverride ?? tool.value.name)

/** 写入侧字段（走项目的命令层，因此进撤销栈并触发自动保存） */
function patch(fields: Record<string, unknown>): void {
  const target = side.value
  if (!target) return
  store.setSideField(target.id, fields)
}

/** 开关类字段：省略 = 显示，只有显式 false 才隐藏 */
const toggles = computed(() => {
  const current = side.value
  return [
    { key: 'showIcon' as const, labelKey: 'compare.showIcon', value: current?.showIcon !== false },
    { key: 'showName' as const, labelKey: 'compare.showName', value: current?.showName !== false },
    {
      key: 'showVersion' as const,
      labelKey: 'compare.showVersion',
      value: current?.showVersion !== false,
    },
    { key: 'showNote' as const, labelKey: 'compare.showNote', value: current?.showNote !== false },
  ]
})

/** 匿名开关：省略 = 不匿名（与上面那组相反，因为"默认遮住"没有道理） */
const anonymizeToggles = computed(() => {
  const current = side.value
  return [
    {
      key: 'anonymizeName' as const,
      labelKey: 'compare.anonymizeName',
      value: current?.anonymizeName === true,
    },
    {
      key: 'anonymizeVersion' as const,
      labelKey: 'compare.anonymizeVersion',
      value: current?.anonymizeVersion === true,
    },
    {
      key: 'anonymizeIcon' as const,
      labelKey: 'compare.anonymizeIcon',
      value: current?.anonymizeIcon === true,
    },
  ]
})

function onSelectTool(toolRef: ToolRef): void {
  // 换工具时清掉名称覆盖：否则会留下上一个工具的名字，很困惑
  patch({ toolRef, labelOverride: undefined })
}

/** 名称输入用 change 而不是 input：避免每敲一个字都进撤销栈 */
function onNameChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim()
  patch({ labelOverride: value && value !== tool.value.name ? value : undefined })
}

function onVersionChange(event: Event): void {
  patch({ modelVersion: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onNoteChange(event: Event): void {
  patch({ note: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onToggle(key: string, value: boolean): void {
  patch({ [key]: value })
}

/** 名称 / 版本的字号倍率（1 = 默认；越界一律夹回区间） */
const nameScale = computed(() => clampScale(side.value?.nameScale ?? 1))
const versionScale = computed(() => clampScale(side.value?.versionScale ?? 1))

/**
 * 滑块拖动写回。
 *
 * 用 input 而不是 change：字号是**所见即所得**的参数，
 * 必须一边拖一边看卡片上的字变大变小，松手才生效等于盲拖。
 * 撤销栈不会因此爆掉——setSideField 带了 coalesceKey，
 * 同一侧的连续改动会在时间窗内合并成一步。
 */
function onScale(key: 'nameScale' | 'versionScale', event: Event): void {
  patch({ [key]: clampScale(Number((event.target as HTMLInputElement).value)) })
}

function resetScale(key: 'nameScale' | 'versionScale'): void {
  patch({ [key]: undefined })
}
</script>

<template>
  <div v-if="side" class="side-fields" :style="{ '--accent': side.accent }">
    <!--
      双列布局（v0.4.5 按实测反馈"编辑工具名称卡片的窗口也改为紧凑的双列布局"）。
      左列是工具列表（它需要一个能滚动的列表高度），
      右列是名称 / 字号 / 备注 / 图标 / 显示开关 / 匿名——
      这些全是单行小控件，各占一整屏只会把容器拉得很长。
    -->
    <section class="section section--tools">
      <h3 class="section__title">{{ t('compare.changeTool') }}</h3>
      <ToolPicker :current="side.toolRef" @select="onSelectTool" />
    </section>

    <div class="section section--fields">
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

      <section class="section">
        <h3 class="section__title">{{ t('compare.icon') }}</h3>
        <p class="section__hint">{{ t('compare.iconHint') }}</p>
        <MediaPicker
          accept="image"
          :asset-id="side.iconAssetId"
          :name="displayName"
          :preview-height="72"
          @select="(payload) => patch({ iconAssetId: payload.assetId || undefined })"
          @clear="patch({ iconAssetId: undefined })"
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
        匿名处理。
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
  </div>
</template>

<style scoped>
.side-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: var(--sp-5);
}

/* 窄屏退回单列：两列都会挤成窄缝，反而更难用 */
@media (max-width: 760px) {
  .side-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

.section--tools,
.section--fields {
  min-width: 0;
}

.section--fields {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.section__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.section__hint {
  font-size: var(--fs-xs);
  line-height: var(--lh-normal);
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field__label {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.field__control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.field__control:focus {
  border-color: var(--accent-500);
  outline: none;
}

.scale {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.scale__label {
  flex: none;
  width: 56px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.scale__range {
  flex: 1;
  min-width: 0;
  height: 16px;
  appearance: none;
  background: transparent;
}

.scale__range::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-full);
}

.scale__range::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  appearance: none;
  background: var(--accent-500);
  border-radius: var(--radius-full);
}

.scale__range::-moz-range-track {
  height: 4px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-full);
}

.scale__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--accent-500);
  border: none;
  border-radius: var(--radius-full);
}

.scale__value {
  flex: none;
  width: 38px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: right;
}

.scale__reset {
  display: flex;
  flex: none;
  padding: 2px;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.scale__reset:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.scale__reset:disabled {
  opacity: 0.3;
}

.toggle {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
</style>
