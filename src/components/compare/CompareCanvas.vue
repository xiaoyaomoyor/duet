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
import CanvasRow from './CanvasRow.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { isPresentable } from '@/modules/visibility'
import { moduleTitle } from '@/i18n/helper'
import { useResolvedTheme } from '@/composables/useResolvedTheme'
import { usePlayingSides } from '@/composables/usePlayingSides'
import { resolveAccent } from '@/data/accentPresets'
import { mixHex } from '@/lib/color'
import type { CellRef, ModuleInstance, ModuleRef, Project, Row, SideId } from '@/types/project'

const props = defineProps<{
  project: Project
  /**
   * 只读（演示视图 / 只读导出）。
   * 为 true 时：不渲染编辑器与增删按钮、不启用拖拽排序，
   * 直接渲染各模块的演示视图渲染器。
   */
  readonly?: boolean
}>()

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()

const isReadonly = computed(() => props.readonly === true)

const accentTheme = useResolvedTheme()

/**
 * 两侧数据的**展示副本**：把配色解析成"当前主题下的实际色值"。
 *
 * 为什么在这里做而不是让每个下游自己算：
 *   `side.accent` 被 CanvasRow / SideHeader / SyncPlayerBar / ModuleView
 *   等六七个地方读。如果在各自那里解析，就会出现"有的地方跟主题、有的地方不跟"
 *   这种最难查的不一致。收口在这一处之后，下游继续读 `side.accent` 即可，
 *   一个字都不用改，而且拿到的永远是对的。
 *
 * 注意解析只影响**渲染**：写回工程的仍然是预设 id（见 data/accentPresets.ts），
 * 所以切主题不会污染工程数据。
 */
const sides = computed(() =>
  props.project.sheet.sides.map((side) => ({
    ...side,
    accent: resolveAccent(side, accentTheme.value) || 'var(--accent-500)',
  })),
)
const rows = computed(() => props.project.sheet.rows)
const layout = computed(() => props.project.sheet.layout)

// ————————————————————————————————————————————————————————
// 聚光灯：只有一侧在播放时，让"正在听的那一边"更突出
// ————————————————————————————————————————————————————————

const playingSides = usePlayingSides(computed(() => sides.value.map((side) => side.id)))

/** 恰好一侧在播放时返回它的 id，否则 null（两侧都播 / 都没播时不该有偏向） */
const soloPlayingSideId = computed(() => {
  const playing = Object.entries(playingSides.value)
    .filter(([, isPlaying]) => isPlaying)
    .map(([id]) => id)
  return playing.length === 1 ? (playing[0] ?? null) : null
})

const spotlightMode = computed(() => layout.value.spotlight ?? 'off')

/**
 * 聚光灯只在**演示视图**生效。
 *
 * 用户的原话是"正在播放的工具整体在**演示模式**中占据更大的比例"。
 * 编辑视图不跟进还有一个更实际的理由：一边听一边排版时，
 * 画布因为播放状态忽宽忽窄、忽明忽暗，是纯粹的干扰。
 */
const spotlightSideId = computed(() =>
  isReadonly.value && spotlightMode.value !== 'off' ? soloPlayingSideId.value : null,
)

/** 需要"色彩弱化"的侧：正在被强调的那一侧之外的所有侧 */
const dimmedSideIds = computed(() => {
  if (spotlightMode.value !== 'dim' || !spotlightSideId.value) return []
  return sides.value.map((side) => side.id).filter((id) => id !== spotlightSideId.value)
})

const canvasStyle = computed(() => {
  /*
   * 比例强调：给正在播放的一侧加权（聚光灯）。
   * 两侧基础宽度恒为等宽——v0.5.5 移除了"拖动中轴调比例"，
   * 因此这里不再读 `layout.ratio`（那个字段也一并从数据模型删掉了）。
   */
  const emphasised = spotlightSideId.value
  const boost = spotlightMode.value === 'ratio' ? 1.7 : 1
  const isFirst = emphasised !== undefined && sides.value[0]?.id === emphasised
  const weightA = isFirst ? boost : 1
  const weightB = !isFirst && emphasised ? boost : 1

  return {
    '--side-a': sides.value[0]?.accent ?? 'var(--accent-500)',
    '--side-b': sides.value[1]?.accent ?? 'var(--accent-500)',
    '--canvas-gutter': `${layout.value.gutter}px`,
    '--canvas-max': `${layout.value.maxWidth}px`,
    /* 两侧等宽；聚光灯「比例强调」时给正在播放的一侧加权 */
    '--col-a': `${weightA}fr`,
    '--col-b': `${weightB}fr`,
  }
})

/** 背景样式类：solid / grid / dots（§9.2 的 LayoutConfig.background） */
const backgroundClass = computed(() => `canvas--bg-${layout.value.background}`)

// ————————————————————————————————————————————————————————
// 背景图案参数（对比配置里可调）
// ————————————————————————————————————————————————————————

const DEFAULT_BG_SCALE = 32

/**
 * 图案是否**充满整页**（而不只是铺在内容底下）。
 *
 * v0.5.0 改语义：此前这一项叫 solid，做的是"整页铺一层实心底色"，
 * 而用户要的是"网格/点阵充满整个对比页"。
 *
 * ⚠️ 这个 computed 必须在 `backgroundVars` **之前**声明：
 * 后者会读它。计算属性本身是惰性的（求值时早就初始化完了），
 * 但把顺序写对，读代码的人不必去推敲 TDZ。
 */
const pageFill = computed(() => layout.value.backgroundFill === 'page')

/**
 * 背景参数写成 CSS 变量而不是几套写死的类：
 * 「密度 / 颜色 / 填充形式」三者的组合有几十种，枚举成类会爆炸，
 * 而它们本身都是连续量，交给变量最自然。
 */
const backgroundVars = computed(() => {
  const scale = Number.isFinite(layout.value.backgroundScale)
    ? Math.min(96, Math.max(8, layout.value.backgroundScale as number))
    : DEFAULT_BG_SCALE

  return {
    '--bg-scale': `${scale}px`,
    // 留空 = 跟随主题（用各主题自己的 --border-* 色）
    '--bg-tint': layout.value.backgroundTint ?? '',
    '--bg-tint-fallback': 'var(--border-subtle)',
    /*
     * 底色只在"画布自己负责背景"时才下发。
     *
     * "充满整页"时背景归外层壁纸层——画布要是也铺一层底色，
     * 它正好压在壁纸上、把中间整块图案盖掉，只剩页面边缘还看得见图案
     * （用户实测反馈："内部还是被背景挡住了图案，导致图案只出现在边缘"）。
     *
     * ⚠️ 变量名**不能**叫 `--bg-base`：那是主题里"应用底色"的 token
     * （tokens.css 三个主题各定义一次）。同名的话 `var(--bg-base, transparent)`
     * 会解析成**主题色**而不是"未设置"，画布于是永远铺着一层不透明底色——
     * 这正是"图案只在边缘"的真凶。
     *
     * 也不能沿用外层壁纸层的 `--page-fill`：自定义属性会**继承**，
     * 画布读到的会是外层那个值（探针实测就是如此），照样铺一层底色把图案盖掉。
     * 所以画布用自己专用的 `--canvas-fill`，两边互不影响。
     */
    '--canvas-fill': pageFill.value ? '' : (layout.value.backgroundBase ?? ''),
  }
})

/** 演示视图下是否保留背景图案（默认关） */
const showBackground = computed(
  () => !isReadonly.value || layout.value.backgroundInPresent === true,
)

/**
 * 画布这里要不要画图案。
 *
 * "充满整页" → **不画**：那一份交给外层（编辑视图是滚动容器
 * `.compare__stage`，演示视图是遮罩层上的固定壁纸层）。
 * 那两处都用 `position: fixed` / `background-attachment: fixed`，
 * 图案像壁纸一样钉住不动，而且都在顶栏之内、不会盖住它。
 *
 * 画布这边再画一份就是同一张图案出现两次——
 * 用户实测反馈"演示视图中存在了两种背景图案是错的"。
 */
const drawPattern = computed(() => showBackground.value && !pageFill.value)

const showRowNumbers = computed(() => layout.value.showRowNumbers === true)

/**
 * 通用行（横跨两栏）的强调色（v0.5.7）。
 *
 * 默认取两侧强调色的**中点**：通用行不属于任何一侧，用某一边的颜色会
 * 误导成"这是左边的"；用界面主题色则与两侧毫无关系，像第三种东西。
 * 中点既不属于谁，又明显与两侧同源；「对比配置」里可以另指定一个颜色。
 */
const commonAccent = computed(
  () =>
    layout.value.commonAccent || mixHex(sides.value[0]?.accent ?? '', sides.value[1]?.accent ?? ''),
)

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

/**
 * 选择器的落点。两种情形合并成一个状态机：
 *   - 'cell'   ：往已有格子里加模块（普通行加一侧，通用行加整行）
 *   - 'common' ：行标题的"+"。**先选模块再建行**——中途取消不会留下空行，
 *                选中后由 store 一次性建出"通用模块行 + 其中的模块"，
 *                因此这次操作仍然只占一步撤销。
 */
type PickerState =
  { kind: 'cell'; ref: CellRef; scope: 'side' | 'common' } | { kind: 'common'; at: number }

const picker = ref<PickerState | null>(null)

/** 传给选择器的过滤条件：通用行只列通用模块，普通行只列可放一侧的模块 */
const pickerScope = computed<'side' | 'common'>(() =>
  picker.value?.kind === 'cell' ? picker.value.scope : 'common',
)

function openPicker(row: Row, sideId: SideId): void {
  picker.value = {
    kind: 'cell',
    ref: { rowId: row.id, sideId },
    // 通用行横跨两栏，往里放"只管一侧"的模块没有意义
    scope: row.kind === 'full' ? 'common' : 'side',
  }
}

/** 行标题的"+"：在该行下方插入一个通用模块行 */
function openCommonPicker(index: number): void {
  picker.value = { kind: 'common', at: index }
}

function onPickModule(type: string): void {
  const target = picker.value
  picker.value = null
  if (!target) return

  const title = moduleTitle(type)
  const result =
    target.kind === 'common'
      ? store.insertCommonRowWithModuleAt(target.at, type, title)
      : store.addModuleAt(target.ref, type, title)

  if (result.ok) ui.notify(t('toast.moduleAdded', { title }), 'success')
  else ui.notify(result.error, 'danger')
}

/** 格内重排：一次原子命令，只占一步撤销 */
function onModulesReorder(ref: CellRef, next: ModuleInstance[]): void {
  store.reorderModules(
    ref,
    next.map((module) => module.id),
  )
}

function modulesOf(row: Row, sideId: SideId): ModuleInstance[] {
  return row.cells[sideId]?.modules ?? []
}

/**
 * 演示视图下应该渲染的行：左右两格都没有可见模块时整行跳过，
 * 避免出现"空行把内容撑开"的观感问题。
 *
 * 注意：单个模块的"空/隐藏"判定在 CanvasRow 内（那里才有渲染细节），
 * 这里只做行级筛选——两处规则必须一致，因此都调用同一个 isPresentable。
 */
const visibleRows = computed<Row[]>(() => {
  if (!isReadonly.value) return rows.value
  return rows.value.filter((row) =>
    sides.value.some((side) => modulesOf(row, side.id).some((module) => isPresentable(module))),
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
    <div
      ref="canvasEl"
      class="canvas legacy-theme"
      :data-theme="accentTheme"
      :class="[backgroundClass, { 'canvas--bg-hidden': !drawPattern, 'canvas--bg-page': pageFill }]"
      :style="[canvasStyle, backgroundVars]"
    >
      <!--
        工具头**不再在这里自动绘制**（v0.5.0）。
        工具名卡片变成了普通的「标题」模块（modules/title），
        由模板/迁移放在第一行里——因此它能被拖动、折叠、删除，
        也能在任意行重新添加。画布这里再画一份就会变成两个工具头。
      -->

      <!-- 行列表：编辑态可拖拽排序，演示态是普通容器（只读） -->
      <VueDraggable
        v-if="!isReadonly && visibleRows.length > 0"
        :model-value="rows"
        class="canvas__rows"
        handle=".row__head"
        filter=".row__label-input, .row__tool, button, input, textarea, select, a"
        :prevent-on-filter="false"
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
            :show-numbers="showRowNumbers"
            :dimmed-side-ids="dimmedSideIds"
            :common-accent="commonAccent"
            @insert="insertRowAt"
            @add-common="openCommonPicker"
            @toggle-collapse="store.toggleRowCollapsed"
            @remove="removeRow"
            @relabel="onRelabel"
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
          :show-numbers="showRowNumbers"
          :dimmed-side-ids="dimmedSideIds"
          :common-accent="commonAccent"
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
      <!--
        中轴拖拽手柄已移除（v0.5.5，用户："删除工具之间的分界拖动的设计，
        实用性不强"）。它只在两侧宽度明显失衡时才有意义，而那份需求
        几乎不存在——反倒是一条压在内容上的竖线，还占着一个 Tab 焦点。
        两侧现在恒为等宽（见 .canvas__cells 的 grid 模板）。
      -->

      <div v-if="!isReadonly" class="canvas__footer">
        <button class="canvas__add-row" type="button" @click="store.addRow()">
          <AppIcon name="plus" :size="15" />
          {{ t('row.addRow') }}
        </button>
      </div>
    </div>

    <ModulePicker
      :open="picker !== null"
      :scope="pickerScope"
      @pick="onPickModule"
      @close="picker = null"
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
  /*
   * 背景底色（v0.5.3）。留空时这一层不生效，由外层容器的主题色负责——
   * 用 background-color 而不是覆盖 background，图案仍由 .canvas--bg-* 画。
   */
  background-color: var(--canvas-fill, transparent);
  border-radius: var(--radius-sm);
}

/*
 * 中轴拖拽手柄的样式已随功能一并移除（v0.5.5）。
 */

.canvas__rows {
  display: flex;
  flex-direction: column;
  /* 行距固定为紧凑档（v0.4.0 移除了密度选项） */
  gap: var(--sp-3);
  /* 第一行就是「标题」行，因此顶部留白仍然需要 */
  padding-top: var(--sp-6);
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

/* 密度三档已移除，行距固定在 .canvas__rows 里 */

/* —— 背景样式（对比配置里可切换） ——
 *
 * 图案的**密度**与**颜色**都走 CSS 变量（--bg-scale / --bg-tint）：
 * 这两个是连续量，枚举成类会爆炸。--bg-tint 留空时回落到主题自带的描边色，
 * 也就是"跟随主题"。
 *
 * .canvas--bg-hidden 用于"演示视图不显示背景"：图案是编辑器里的对齐辅助，
 * 出现在成稿里只会显脏。
 */
.canvas--bg-grid {
  background-image:
    linear-gradient(to right, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px),
    linear-gradient(to bottom, var(--bg-tint, var(--border-subtle)) 1px, transparent 1px);
  background-size: var(--bg-scale, 32px) var(--bg-scale, 32px);
}

.canvas--bg-dots {
  background-image: radial-gradient(var(--bg-tint, var(--border-default)) 1px, transparent 1px);
  background-size: var(--bg-scale, 20px) var(--bg-scale, 20px);
}

.canvas--bg-hidden {
  background-image: none;
}

/*
 * 图案充满整页：画布至少撑满滚动容器，于是网格/点阵一路铺到页面底部，
 * 而不是在最后一个模块下面戛然而止。
 */
.canvas--bg-page {
  min-height: 100%;
}
</style>
