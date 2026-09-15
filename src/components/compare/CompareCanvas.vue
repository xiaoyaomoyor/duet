<script setup lang="ts">
/**
 * 对比画布：工具头 + 行结构
 *
 * M1 范围：把「对比页」真实渲染出来（工具头、中轴、行），
 *          行内的模块以**只读卡片**呈现，说明它属于哪个模块类型。
 * M2 范围：模块的编辑器、拖拽排序、增删模块。
 *
 * 对齐机制（§7.5）：每一行由 CSS Grid 的同一网格行承载，
 * 因此左右两格天然顶部对齐、行高由较高者撑开。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SideHeader from './SideHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { getModuleMeta } from '@/modules/meta'
import { moduleTitle } from '@/i18n/helper'
import { hexToSoft } from '@/lib/color'
import type { Project } from '@/types/project'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const store = useProjectStore()

const sides = computed(() => props.project.sheet.sides)
const rows = computed(() => props.project.sheet.rows)
const layout = computed(() => props.project.sheet.layout)

const canvasStyle = computed(() => ({
  '--side-a': sides.value[0]?.accent ?? 'var(--accent-500)',
  '--side-b': sides.value[1]?.accent ?? 'var(--accent-500)',
  '--canvas-gutter': `${layout.value.gutter}px`,
  '--canvas-max': `${layout.value.maxWidth}px`,
}))

const densityClass = computed(() => `canvas--${layout.value.density}`)

function addRow(): void {
  store.addRow()
}
</script>

<template>
  <div class="canvas-wrap">
    <div class="canvas" :class="densityClass" :style="canvasStyle">
      <!-- 工具头 -->
      <div class="canvas__heads">
        <SideHeader
          v-for="side in sides"
          :key="side.id"
          :side="side"
          :side-id="side.id"
          :readonly="project.ui.mode === 'present'"
        />
      </div>

      <!-- 行 -->
      <div v-if="rows.length > 0" class="canvas__rows">
        <div v-for="row in rows" :key="row.id" class="canvas__row">
          <div v-if="row.label" class="canvas__row-label">{{ row.label }}</div>

          <div class="canvas__cells">
            <template v-for="side in sides" :key="side.id">
              <div
                class="canvas__cell"
                :style="{ '--accent': side.accent, '--accent-soft': hexToSoft(side.accent, 8) }"
              >
                <template v-if="row.cells[side.id]?.modules.length">
                  <article
                    v-for="module in row.cells[side.id]?.modules ?? []"
                    :key="module.id"
                    class="module-card"
                    :class="{ 'module-card--hidden': module.hidden }"
                  >
                    <header class="module-card__head">
                      <AppIcon
                        :name="getModuleMeta(module.type)?.icon ?? 'text'"
                        :size="13"
                        class="module-card__icon"
                      />
                      <span class="module-card__title">{{ module.title }}</span>
                      <span v-if="module.hidden" class="module-card__flag">
                        {{ t('editor.hideModule') }}
                      </span>
                    </header>
                    <p class="module-card__body">
                      {{ t('editor.fill') }}
                      <span class="module-card__type">
                        {{ moduleTitle(module.type) }}
                      </span>
                    </p>
                  </article>
                </template>

                <p v-else class="canvas__cell-empty">{{ t('editor.addModule') }}</p>
              </div>
            </template>
          </div>
        </div>
      </div>

      <p v-else class="canvas__empty">{{ t('compare.emptyRows') }}</p>

      <!-- 添加行（M1 的最小可用入口；M2 会换成模块选择器） -->
      <div class="canvas__actions">
        <button class="canvas__add-row" type="button" @click="addRow">
          <AppIcon name="plus" :size="15" />
          {{ t('compare.addRow') }}
        </button>
        <span class="canvas__hint">{{ t('compare.roadmap') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap {
  padding: 0 var(--sp-8) var(--sp-12);
}

.canvas {
  max-width: var(--canvas-max, 1440px);
  margin: 0 auto;
}

/* —— 工具头：两列 —— */
.canvas__heads {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--canvas-gutter, 32px);
  padding-top: var(--sp-6);
}

/* —— 行 —— */
.canvas__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  margin-top: var(--sp-5);
}

.canvas__row-label {
  width: fit-content;
  padding: 1px 10px;
  margin: 0 auto var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.canvas__cells {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--canvas-gutter, 32px);
  align-items: start;
}

.canvas__cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.canvas__cell-empty {
  padding: var(--sp-6);
  font-size: var(--fs-sm);
  color: var(--text-disabled);
  text-align: center;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
}

/* —— 模块卡片（M1 只读预览） —— */
.module-card {
  padding: var(--sp-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent, var(--accent-500));
  border-radius: var(--radius-md);
}

.module-card--hidden {
  opacity: 0.55;
}

.module-card__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-2);
}

.module-card__icon {
  color: var(--accent, var(--accent-500));
}

.module-card__title {
  font-size: var(--fs-sm);
  font-weight: 600;
}

.module-card__flag {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
}

.module-card__body {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--text-disabled);
}

.module-card__type {
  padding: 0 6px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.canvas__empty {
  padding: var(--sp-12) 0;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}

/* —— 底部操作 —— */
.canvas__actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  margin-top: var(--sp-6);
}

.canvas__add-row {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-full);
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.canvas__add-row:hover {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.canvas__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

/* —— 密度 —— */
.canvas--compact .canvas__rows {
  gap: var(--sp-3);
}

.canvas--comfy .canvas__rows {
  gap: var(--sp-8);
}
</style>
