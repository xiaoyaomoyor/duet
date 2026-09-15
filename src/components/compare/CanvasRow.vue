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
import { computed, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import ModuleCard from '@/components/editor/ModuleCard.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { getModule } from '@/modules/registry'
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
  remove: [row: Row]
  /** 行标题变化（与模块无关，单独一个事件，避免复用 patchModule 造成语义混乱） */
  relabel: [rowId: string, label: string]
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

function modulesOf(sideId: SideId): ModuleInstance[] {
  return props.row.cells[sideId]?.modules ?? []
}

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

function cellStyle(side: Side): Record<string, string> {
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
        <button
          class="row__tool"
          type="button"
          :title="t('row.insertAbove')"
          :aria-label="t('row.insertAbove')"
          @click="emit('insert', rowIndex)"
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

    <!-- 行标题：展示态是静态胶囊 -->
    <div v-if="isReadonly && row.label" class="row__label">{{ row.label }}</div>

    <div class="row__cells canvas__cells">
      <div
        v-for="side in sides"
        :key="side.id"
        class="row__cell canvas__cell"
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
            <component
              :is="getModule(module.type)?.renderer"
              :module="module"
              :side-id="side.id"
              :accent="side.accent"
              :readonly="true"
            />
          </div>
        </template>

        <!-- 编辑态：可拖拽排序的模块卡片 -->
        <VueDraggable
          v-else
          :model-value="modulesOf(side.id)"
          class="row__modules"
          handle=".module-drag-handle"
          group="duet-modules"
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--canvas-gutter, 32px);
  align-items: start;
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
