<script setup lang="ts">
/**
 * 对比画布：工具头 + 可编辑的行与模块
 *
 * 对齐机制（§7.5）：每一行由 CSS Grid 的同一网格行承载，
 * 因此左右两格天然顶部对齐、行高由较高者撑开。
 *
 * 拖拽（§17 M2-7）：
 *   - 整行排序由行左侧的手柄驱动
 *   - 格内模块排序由模块卡片上的手柄驱动
 *   - 跨格移动用每格头部的"← / →"按钮（比跨容器拖拽更可靠，且键盘可达）
 *   所有拖拽最终都落到命令层，因此拖完仍可一步撤销。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import SideHeader from './SideHeader.vue'
import ModuleCard from '@/components/editor/ModuleCard.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { moduleTitle } from '@/i18n/helper'
import { hexToSoft } from '@/lib/color'
import type { CellRef, ModuleInstance, Project, Row, SideId } from '@/types/project'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()

const sides = computed(() => props.project.sheet.sides)
const rows = computed(() => props.project.sheet.rows)
const layout = computed(() => props.project.sheet.layout)

const canvasStyle = computed(() => ({
  '--side-a': sides.value[0]?.accent ?? 'var(--accent-500)',
  '--side-b': sides.value[1]?.accent ?? 'var(--accent-500)',
  '--canvas-gutter': `${layout.value.gutter}px`,
  '--canvas-max': `${layout.value.maxWidth}px`,
}))

/** 背景样式类：solid / grid / dots（§9.2 的 LayoutConfig.background） */
const backgroundClass = computed(() => `canvas--bg-${layout.value.background}`)

const densityClass = computed(() => `canvas--${layout.value.density}`)

// ————————————————————————————————————————————————————————
// 行
// ————————————————————————————————————————————————————————

/** 行拖拽：把新顺序翻译成连续的 row/move 命令 */
function onRowsReorder(next: Row[]): void {
  const ids = next.map((row) => row.id)
  ids.forEach((id, index) => {
    const current = rows.value.findIndex((row) => row.id === id)
    if (current !== index) store.moveRow(id, index)
  })
}

function removeRow(row: Row): void {
  store.removeRow(row.id)
  ui.notify(t('toast.rowRemoved'), 'info')
}

/**
 * 在指定位置插入行。
 * 走 store 的 insertRowAt（单条命令），因此只占**一步撤销**——
 * 早先版本在组件里"先 addRow 再 moveRow"，会留下两条历史记录。
 */
function insertRowAt(index: number): void {
  store.insertRowAt(index)
}

// ————————————————————————————————————————————————————————
// 模块
// ————————————————————————————————————————————————————————

/** 当前正在选择模块的目标格 */
const pickerTarget = ref<CellRef | null>(null)

function openPicker(row: Row, sideId: SideId): void {
  pickerTarget.value = { rowId: row.id, sideId }
}

function onPickModule(type: string): void {
  const target = pickerTarget.value
  pickerTarget.value = null
  if (!target) return

  const title = moduleTitle(type)
  const result = store.addModuleAt(target, type, title)
  if (result.ok) ui.notify(t('toast.moduleAdded', { title }), 'success')
  else ui.notify(result.error, 'danger')
}

/** 格内重排：一次原子命令，只占一步撤销 */
function onModulesReorder(ref: CellRef, next: ModuleInstance[]): void {
  store.reorderModules(ref, next.map((module) => module.id))
}

function modulesOf(row: Row, sideId: SideId): ModuleInstance[] {
  return row.cells[sideId]?.modules ?? []
}

function cellRef(row: Row, sideId: SideId): CellRef {
  return { rowId: row.id, sideId }
}
</script>

<template>
  <div class="canvas-wrap">
    <div class="canvas" :class="[densityClass, backgroundClass]" :style="canvasStyle">
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

      <!-- 行（可拖拽排序） -->
      <VueDraggable
        v-if="rows.length > 0"
        :model-value="rows"
        class="canvas__rows"
        handle=".row-drag-handle"
        :animation="200"
        ghost-class="canvas__row--ghost"
        @update:model-value="onRowsReorder"
      >
        <div v-for="(row, rowIndex) in rows" :key="row.id" class="canvas__row">
          <div class="canvas__row-head">
            <span class="row-drag-handle canvas__row-grip" :title="t('row.moveRow')">
              <AppIcon name="grip" :size="13" />
            </span>

            <input
              class="canvas__row-label-input"
              type="text"
              :value="row.label ?? ''"
              :placeholder="t('row.labelPlaceholder')"
              @change="store.setRowLabel(row.id, ($event.target as HTMLInputElement).value)"
            />

            <div class="canvas__row-tools">
              <button
                class="canvas__row-tool"
                type="button"
                :title="t('row.insertAbove')"
                :aria-label="t('row.insertAbove')"
                @click="insertRowAt(rowIndex)"
              >
                <AppIcon name="plus" :size="12" />
              </button>
              <button
                class="canvas__row-tool canvas__row-tool--danger"
                type="button"
                :title="t('row.deleteRow')"
                :aria-label="t('row.deleteRow')"
                @click="removeRow(row)"
              >
                <AppIcon name="trash" :size="12" />
              </button>
            </div>
          </div>

          <div class="canvas__cells">
            <div
              v-for="side in sides"
              :key="side.id"
              class="canvas__cell"
              :style="{ '--accent': side.accent, '--accent-soft': hexToSoft(side.accent, 8) }"
            >
              <VueDraggable
                :model-value="modulesOf(row, side.id)"
                class="canvas__cell-modules"
                handle=".module-drag-handle"
                group="duet-modules"
                :animation="180"
                ghost-class="module-ghost"
                @update:model-value="(next: ModuleInstance[]) => onModulesReorder(cellRef(row, side.id), next)"
              >
                <ModuleCard
                  v-for="module in modulesOf(row, side.id)"
                  :key="module.id"
                  :module="module"
                  :side-id="side.id"
                  :accent="side.accent"
                  draggable
                  @patch="(patch) => store.patchModule({ rowId: row.id, sideId: side.id, moduleId: module.id }, patch)"
                  @patch-data="(patch) => store.patchModuleData({ rowId: row.id, sideId: side.id, moduleId: module.id }, patch)"
                  @patch-props="(patch) => store.patchModule({ rowId: row.id, sideId: side.id, moduleId: module.id }, { props: { ...module.props, ...patch } })"
                  @remove="store.removeModule({ rowId: row.id, sideId: side.id, moduleId: module.id })"
                  @duplicate="store.duplicateModule({ rowId: row.id, sideId: side.id, moduleId: module.id })"
                />
              </VueDraggable>

              <div class="canvas__cell-actions">
                <button class="canvas__add-module" type="button" @click="openPicker(row, side.id)">
                  <AppIcon name="plus" :size="13" />
                  {{ t('module.addModule') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </VueDraggable>

      <p v-else class="canvas__empty">{{ t('compare.emptyRows') }}</p>

      <div class="canvas__footer">
        <button class="canvas__add-row" type="button" @click="store.addRow()">
          <AppIcon name="plus" :size="15" />
          {{ t('row.addRow') }}
        </button>
      </div>
    </div>

    <ModulePicker
      :open="pickerTarget !== null"
      @pick="onPickModule"
      @close="pickerTarget = null"
    />
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

.canvas__heads {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--canvas-gutter, 32px);
  padding-top: var(--sp-6);
}

.canvas__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  margin-top: var(--sp-5);
}

.canvas__row {
  padding: var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.canvas__row:hover {
  border-color: var(--border-subtle);
}

.canvas__row--ghost {
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.canvas__row-head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-3);
}

.canvas__row-grip {
  cursor: grab;
  color: var(--text-disabled);
}

.canvas__row-grip:active {
  cursor: grabbing;
}

.canvas__row-label-input {
  flex: 1;
  min-width: 0;
  padding: 2px var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: transparent;
  border: 1px dashed transparent;
  border-radius: var(--radius-xs);
}

.canvas__row-label-input:hover,
.canvas__row-label-input:focus {
  background: var(--bg-surface-2);
  border-color: var(--border-default);
  outline: none;
}

.canvas__row-tools {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.canvas__row:hover .canvas__row-tools {
  opacity: 1;
}

.canvas__row-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
}

.canvas__row-tool:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.canvas__row-tool--danger:hover {
  color: var(--danger);
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

.canvas__cell-modules {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 8px;
}

.module-ghost {
  opacity: 0.4;
}

.canvas__cell-actions {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.canvas__add-module {
  display: inline-flex;
  flex: 1;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  padding: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.canvas__add-module:hover {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.canvas__move-side {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--text-disabled);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.canvas__move-side:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.canvas__empty {
  padding: var(--sp-12) 0;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}

.canvas__footer {
  display: flex;
  justify-content: center;
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

.canvas--compact .canvas__rows {
  gap: var(--sp-3);
}

.canvas--comfy .canvas__rows {
  gap: var(--sp-8);
}

/* —— 背景样式（Inspector 可切换） —— */
.canvas--bg-grid {
  background-image:
    linear-gradient(to right, var(--border-subtle) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px);
  background-size: 32px 32px;
}

.canvas--bg-dots {
  background-image: radial-gradient(var(--border-default) 1px, transparent 1px);
  background-size: 20px 20px;
}
</style>
