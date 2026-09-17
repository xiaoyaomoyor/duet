<script setup lang="ts">
/**
 * 对比配置面板（原「属性」）
 *
 * 定位（M8 按用户实测反馈调整）：
 *   它配置的是**这一份对比页内部**的东西（布局、配色、序号、背景、聚光灯），
 *   因此展开区域从对比页工具条**下面**开始，而不是像侧栏那样占满整个外壳高度。
 *   这样标签栏与工具条仍然是通栏的，不会被一个"页面内部的配置"截断。
 *   宽度也像左侧项目列表那样可以在分界处拖动调节。
 *
 * 面板内容分五组：
 *   布局   —— 中轴间距 / 最大宽度 / 密度 / 中轴光带
 *   配色   —— 左右两侧各自从预设里挑（不再需要去设置里选"默认配色"）
 *   序号   —— 行号与模块子序号
 *   背景   —— 图案 / 密度 / 颜色 / 填充形式 / 演示模式是否保留
 *   聚光灯 —— 只有一侧在播放时如何突出它
 *
 * 所有改动都经命令层写入 sheet.layout / sheet.sides，因此可撤销、会自动保存。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useResolvedTheme } from '@/composables/useResolvedTheme'
import { ACCENT_PRESETS, presetColor, resolveAccent } from '@/data/accentPresets'
import type { LayoutConfig, SideId } from '@/types/project'

const { t } = useI18n()
const store = useProjectStore()
const theme = useResolvedTheme()

const layout = computed<LayoutConfig | undefined>(() => store.current?.sheet.layout)
const sides = computed(() => store.current?.sheet.sides ?? [])

function patch(patchValue: Partial<LayoutConfig>): void {
  store.dispatch(
    { t: 'layout/patch', patch: patchValue },
    { label: '调整对比配置', coalesceKey: 'layout' },
  )
}

// ————————————————————————————————————————————————————————
// 数值项：滚轮微调 + 直接填写
// ————————————————————————————————————————————————————————

/**
 * 在滑块上滚动滚轮即可微调（用户要求）。
 *
 * `preventDefault` 是必须的：不拦的话页面会跟着一起滚，
 * 用户调完一个数就不知道滚到哪去了。
 * 步长用滑块自己的 step，`Shift` 加速 ×5——与项目里其他拖拽的约定一致。
 */
function onWheel(event: WheelEvent, key: 'gutter' | 'maxWidth' | 'backgroundScale', min: number, max: number, step: number): void {
  event.preventDefault()
  const current = Number(layout.value?.[key] ?? 0)
  const direction = event.deltaY > 0 ? -1 : 1
  const delta = direction * step * (event.shiftKey ? 5 : 1)
  patch({ [key]: clampNumber(String(current + delta), min, max, current) })
}

/**
 * 把手填的数值夹到合法区间。
 *
 * 三个兜底都不是多余的：用户可能清空输入框（NaN）、
 * 手打一个超范围的数、或者粘贴一段文本。夹取之后**回落到原值**，
 * 而不是给一个"看起来生效了"的错值。
 */
function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 背景图案的类型（含"无"） */
const backgrounds: Array<{ value: LayoutConfig['background']; labelKey: string }> = [
  { value: 'solid', labelKey: 'inspector.backgroundSolid' },
  { value: 'grid', labelKey: 'inspector.backgroundGrid' },
  { value: 'dots', labelKey: 'inspector.backgroundDots' },
]

const spotlights: Array<{ value: NonNullable<LayoutConfig['spotlight']>; labelKey: string }> = [
  { value: 'off', labelKey: 'inspector.spotlightOff' },
  { value: 'ratio', labelKey: 'inspector.spotlightRatio' },
  { value: 'dim', labelKey: 'inspector.spotlightDim' },
]

/** 每一侧当前生效的预设 id（没有预设时为空：那是用户自定义的颜色） */
function sidePreset(sideId: SideId): string {
  return sides.value.find((side) => side.id === sideId)?.accentPreset ?? ''
}

/** 预设色板里某个色块在当前主题下的样子（色板本身也要跟着主题深浅走） */
function swatchColor(presetId: string): string {
  return presetColor(presetId, theme.value) ?? 'var(--accent-500)'
}

/** 当前侧的颜色（用于"自定义色"那块的取色器初值） */
function sideColor(sideId: SideId): string {
  const side = sides.value.find((item) => item.id === sideId)
  return side ? resolveAccent(side, theme.value) || '#a78bfa' : '#a78bfa'
}

/**
 * 选中某个预设。
 *
 * 同时写 preset 与 hex：preset 是真源（按主题解析），
 * hex 是给不认预设的路径（导出预览、旧代码）留一个始终可用的具体值。
 */
function pickPreset(sideId: SideId, presetId: string): void {
  store.setSideField(sideId, {
    accentPreset: presetId,
    accent: presetColor(presetId, theme.value),
  })
}

/** 自定义颜色：清掉预设，只认 hex */
function pickCustom(sideId: SideId, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  store.setSideField(sideId, { accent: value, accentPreset: undefined })
}

const fontSizeMax = 64
</script>

<template>
  <aside v-if="layout" class="config" :aria-label="t('inspector.title')">
    <header class="config__head">
      <AppIcon name="options" :size="14" class="config__icon" />
      <span class="config__title">{{ t('inspector.title') }}</span>
      <!--
        这里刻意**没有**关闭按钮（用户实测反馈"移除右上角的叉号"）：
        对比页工具条上那个开关图标已经能收起面板，一个面板两个关闭入口没有意义，
        而且它占着标题栏最显眼的位置。
      -->
    </header>

    <div class="config__body u-scroll-y">
      <!-- ——————————————— 布局 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupLayout') }}</h3>

        <label class="field">
          <span class="field__label">{{ t('inspector.gutter') }}</span>
          <input
            class="field__range"
            type="range"
            min="8"
            max="96"
            step="4"
            :value="layout.gutter"
            @input="patch({ gutter: Number(($event.target as HTMLInputElement).value) })"
            @wheel="onWheel($event, 'gutter', 8, 96, 4)"
          />
          <input
            class="field__number"
            type="number"
            min="8"
            max="96"
            step="4"
            :value="layout.gutter"
            :aria-label="t('inspector.gutter')"
            @change="patch({ gutter: clampNumber(($event.target as HTMLInputElement).value, 8, 96, layout.gutter) })"
          />
        </label>

        <label class="field">
          <span class="field__label">{{ t('inspector.maxWidth') }}</span>
          <input
            class="field__range"
            type="range"
            min="720"
            max="1920"
            step="40"
            :value="layout.maxWidth"
            @input="patch({ maxWidth: Number(($event.target as HTMLInputElement).value) })"
            @wheel="onWheel($event, 'maxWidth', 720, 1920, 40)"
          />
          <input
            class="field__number"
            type="number"
            min="720"
            max="1920"
            step="40"
            :value="layout.maxWidth"
            :aria-label="t('inspector.maxWidth')"
            @change="
              patch({ maxWidth: clampNumber(($event.target as HTMLInputElement).value, 720, 1920, layout.maxWidth) })
            "
          />
        </label>

        <label class="field field--switch">
          <span class="field__label">{{ t('inspector.showAxis') }}</span>
          <input
            type="checkbox"
            :checked="layout.showAxis"
            @change="patch({ showAxis: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </section>

      <!-- ——————————————— 配色 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupAccent') }}</h3>
        <p class="group__hint">{{ t('inspector.accentHint') }}</p>

        <div v-for="(side, index) in sides" :key="side.id" class="accent">
          <span class="accent__name">
            {{ index === 0 ? t('compare.sideA') : t('compare.sideB') }}
          </span>
          <div class="accent__swatches" role="radiogroup" :aria-label="t('inspector.groupAccent')">
            <button
              v-for="preset in ACCENT_PRESETS"
              :key="preset.id"
              class="swatch"
              type="button"
              role="radio"
              :aria-checked="sidePreset(side.id) === preset.id"
              :class="{ 'swatch--active': sidePreset(side.id) === preset.id }"
              :style="{ background: swatchColor(preset.id) }"
              :title="t(preset.labelKey)"
              :aria-label="t(preset.labelKey)"
              @click="pickPreset(side.id, preset.id)"
            />
            <!-- 自定义色：预设之外还想微调时的出口 -->
            <label
              class="swatch swatch--custom"
              :class="{ 'swatch--active': sidePreset(side.id) === '' }"
              :title="t('inspector.accentCustom')"
            >
              <AppIcon name="palette" :size="12" />
              <input
                class="swatch__input"
                type="color"
                :value="sideColor(side.id)"
                :aria-label="t('inspector.accentCustom')"
                @change="pickCustom(side.id, $event)"
              />
            </label>
          </div>
        </div>
      </section>

      <!-- ——————————————— 序号 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupNumber') }}</h3>
        <label class="field field--switch">
          <span class="field__label">{{ t('inspector.showNumbers') }}</span>
          <input
            type="checkbox"
            :checked="layout.showRowNumbers === true"
            @change="patch({ showRowNumbers: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <p class="group__hint">{{ t('inspector.showNumbersHint') }}</p>
      </section>

      <!-- ——————————————— 匿名 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupAnonymize') }}</h3>
        <label class="field field--switch">
          <span class="field__label">{{ t('inspector.chainAnonymize') }}</span>
          <input
            type="checkbox"
            :checked="layout.chainAnonymize === true"
            data-testid="chain-anonymize"
            @change="patch({ chainAnonymize: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <p class="group__hint">{{ t('inspector.chainAnonymizeHint') }}</p>
      </section>

      <!-- ——————————————— 背景 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupBackground') }}</h3>

        <label class="field field--stack">
          <span class="field__label">{{ t('inspector.background') }}</span>
          <select
            class="field__select"
            :value="layout.background"
            @change="
              patch({
                background: ($event.target as HTMLSelectElement).value as LayoutConfig['background'],
              })
            "
          >
            <option v-for="item in backgrounds" :key="item.value" :value="item.value">
              {{ t(item.labelKey) }}
            </option>
          </select>
        </label>

        <label class="field field--stack">
          <span class="field__label">{{ t('inspector.backgroundFill') }}</span>
          <select
            class="field__select"
            :value="layout.backgroundFill ?? 'content'"
            @change="
              patch({
                backgroundFill: ($event.target as HTMLSelectElement)
                  .value as NonNullable<LayoutConfig['backgroundFill']>,
              })
            "
          >
            <option value="content">{{ t('inspector.fillPattern') }}</option>
            <option value="page">{{ t('inspector.fillPage') }}</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('inspector.backgroundScale') }}</span>
          <input
            class="field__range"
            type="range"
            min="8"
            :max="fontSizeMax"
            step="2"
            :value="layout.backgroundScale ?? 32"
            @input="patch({ backgroundScale: Number(($event.target as HTMLInputElement).value) })"
            @wheel="onWheel($event, 'backgroundScale', 8, fontSizeMax, 2)"
          />
          <input
            class="field__number"
            type="number"
            min="8"
            :max="fontSizeMax"
            step="2"
            :value="layout.backgroundScale ?? 32"
            :aria-label="t('inspector.backgroundScale')"
            @change="
              patch({
                backgroundScale: clampNumber(
                  ($event.target as HTMLInputElement).value,
                  8,
                  fontSizeMax,
                  layout.backgroundScale ?? 32,
                ),
              })
            "
          />
        </label>

        <!--
          背景底色（v0.5.3）。
          与"图案颜色"是两件事：图案颜色画的是网格/点阵的线，
          底色铺的是整块背景。之前只能调前者，于是想做"深色底 + 浅色网格"
          这种搭配就没办法。
        -->
        <div class="field">
          <span class="field__label">{{ t('inspector.backgroundBase') }}</span>
          <div class="tint">
            <button
              class="tint__auto"
              type="button"
              :class="{ 'tint__auto--active': !layout.backgroundBase }"
              @click="patch({ backgroundBase: undefined })"
            >
              {{ t('inspector.baseAuto') }}
            </button>
            <input
              class="tint__input"
              type="color"
              :value="layout.backgroundBase ?? '#f4f2f8'"
              :aria-label="t('inspector.backgroundBase')"
              @input="patch({ backgroundBase: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <div class="field">
          <span class="field__label">{{ t('inspector.backgroundTint') }}</span>
          <div class="tint">
            <button
              class="tint__auto"
              type="button"
              :class="{ 'tint__auto--active': !layout.backgroundTint }"
              @click="patch({ backgroundTint: undefined })"
            >
              {{ t('inspector.tintAuto') }}
            </button>
            <input
              class="tint__input"
              type="color"
              :value="layout.backgroundTint ?? '#a78bfa'"
              :aria-label="t('inspector.backgroundTint')"
              @input="patch({ backgroundTint: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <label class="field field--switch">
          <span class="field__label">{{ t('inspector.backgroundInPresent') }}</span>
          <input
            type="checkbox"
            :checked="layout.backgroundInPresent === true"
            @change="patch({ backgroundInPresent: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </section>

      <!-- ——————————————— 聚光灯 ——————————————— -->
      <section class="group">
        <h3 class="group__title">{{ t('inspector.groupSpotlight') }}</h3>
        <div class="segmented" role="radiogroup" :aria-label="t('inspector.groupSpotlight')">
          <button
            v-for="item in spotlights"
            :key="item.value"
            class="segmented__item"
            type="button"
            role="radio"
            :aria-checked="(layout.spotlight ?? 'off') === item.value"
            :class="{ 'segmented__item--active': (layout.spotlight ?? 'off') === item.value }"
            @click="patch({ spotlight: item.value })"
          >
            {{ t(item.labelKey) }}
          </button>
        </div>
        <p class="group__hint">{{ t('inspector.spotlightHint') }}</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.config {
  display: flex;
  flex: none;
  flex-direction: column;
  width: var(--config-width, 280px);
  height: 100%;
  overflow: hidden;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-subtle);
}

.config__head {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border-subtle);
}

.config__icon {
  color: var(--accent-500);
}

.config__title {
  flex: 1;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.config__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.config__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.config__body {
  flex: 1;
  min-height: 0;
  padding: var(--sp-3);
}

/* —— 分组 —— */
.group + .group {
  padding-top: var(--sp-4);
  margin-top: var(--sp-4);
  border-top: 1px solid var(--border-subtle);
}

.group__title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.group__hint {
  margin-top: var(--sp-2);
  font-size: var(--fs-xs);
  line-height: var(--lh-normal);
  color: var(--text-disabled);
}

/* —— 字段 —— */
.field {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-3);
}

.field--stack {
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-1);
}

.field--switch {
  justify-content: space-between;
}

.field__label {
  flex: none;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field__range {
  flex: 1;
  min-width: 0;
  height: 16px;
  cursor: pointer;
  appearance: none;
  background: transparent;
}

/* 自绘轨道与滑块，理由见 SideEditorDialog：Chromium 的 accent-color
   会把未填充的轨道画成近黑色，在浅色主题下像一根黑条 */
.field__range::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--bg-active);
  border-radius: var(--radius-full);
}

.field__range::-moz-range-track {
  height: 4px;
  background: var(--bg-active);
  border-radius: var(--radius-full);
}

.field__range::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  appearance: none;
  background: var(--accent-500);
  border: none;
  border-radius: var(--radius-full);
}

.field__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--accent-500);
  border: none;
  border-radius: var(--radius-full);
}

.field__value {
  flex: none;
  width: 36px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: right;
}

/*
 * 可直接填写的数值框（用户要求"直接填写数值"）。
 * 与滑块并排、宽度固定，改完按回车或失焦生效（change 事件）。
 */
.field__number {
  flex: none;
  width: 56px;
  padding: 2px var(--sp-1);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: right;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
}

.field__number:focus {
  border-color: var(--accent-500);
  outline: none;
}

.field__select {
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-xs);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
}

/* —— 配色色板 —— */
.accent {
  margin-bottom: var(--sp-3);
}

.accent__name {
  display: block;
  margin-bottom: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.accent__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.swatch {
  position: relative;
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.swatch:hover {
  transform: scale(1.08);
}

/* 选中：外圈用正文色描一圈，任何底色上都看得出来 */
.swatch--active {
  border-color: var(--text-primary);
}

.swatch--custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  cursor: pointer;
}

.swatch__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  opacity: 0;
}

/* —— 背景颜色 —— */
.tint {
  display: flex;
  flex: 1;
  gap: var(--sp-2);
  align-items: center;
}

.tint__auto {
  flex: 1;
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
}

.tint__auto--active {
  color: var(--accent-500);
  border-color: var(--accent-500);
}

.tint__input {
  flex: none;
  width: 28px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  background: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
}

/* —— 分段控件（聚光灯） —— */
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-sm);
}

.segmented__item {
  flex: 1;
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.segmented__item:hover {
  color: var(--text-primary);
}

/* 选中态与项目列表里被选中的那一项同源（浅色底 + 主题色前景） */
.segmented__item--active,
.segmented__item--active:hover {
  color: var(--accent-500);
  background: var(--accent-soft);
}
</style>
