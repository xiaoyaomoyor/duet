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
import CanvasRow from './CanvasRow.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { isPresentable } from '@/modules/visibility'
import { moduleTitle } from '@/i18n/helper'
import type { CellRef, ModuleInstance, ModuleRef, Project, Row, SideId } from '@/types/project'

const props = defineProps<{
  project: Project
  /**
   * 只读（展示视图 / 只读导出）。
   * 为 true 时：不渲染编辑器与增删按钮、不启用拖拽排序，
   * 直接渲染各模块的展示视图渲染器。
   */
  readonly?: boolean
}>()

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()

const isReadonly = computed(() => props.readonly === true)

const sides = computed(() => props.project.sheet.sides)
const rows = computed(() => props.project.sheet.rows)
const layout = computed(() => props.project.sheet.layout)

const canvasStyle = computed(() => {
  const ratio = layout.value.ratio
  // ratio 理论上恒为两个正数，但工程文件可能被手改过，这里兜一层
  const a = Number.isFinite(ratio?.[0]) && ratio[0] > 0 ? ratio[0] : 1
  const b = Number.isFinite(ratio?.[1]) && ratio[1] > 0 ? ratio[1] : 1

  return {
    '--side-a': sides.value[0]?.accent ?? 'var(--accent-500)',
    '--side-b': sides.value[1]?.accent ?? 'var(--accent-500)',
    '--canvas-gutter': `${layout.value.gutter}px`,
    '--canvas-max': `${layout.value.maxWidth}px`,
    /*
     * 两侧宽度比。M6 之前 layout.ratio 只存在于数据模型里、
     * 渲染时被写死成 `1fr 1fr`——所以"拖动中轴调宽度"这件事
     * 数据上早就支持，只是从来没接到 CSS。
     */
    '--col-a': `${a}fr`,
    '--col-b': `${b}fr`,
    /** 左列占内容宽度的比例，供中轴拖拽手柄定位 */
    '--col-frac': `${a / (a + b)}`,
  }
})

/** 背景样式类：solid / grid / dots（§9.2 的 LayoutConfig.background） */
const backgroundClass = computed(() => `canvas--bg-${layout.value.background}`)

const densityClass = computed(() => `canvas--${layout.value.density}`)

// ————————————————————————————————————————————————————————
// 中轴拖拽：调整左右宽度比
// ————————————————————————————————————————————————————————

/** 单侧最小占比：再窄就放不下卡片内容了（约等于 200px / 1000px 版面） */
const MIN_COLUMN_FRAC = 0.2
const MAX_COLUMN_FRAC = 0.8

const canvasEl = ref<HTMLElement | null>(null)
const resizingColumns = ref(false)
let resizeStartX = 0
let resizeStartRatio: [number, number] = [1, 1]

function onColumnResizeStart(event: PointerEvent): void {
  resizeStartX = event.clientX
  resizeStartRatio = [...layout.value.ratio] as [number, number]
  resizingColumns.value = true
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onColumnResizeMove(event: PointerEvent): void {
  if (!resizingColumns.value) return
  event.preventDefault()

  const width = canvasEl.value?.clientWidth ?? 0
  if (width <= 0) return

  // 把像素位移换算成占比，再写回两侧的权重
  const delta = (event.clientX - resizeStartX) / width
  const startSum = resizeStartRatio[0] + resizeStartRatio[1]
  const startFrac = resizeStartRatio[0] / startSum
  const frac = Math.min(MAX_COLUMN_FRAC, Math.max(MIN_COLUMN_FRAC, startFrac + delta))

  // 用同一个总和来表达，视觉上总宽度不变（只有分配比例在动）
  store.patchLayout({ ratio: [frac * startSum, (1 - frac) * startSum] })
}

function onColumnResizeEnd(event: PointerEvent): void {
  if (!resizingColumns.value) return
  resizingColumns.value = false
  ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

/** 双击中轴：恢复左右等宽 */
function resetColumnRatio(): void {
  store.patchLayout({ ratio: [1, 1] })
}

/** 键盘可达：方向键微调（拖拽对键盘用户不可用） */
function onColumnResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.1 : 0.02
  const [a, b] = layout.value.ratio
  if (event.key === 'ArrowLeft') store.patchLayout({ ratio: [Math.max(MIN_COLUMN_FRAC, a - step), b + step] })
  else if (event.key === 'ArrowRight') store.patchLayout({ ratio: [Math.min(MAX_COLUMN_FRAC, a + step), b - step] })
  else return
  event.preventDefault()
}

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

/**
 * 展示视图下应该渲染的行：左右两格都没有可见模块时整行跳过，
 * 避免出现"空行把内容撑开"的观感问题。
 *
 * 注意：单个模块的"空/隐藏"判定在 CanvasRow 内（那里才有渲染细节），
 * 这里只做行级筛选——两处规则必须一致，因此都调用同一个 isPresentable。
 */
const visibleRows = computed<Row[]>(() => {
  if (!isReadonly.value) return rows.value
  return rows.value.filter((row) =>
    sides.value.some((side) =>
      modulesOf(row, side.id).some((module) => isPresentable(module)),
    ),
  )
})

/** 读取某个模块当前的 props（用于合并式更新，避免覆盖其他选项） */
function moduleProps(ref: ModuleRef): Record<string, unknown> {
  const row = rows.value.find((item) => item.id === ref.rowId)
  const module = row?.cells[ref.sideId]?.modules.find((item) => item.id === ref.moduleId)
  return module?.props ?? {}
}

// —— 交给 CanvasRow 的回调 ——
// 写成具名函数而不是模板内联箭头：内联写法在泛型 emits 下无法推断参数类型。

function onRelabel(rowId: string, label: string): void {
  store.setRowLabel(rowId, label)
}

function onPatchModule(ref: ModuleRef, patch: { title?: string; hidden?: boolean }): void {
  store.patchModule(ref, patch)
}

function onPatchModuleData(ref: ModuleRef, patch: Record<string, unknown>): void {
  store.patchModuleData(ref, patch)
}

function onPatchModuleProps(ref: ModuleRef, patch: Record<string, unknown>): void {
  // 合并而非替换：模块选项是逐项修改的
  store.patchModule(ref, { props: { ...moduleProps(ref), ...patch } })
}

function onRemoveModule(ref: ModuleRef): void {
  store.removeModule(ref)
}

function onDuplicateModule(ref: ModuleRef): void {
  store.duplicateModule(ref)
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
          :readonly="project.ui.mode === 'present'"
          :patch="(patch: Record<string, unknown>) => store.setSideField(side.id, patch)"
        />
      </div>

      <!-- 行列表：编辑态可拖拽排序，展示态是普通容器（只读） -->
      <VueDraggable
        v-if="!isReadonly && visibleRows.length > 0"
        :model-value="rows"
        class="canvas__rows"
        handle=".row-drag-handle"
        :animation="200"
        ghost-class="canvas__row--ghost"
        @update:model-value="onRowsReorder"
      >
        <template v-for="(row, rowIndex) in visibleRows" :key="row.id">
          <CanvasRow
            :row="row"
            :row-index="rowIndex"
            :sides="sides"
            :project-id="project.id"
            @insert="insertRowAt"
            @remove="removeRow"
            @relabel="onRelabel"
            @resize-height="store.setRowHeight"
            @open-picker="openPicker"
            @reorder-modules="onModulesReorder"
            @patch-module="onPatchModule"
            @patch-data="onPatchModuleData"
            @patch-props="onPatchModuleProps"
            @remove-module="onRemoveModule"
            @duplicate-module="onDuplicateModule"
          />
        </template>
      </VueDraggable>

      <div v-else-if="visibleRows.length > 0" class="canvas__rows">
        <CanvasRow
          v-for="(row, rowIndex) in visibleRows"
          :key="row.id"
          :row="row"
          :row-index="rowIndex"
          :sides="sides"
          :project-id="project.id"
          readonly
        />
      </div>

      <p v-else class="canvas__empty">
        {{ isReadonly ? t('compare.nothingToPresent') : t('compare.emptyRows') }}
      </p>

      <!--
        中轴拖拽：调整左右两栏宽度比。
        只在编辑态出现，展示与导出稿不该带一个可拖的控件。
        定位复用了格子的 fr 分配比例，因此手柄永远压在真正的中缝上。

        提醒：模板注释里不要出现连续两个短横线（CSS 变量名开头就是那两道）。
        XML 规定注释内容不得包含它，而导出长图会把 DOM 序列化成 SVG，
        一个这样的注释就会让整张图解析失败、导出直接报错，且极难定位。
        导出侧已经会剔除所有注释节点兜底，但写注释时仍应避开。
      -->
      <div
        v-if="!isReadonly && visibleRows.length > 0"
        class="canvas__axis-resizer"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('compare.resizeColumns')"
        tabindex="0"
        @pointerdown="onColumnResizeStart"
        @pointermove="onColumnResizeMove"
        @pointerup="onColumnResizeEnd"
        @pointercancel="onColumnResizeEnd"
        @dblclick="resetColumnRatio"
        @keydown="onColumnResizeKeydown"
      />

      <div v-if="!isReadonly" class="canvas__footer">
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
  position: relative; /* 中轴拖拽手柄的定位基准 */
  max-width: var(--canvas-max, 1440px);
  margin: 0 auto;
}

/*
 * 中轴拖拽手柄。
 *
 * 定位公式复现了格子的 fr 分配：内容宽度减去中缝后按 --col-frac 切分，
 * 再加上半个中缝就是真正的中线。这样无论比例怎么变，
 * 手柄都精确压在视觉中缝上，而不是画布正中。
 */
.canvas__axis-resizer {
  position: absolute;
  top: var(--sp-6);
  bottom: var(--sp-12);
  left: calc(
    (100% - var(--canvas-gutter, 32px)) * var(--col-frac, 0.5) +
      var(--canvas-gutter, 32px) / 2 - 4px
  );
  z-index: 2;
  width: 8px;
  cursor: col-resize;
  border-radius: var(--radius-full);
  transition: background var(--dur-fast) var(--ease-out);
}

.canvas__axis-resizer:hover,
.canvas__axis-resizer:focus-visible {
  background: var(--accent-500);
  outline: none;
}

.canvas__heads {
  display: grid;
  grid-template-columns: var(--col-a, 1fr) var(--col-b, 1fr);
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
  grid-template-columns: var(--col-a, 1fr) var(--col-b, 1fr);
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
