<script setup lang="ts">
/**
 * 模块卡片（编辑视图）
 *
 * 设计（M6 起，按用户实测反馈重做）：
 *   卡片**就是最终效果**——内容和展示视图完全一致，因为两边用的是同一个
 *   `ModuleView`。编辑视图额外提供的只有右上角的四个按钮
 *   （编辑 / 隐藏 / 复制 / 删除）与左侧拖拽手柄，它们悬浮在内容之上，
 *   不占据版式空间，所以"编辑视图看到的样子"确实等于"成稿的样子"。
 *
 * 为什么把编辑器搬进弹窗：
 *   原先卡片里同时塞了编辑器 + 预览两块，等于每张卡片都要两倍高度，
 *   而且用户得在脑子里把"输入框里的内容"映射成"预览里的样子"。
 *   现在卡片直接呈现结果，需要改细节时再打开弹窗——
 *   版式立刻清爽，且所见即所得。
 *
 * 空模块例外：内容为空时没有东西可渲染，卡片会退化成"点击填写"的虚线框，
 * 否则用户将面对一个看不见也点不到的卡片。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import ModuleView from '@/components/compare/ModuleView.vue'
import ModuleEditorDialog from './ModuleEditorDialog.vue'
import { getModule } from '@/modules/registry'
import { isModuleEmpty } from '@/modules/visibility'
import type { ModuleInstance, SideId } from '@/types/project'

const props = defineProps<{
  module: ModuleInstance
  sideId: SideId
  accent: string
  /** 编辑器是否为只读（展示视图复用同一张卡片时用） */
  readonly?: boolean
  /** 是否显示拖拽手柄（展示视图不显示） */
  draggable?: boolean
}>()

const emit = defineEmits<{
  patch: [patch: { title?: string; hidden?: boolean }]
  patchData: [patch: Record<string, unknown>]
  patchProps: [patch: Record<string, unknown>]
  remove: []
  duplicate: []
}>()

const { t } = useI18n()

const definition = computed(() => getModule(props.module.type))
const editing = ref(false)

/**
 * 是否为空模块（**只看内容**，不看用户是否隐藏）。
 *
 * 必须与 `isPresentable` 区分开：隐藏但有内容的模块要照常显示内容，
 * 只是置灰 + 打角标；否则用户会以为自己的内容丢了。
 * 判定本身复用 `isModuleEmpty`，与展示视图同一套逻辑。
 */
const empty = computed(() => isModuleEmpty(props.module))

function forwardData(patch: Record<string, unknown>): void {
  emit('patchData', patch)
}

function forwardProps(patch: Record<string, unknown>): void {
  emit('patchProps', patch)
}
</script>

<template>
  <article class="card" :class="{ 'card--hidden': module.hidden }" :style="{ '--accent': accent }">
    <!-- 拖拽手柄：贴在左边缘，悬浮时才明显 -->
    <span
      v-if="draggable && !readonly"
      class="card__grip module-drag-handle"
      :title="t('module.dragHandle')"
    >
      <AppIcon name="grip" :size="13" />
    </span>

    <!-- 右上角操作区：悬浮或键盘聚焦时出现 -->
    <div v-if="!readonly" class="card__actions">
      <button
        class="card__action"
        type="button"
        :title="t('module.edit')"
        :aria-label="t('module.edit')"
        @click="editing = true"
      >
        <AppIcon name="edit" :size="14" />
      </button>
      <button
        class="card__action"
        type="button"
        :title="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
        :aria-label="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
        :aria-pressed="module.hidden"
        :class="{ 'card__action--on': module.hidden }"
        @click="emit('patch', { hidden: !module.hidden })"
      >
        <AppIcon :name="module.hidden ? 'eye-off' : 'eye'" :size="14" />
      </button>
      <button
        class="card__action"
        type="button"
        :title="t('module.duplicate')"
        :aria-label="t('module.duplicate')"
        @click="emit('duplicate')"
      >
        <AppIcon name="copy" :size="14" />
      </button>
      <button
        class="card__action card__action--danger"
        type="button"
        :title="t('module.remove')"
        :aria-label="t('module.remove')"
        @click="emit('remove')"
      >
        <AppIcon name="trash" :size="14" />
      </button>
    </div>

    <!--
      有内容时走 ModuleView 的默认正文（就是展示视图那套渲染）；
      空模块时用 #body 插槽换成"点击填写"的占位框——
      标题仍然由 ModuleView 渲染，两种状态下的标题结构因此完全一致。
    -->
    <ModuleView :module="module" :side-id="sideId" :accent="accent" :readonly="false">
      <template v-if="empty" #body>
        <button class="card__empty" type="button" :disabled="readonly" @click="editing = true">
          <AppIcon :name="definition?.meta.icon ?? 'text'" :size="15" />
          <span class="card__empty-hint">{{ t('module.clickToFill') }}</span>
        </button>
      </template>
    </ModuleView>

    <span v-if="module.hidden" class="card__flag">{{ t('module.hiddenBadge') }}</span>

    <ModuleEditorDialog
      :open="editing"
      :module="module"
      :side-id="sideId"
      :accent="accent"
      @close="editing = false"
      @patch="(patch) => emit('patch', patch)"
      @patch-data="forwardData"
      @patch-props="forwardProps"
    />
  </article>
</template>

<style scoped>
.card {
  position: relative;
  padding: var(--sp-3);
  padding-left: calc(var(--sp-3) + 6px);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent, var(--accent-500));
  border-radius: var(--radius-md);
  transition:
    opacity var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.card:hover {
  border-color: var(--border-default);
  border-left-color: var(--accent, var(--accent-500));
}

.card--hidden {
  opacity: 0.55;
}

/* —— 拖拽手柄 —— */
.card__grip {
  position: absolute;
  top: 50%;
  left: 3px;
  display: flex;
  color: var(--text-disabled);
  cursor: grab;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--dur-fast) var(--ease-out);
}

.card:hover .card__grip,
.card__grip:focus-visible {
  opacity: 1;
}

.card__grip:active {
  cursor: grabbing;
}

/* —— 右上角操作区 —— */
.card__actions {
  position: absolute;
  top: var(--sp-1);
  right: var(--sp-1);
  z-index: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  /*
   * 默认隐藏、悬浮或键盘聚焦时出现。
   * 用 opacity 而不是 display/visibility：后者会让按钮无法成为
   * Tab 焦点，键盘用户就永远打不开编辑弹窗了。
   */
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.card:hover .card__actions,
.card:focus-within .card__actions {
  opacity: 1;
}

.card__action {
  display: flex;
  padding: var(--sp-1);
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.card__action:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.card__action--on,
.card__action--danger:hover {
  color: var(--danger);
}

/* —— 空模块占位 —— */
.card__empty {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-4) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.card__empty:hover:not(:disabled) {
  color: var(--text-secondary);
  border-color: var(--accent, var(--accent-500));
}

.card__empty-hint {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.card__flag {
  position: absolute;
  top: var(--sp-1);
  left: var(--sp-3);
  padding: 1px 6px;
  font-size: 10px;
  color: var(--warning);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}
</style>
