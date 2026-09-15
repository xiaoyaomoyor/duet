<script setup lang="ts">
/**
 * 属性面板（画布布局）
 *
 * M2 范围：画布级布局参数（中轴间距、最大宽度、中轴光带、背景、密度）。
 * 这些值属于 sheet.layout，改动经命令层，因此可撤销、会自动保存。
 *
 * 退出方式：面板上方的关闭按钮；状态记在 useUiStore（瞬时，不落盘）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import type { LayoutConfig } from '@/types/project'

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()

const layout = computed<LayoutConfig | undefined>(() => store.current?.sheet.layout)

function patch(patchValue: Partial<LayoutConfig>): void {
  store.dispatch({ t: 'layout/patch', patch: patchValue }, { label: '调整布局', coalesceKey: 'layout' })
}

const backgrounds: Array<{ value: LayoutConfig['background']; labelKey: string }> = [
  { value: 'solid', labelKey: 'inspector.backgroundSolid' },
  { value: 'grid', labelKey: 'inspector.backgroundGrid' },
  { value: 'dots', labelKey: 'inspector.backgroundDots' },
]

const densities: Array<{ value: LayoutConfig['density']; labelKey: string }> = [
  { value: 'compact', labelKey: 'settings.densityCompact' },
  { value: 'normal', labelKey: 'settings.densityNormal' },
  { value: 'comfy', labelKey: 'settings.densityComfy' },
]
</script>

<template>
  <aside v-if="layout" class="inspector" :aria-label="t('inspector.title')">
    <header class="inspector__head">
      <span class="inspector__title">{{ t('inspector.title') }}</span>
      <button
        class="inspector__close"
        type="button"
        :title="t('inspector.close')"
        :aria-label="t('inspector.close')"
        @click="ui.toggleInspector()"
      >
        <AppIcon name="close" :size="14" />
      </button>
    </header>

    <div class="inspector__body u-scroll-y">
      <p class="inspector__group">{{ t('inspector.layout') }}</p>

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
        />
        <span class="field__value">{{ layout.gutter }}</span>
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
        />
        <span class="field__value">{{ layout.maxWidth }}</span>
      </label>

      <label class="field field--switch">
        <span class="field__label">{{ t('inspector.showAxis') }}</span>
        <input
          type="checkbox"
          :checked="layout.showAxis"
          @change="patch({ showAxis: ($event.target as HTMLInputElement).checked })"
        />
      </label>

      <label class="field field--stack">
        <span class="field__label">{{ t('inspector.background') }}</span>
        <select
          class="field__select"
          :value="layout.background"
          @change="patch({ background: ($event.target as HTMLSelectElement).value as LayoutConfig['background'] })"
        >
          <option v-for="item in backgrounds" :key="item.value" :value="item.value">
            {{ t(item.labelKey) }}
          </option>
        </select>
      </label>

      <label class="field field--stack">
        <span class="field__label">{{ t('inspector.density') }}</span>
        <select
          class="field__select"
          :value="layout.density"
          @change="patch({ density: ($event.target as HTMLSelectElement).value as LayoutConfig['density'] })"
        >
          <option v-for="item in densities" :key="item.value" :value="item.value">
            {{ t(item.labelKey) }}
          </option>
        </select>
      </label>
    </div>
  </aside>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  width: 240px;
  height: 100%;
  overflow: hidden;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-subtle);
}

.inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border-subtle);
}

.inspector__title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inspector__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.inspector__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.inspector__body {
  flex: 1;
  min-height: 0;
  padding: var(--sp-3);
}

.inspector__group {
  margin-bottom: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

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
  accent-color: var(--accent-600);
}

.field__value {
  flex: none;
  width: 40px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-align: right;
}

.field__select {
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-xs);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
}
</style>
