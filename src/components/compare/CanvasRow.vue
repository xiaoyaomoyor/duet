<script setup lang="ts">
/**
 * 对比行（左右两格 + 行头）
 *
 * 抽出为独立组件的原因：
 *   1. CompareCanvas 在 M2 后已有 500 行，行内逻辑再堆下去会失控
 *   2. 展示视图与编辑视图共用同一套"格 → 模块"渲染规则，
 *      只有交互（拖拽、增删、编辑器）不同，用 readonly 开关区分
 *   3. §7.5 的左右对齐由这里的同一网格行保证，改动集中在一处
 *
 * 展示态规则（§7.4）由本组件落实：
 *   空模块不渲染、手动隐藏的不渲染、整行都没有可见模块时整行跳过。
 */
import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import ModuleCard from '@/components/editor/ModuleCard.vue'
import ModuleView from '@/components/compare/ModuleView.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { isPresentable } from '@/modules/visibility'
import { hexToSoft } from '@/lib/color'
import type { CellRef, ModuleInstance, ModuleRef, Row, Side, SideId } from '@/types/project'

const props = defineProps<{
  row: Row
  rowIndex: number
  sides: readonly Side[]
  /** 只读（展示视图）：不渲染编辑器、不允许拖拽与增删 */
  readonly?: boolean
  /** 所属项目 id（音频模块登记同步音轨时需要） */
  projectId?: string
  /** 是否在行与模块的左上角显示序号（对比配置里的开关） */
  showNumbers?: boolean
  /** 聚光灯"色彩弱化"要压暗的侧 */
  dimmedSideIds?: readonly string[]
}>()

/**
 * 把 projectId 透传给模块渲染器。
 *
 * 为什么用 provide 而不是 props：projectId 只被"音频/视频模块"用到，
 * 而模块渲染器的 props 契约（ModuleRendererProps）是对所有模块统一的，
 * 为一个模块加字段会污染全部模块。provide/inject 更适合这种旁路信息。
 */
provide('duet:projectId', computed(() => props.projectId ?? ''))

const emit = defineEmits<{
  insert: [index: number]
  /** 在指定位置新建一个通用模块行（横跨两栏） */
  addCommon: [index: number]
  /** 折叠 / 展开该行（只有编辑视图会发；展示视图是本地临时覆盖） */
  toggleCollapse: [rowId: string]
  remove: [row: Row]
  /** 行标题变化（与模块无关，单独一个事件，避免复用 patchModule 造成语义混乱） */
  relabel: [rowId: string, label: string]
  /** 行高变化；undefined 表示恢复默认（双击手柄） */
  resizeHeight: [rowId: string, height: number | undefined]
  openPicker: [row: Row, sideId: SideId]
  reorderModules: [ref: CellRef, next: ModuleInstance[]]
  patchModule: [ref: ModuleRef, patch: { title?: string; hidden?: boolean }]
  patchData: [ref: ModuleRef, patch: Record<string, unknown>]
  patchProps: [ref: ModuleRef, patch: Record<string, unknown>]
  removeModule: [ref: ModuleRef]
  duplicateModule: [ref: ModuleRef]
}>()

const { t } = useI18n()

const isReadonly = computed(() => props.readonly === true)

// ——————————————————————————————————————————————————————————
// 行高拖拽
// ——————————————————————————————————————————————————————————

/** 行内容区默认最小高度（与 tokens 的密度设置无关，取一个够看的基线） */
const DEFAULT_ROW_HEIGHT = 96
const MIN_ROW_HEIGHT = 60
const MAX_ROW_HEIGHT = 2000

const cellsEl = ref<HTMLElement | null>(null)
const resizing = ref(false)
let startY = 0
let startHeight = 0

function onHeightResizeStart(event: PointerEvent): void {
  startY = event.clientY
  // 以当前实际渲染高度为起点，而不是 row.height——
  // 内容比 height 高时两者不同，用后者会让第一次拖动"跳"一下
  startHeight = cellsEl.value?.offsetHeight ?? props.row.height ?? DEFAULT_ROW_HEIGHT
  resizing.value = true
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
}

function onHeightResizeMove(event: PointerEvent): void {
  if (!resizing.value) return
  event.preventDefault()

  const next = Math.round(
    Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, startHeight + (event.clientY - startY))),
  )
  emit('resizeHeight', props.row.id, next)
}

function onHeightResizeEnd(event: PointerEvent): void {
  if (!resizing.value) return
  resizing.value = false
  ;(event.target as HTMLElement).releasePointerCapture?.(event.pointerId)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

/** 键盘可达：上下方向键微调 */
function onHeightResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 40 : 12
  const current = props.row.height ?? cellsEl.value?.offsetHeight ?? DEFAULT_ROW_HEIGHT
  if (event.key === 'ArrowUp') emit('resizeHeight', props.row.id, Math.max(MIN_ROW_HEIGHT, current - step))
  else if (event.key === 'ArrowDown') emit('resizeHeight', props.row.id, Math.min(MAX_ROW_HEIGHT, current + step))
  else return
  event.preventDefault()
}

function modulesOf(sideId: SideId): ModuleInstance[] {
  return props.row.cells[sideId]?.modules ?? []
}

/**
 * 该行是不是「通用模块行」（横跨左右两栏）。
 *
 * 通用模块的数据存在**第一侧**的格子里（`cells[sides[0].id]`），
 * `kind: 'full'` 只是告诉渲染层"别分栏"。
 * 这样做的原因：`cells` 的类型是 `Record<SideId, Cell>`，
 * 为通用行另造一个存储位置会让命令层、校验、导出全都多一条分支；
 * 而复用第一侧的格子则一行命令都不用改。
 */
const isFullRow = computed(() => props.row.kind === 'full')

/** 实际参与渲染的"格"：通用行只有一个 */
const renderSides = computed(() => (isFullRow.value ? props.sides.slice(0, 1) : props.sides))

/**
 * 展示视图下该格应渲染的模块（§7.4 三态规则的落点）。
 *
 *   空模块（isEmpty）→ 不渲染
 *   手动隐藏（hidden）→ 不渲染
 *   其余 → 渲染
 */
function presentModules(sideId: SideId): ModuleInstance[] {
  return modulesOf(sideId).filter((module) => isPresentable(module))
}

function cellRef(sideId: SideId): CellRef {
  return { rowId: props.row.id, sideId }
}

function moduleRef(sideId: SideId, moduleId: string): ModuleRef {
  return { rowId: props.row.id, sideId, moduleId }
}

/** 行序号从 1 开始（给用户看的，不是数组下标） */
const rowNumber = computed(() => props.rowIndex + 1)

/**
 * 模块的子序号，形如 `2.2`（第 2 行第 2 个模块）。
 *
 * 编号在**每一侧内部各自从 1 开始**，而不是左右连续排下去：
 * 左右两栏是同一道题的两个答案，2.1 在左边和右边指的是同一个维度，
 * 连续编号会让"左边的 2.3 对应右边的 2.4"这种误解变得很难解释。
 */
function moduleNumber(sideId: SideId, moduleId: string): string {
  const index = modulesOf(sideId).findIndex((module) => module.id === moduleId)
  return `${rowNumber.value}.${index + 1}`
}

function isDimmed(sideId: SideId): boolean {
  return props.dimmedSideIds?.includes(sideId) === true
}

// ——————————————————————————————————————————————————————————
// 折叠
// ——————————————————————————————————————————————————————————

/**
 * 展示视图里的临时折叠覆盖。
 *
 * 编辑视图的折叠是**数据**（`row.collapsed`，走命令层、可撤销、会保存）；
 * 展示视图的折叠是**演示动作**，不该反过来改掉这份对比，
 * 所以只记在组件本地的集合里，离开展示视图自然失效。
 */
const localCollapsed = ref<Set<string>>(new Set())

const isCollapsed = computed(() => {
  if (isReadonly.value) {
    return localCollapsed.value.has(props.row.id) ? !props.row.collapsed : props.row.collapsed
  }
  return props.row.collapsed
})

function toggleCollapse(): void {
  if (isReadonly.value) {
    const next = new Set(localCollapsed.value)
    if (next.has(props.row.id)) next.delete(props.row.id)
    else next.add(props.row.id)
    localCollapsed.value = next
    return
  }
  emit('toggleCollapse', props.row.id)
}

function cellStyle(side: Side): Record<string, string> {
  /*
   * 通用行不属于任何一侧，因此不套用某一边的主题色（否则会误导"这是左边的"）。
   *
   * 注意这里**不写** --accent-soft：留空即可回落到 :root 上那层主题紫的淡底。
   * 早先版本把它设成 transparent，结果通用行里的卡片背景被叠成完全透明，
   * 与两侧的卡片一眼就能看出不是同一种东西。
   */
  if (isFullRow.value) {
    return { '--accent': 'var(--accent-500)' }
  }
  return { '--accent': side.accent, '--accent-soft': hexToSoft(side.accent, 8) }
}

/** 展示视图下，该行是否整行跳过 */
const rowHasContent = computed(() =>
  props.sides.some((side) => presentModules(side.id).length > 0),
)

defineExpose({ rowHasContent })
</script>

<template>
  <!--
    canvas__row / canvas__cell 是**对外契约类名**：
    E2E 与将来的只读导出都按它们定位，因此内部重构不得改名。
    组件自身的样式类（row__*）与之并存，前者管结构、后者管外观。
  -->
  <div
    v-if="!isReadonly || rowHasContent"
    class="row canvas__row"
    :data-row="row.id"
  >
    <!-- 行头：编辑态可拖拽/命名/增删 -->
    <div v-if="!isReadonly" class="row__head">
      <!--
        折叠开关：在序号的**左边**（用户指定）。
        放这里而不是右侧工具区，是因为"这一行整体收起来"作用于整行，
        应该紧挨着行号这个"行的标识"，而不是混在增删按钮里。
      -->
      <button
        class="row__tool row__collapse"
        type="button"
        :title="isCollapsed ? t('row.expand') : t('row.collapse')"
        :aria-label="isCollapsed ? t('row.expand') : t('row.collapse')"
        :aria-expanded="!isCollapsed"
        @click="toggleCollapse"
      >
        <AppIcon :name="isCollapsed ? 'chevron-right' : 'chevron-down'" :size="13" />
      </button>

      <!-- 行序号：在整行的左上角，与模块的子序号（2.1 / 2.2）形成层级 -->
      <span v-if="showNumbers" class="row__number">{{ rowNumber }}</span>

      <span class="row-drag-handle row__grip" :title="t('row.moveRow')">
        <AppIcon name="grip" :size="13" />
      </span>

      <input
        class="row__label-input"
        type="text"
        :value="row.label ?? ''"
        :placeholder="t('row.labelPlaceholder')"
        @change="emit('relabel', row.id, ($event.target as HTMLInputElement).value)"
      />

      <div class="row__tools">
        <!--
          「在上方插入行」用插入类图标（↤ 带加号意味的 insert），
          而**不再用纯加号**——纯加号另有用途：添加通用模块。
          两者都是"加东西"，但加的对象完全不同，图标必须能区分。
        -->
        <button
          class="row__tool"
          type="button"
          :title="t('row.insertAbove')"
          :aria-label="t('row.insertAbove')"
          @click="emit('insert', rowIndex)"
        >
          <AppIcon name="insertRow" :size="13" />
        </button>
        <!-- 加号：在本行下方新建一个「通用模块行」（横跨两栏） -->
        <button
          class="row__tool"
          type="button"
          :title="t('row.addCommon')"
          :aria-label="t('row.addCommon')"
          @click="emit('addCommon', rowIndex + 1)"
        >
          <AppIcon name="plus" :size="12" />
        </button>
        <button
          class="row__tool row__tool--danger"
          type="button"
          :title="t('row.deleteRow')"
          :aria-label="t('row.deleteRow')"
          @click="emit('remove', row)"
        >
          <AppIcon name="trash" :size="12" />
        </button>
      </div>
    </div>

    <!-- 行标题行：展示态下承载折叠开关、序号与标题 -->
    <div v-if="isReadonly" class="row__label-row">
      <!--
        展示视图里也能折叠 / 展开（用户要求）。
        但这里**不写工程数据**：演示时随手收几行是"讲给别人看"的动作，
        不该反过来改掉这份对比本身——所以只是本次会话内的临时覆盖。
        编辑视图里的折叠才是持久的、可撤销的。
      -->
      <button
        class="row__tool row__collapse no-export"
        type="button"
        :title="isCollapsed ? t('row.expand') : t('row.collapse')"
        :aria-label="isCollapsed ? t('row.expand') : t('row.collapse')"
        :aria-expanded="!isCollapsed"
        @click="toggleCollapse"
      >
        <AppIcon :name="isCollapsed ? 'chevron-right' : 'chevron-down'" :size="13" />
      </button>
      <span v-if="showNumbers" class="row__number">{{ rowNumber }}</span>
      <span v-if="row.label" class="row__label">{{ row.label }}</span>
    </div>

    <!--
      行高拖拽手柄：贴在行内容区的下边缘。
      语义是**最小高度**而不是固定高度（见 Row.height 的说明），
      内容更高时行仍然会长高，所以这里只写 min-height。
    -->
    <div
      v-if="!isReadonly"
      class="row__height-handle u-split u-split--h"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="t('row.resizeHeight')"
      tabindex="0"
      @pointerdown="onHeightResizeStart"
      @pointermove="onHeightResizeMove"
      @pointerup="onHeightResizeEnd"
      @pointercancel="onHeightResizeEnd"
      @dblclick="emit('resizeHeight', row.id, undefined)"
      @keydown="onHeightResizeKeydown"
    />

    <!--
      折叠之后**只剩标题那一行**（用户要求）：
      内容区整块 v-show 收起——用 v-show 而不是 v-if，
      因为音频/视频元素一旦被销毁重挂，播放状态与同步登记都会丢。
    -->
    <div
      v-show="!isCollapsed"
      ref="cellsEl"
      class="row__cells canvas__cells"
      :class="{ 'row__cells--full': isFullRow }"
      :style="row.height ? { minHeight: `${row.height}px` } : undefined"
    >
      <div
        v-for="side in renderSides"
        :key="side.id"
        class="row__cell canvas__cell"
        :class="{ 'row__cell--dimmed': isDimmed(side.id) }"
        :style="cellStyle(side)"
      >
        <!-- 展示态：只渲染非空且未隐藏的模块 -->
        <template v-if="isReadonly">
          <!--
            A1 双侧同步入场：每个模块包一层，按行内序号做 60ms 交错。
            放在这里而不是各模块内部，是为了让"新增模块忘记加入场动效"
            这件事在结构上不可能发生。
          -->
          <div
            v-for="(module, index) in presentModules(side.id)"
            :key="module.id"
            class="row__module anim-enter-up"
            :style="{ animationDelay: `${Math.min(index, 6) * 60}ms` }"
          >
            <!--
              与编辑视图共用 ModuleView：这样"编辑视图看到的样子 == 成稿的样子"
              是结构上的保证，而不是靠两边各自维护同一套模板。
            -->
            <ModuleView
              :module="module"
              :side-id="side.id"
              :accent="side.accent"
              :number="showNumbers ? moduleNumber(side.id, module.id) : undefined"
              readonly
            />
          </div>
        </template>

        <!--
          编辑态：可拖拽排序的模块卡片。
          整张卡片都可以拖（不再要求抓住左侧那个小手柄），
          但按钮/输入框/链接这些**交互元素**必须排除，
          否则点"编辑"会变成拖拽（filter + preventOnFilter）。
        -->
        <VueDraggable
          v-else
          :model-value="modulesOf(side.id)"
          class="row__modules"
          group="duet-modules"
          filter=".card__actions, .card__empty, button, input, textarea, select, a, audio, video, [contenteditable='true']"
          :prevent-on-filter="true"
          :animation="180"
          ghost-class="module-ghost"
          @update:model-value="(next: ModuleInstance[]) => emit('reorderModules', cellRef(side.id), next)"
        >
          <ModuleCard
            v-for="module in modulesOf(side.id)"
            :key="module.id"
            :module="module"
            :side-id="side.id"
            :accent="side.accent"
            :number="showNumbers ? moduleNumber(side.id, module.id) : undefined"
            draggable
            @patch="(patch) => emit('patchModule', moduleRef(side.id, module.id), patch)"
            @patch-data="(patch) => emit('patchData', moduleRef(side.id, module.id), patch)"
            @patch-props="(patch) => emit('patchProps', moduleRef(side.id, module.id), patch)"
            @remove="emit('removeModule', moduleRef(side.id, module.id))"
            @duplicate="emit('duplicateModule', moduleRef(side.id, module.id))"
          />
        </VueDraggable>

        <div v-if="!isReadonly" class="row__actions canvas__cell-actions">
          <button
            class="row__add-module canvas__add-module"
            type="button"
            @click="emit('openPicker', row, side.id)"
          >
            <AppIcon name="plus" :size="13" />
            {{ t('module.addModule') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  padding: var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.row:hover {
  border-color: var(--border-subtle);
}

.row__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-3);
}

.row__grip {
  cursor: grab;
  color: var(--text-disabled);
}

.row__grip:active {
  cursor: grabbing;
}

/*
 * 行序号：整行左上角，与模块的子序号（2.1 / 2.2）形成层级。
 * 用等宽字体 + 固定最小宽度，序号从 9 变 10 时行头不会抖一下。
 */
.row__number {
  flex: none;
  min-width: 18px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: right;
}

/* 展示态的序号与行标题排在同一行 */
.row__label-row {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-2);
}

/*
 * 折叠开关。
 * 展示态下它必须够"轻"：成稿里出现一个突兀的控件会很吵，
 * 但用户又要求能在演示时随手收几行，所以保留可见、只压低调门。
 */
.row__collapse {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.row__collapse:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.row__label-row .row__collapse {
  opacity: 0.55;
}

.row__label-row:hover .row__collapse,
.row__label-row .row__collapse:focus-visible {
  opacity: 1;
}

/*
 * 聚光灯「色彩弱化」：没在播放的一侧整体退到后面去。
 *
 * 用 opacity + saturate 而不是直接盖一层半透明遮罩：
 * 遮罩会连内容一起糊掉，而我们要的是"更低调"，不是"看不清"。
 * 过渡时长与动效体系里的 --dur-slow 对齐，避免切换时突兀。
 */
.row__cell--dimmed {
  opacity: 0.35;
  filter: saturate(0.35);
  transition:
    opacity var(--dur-slow) var(--ease-out),
    filter var(--dur-slow) var(--ease-out);
}

.row__label-input {
  flex: 1;
  min-width: 0;
  padding: 2px var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: transparent;
  border: 1px dashed transparent;
  border-radius: var(--radius-xs);
}

.row__label-input:hover,
.row__label-input:focus {
  background: var(--bg-surface-2);
  border-color: var(--border-default);
  outline: none;
}

.row__tools {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.row:hover .row__tools {
  opacity: 1;
}

.row__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
}

.row__tool:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.row__tool--danger:hover {
  color: var(--danger);
}

.row__label {
  width: fit-content;
  padding: 1px 10px;
  margin: 0 auto var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

/* §7.5：左右两格由同一网格行承载，因此天然顶部对齐 */
.row__cells {
  position: relative;
  display: grid;
  grid-template-columns: var(--col-a, 1fr) var(--col-b, 1fr);
  gap: var(--canvas-gutter, 32px);
  align-items: start;
}

/* 通用模块行：只有一格，横跨两栏（宽度比在整行内容面前没有意义） */
.row__cells--full {
  grid-template-columns: 1fr;
}

/*
 * 行高拖拽手柄：横跨整行、贴在下边缘。
 * 抓取高度与"看得见的那条线"由 .u-split--h 统一提供（抓取 10px、线 3px），
 * 与中轴、左栏、对比配置四条线用同一份实现。
 */
.row__height-handle {
  margin: 0 calc(var(--sp-2) * -1);
}

.row__cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.row__modules {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 8px;
}

/* 展示态的模块容器：只负责入场动效与间距，不引入额外视觉 */
.row__module {
  min-width: 0;
}

.module-ghost {
  opacity: 0.4;
}

.row__actions {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.row__add-module {
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

.row__add-module:hover {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}
</style>
