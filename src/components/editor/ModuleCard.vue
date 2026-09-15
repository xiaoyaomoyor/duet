<script setup lang="ts">
/**
 * 模块卡片（编辑视图）
 *
 * 一张卡片承担三件事：
 *   1. 编辑：标题就地改写 + 模块自己的编辑器
 *   2. 预览：下方用**展示视图的渲染器**实时呈现效果（所见即所得）
 *   3. 操作：可见性切换、删除、拖拽手柄
 *
 * 渲染器与编辑器来自同一份注册表，因此新增模块类型时这里无需改动。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { getModule } from '@/modules/registry'
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
const titleEditing = ref(false)
const titleDraft = ref('')
const showOptions = ref(false)

function startTitleEdit(): void {
  if (props.readonly) return
  titleEditing.value = true
  titleDraft.value = props.module.title
}

function commitTitle(): void {
  const next = titleDraft.value.trim()
  titleEditing.value = false
  if (next && next !== props.module.title) emit('patch', { title: next })
}

const hasOptions = computed(() => (definition.value?.options?.length ?? 0) > 0)

/**
 * 转发给模块编辑器的写入回调。
 * 必须用函数包一层：模板的 prop 绑定位置不存在 `$event`，
 * 写 `:patch-data="emit('patchData', $event)"` 会被编译成对未定义变量的引用。
 */
function forwardData(patch: Record<string, unknown>): void {
  emit('patchData', patch)
}

function forwardProps(patch: Record<string, unknown>): void {
  emit('patchProps', patch)
}

/** 渲染器收到的 accent：让模块在左右两侧自动呈现各自的主题色（§11.3） */
const rendererProps = computed(() => ({
  module: props.module,
  sideId: props.sideId,
  accent: props.accent,
  readonly: false,
}))
</script>

<template>
  <article
    class="card"
    :class="{ 'card--hidden': module.hidden }"
    :style="{ '--accent': accent }"
  >
    <header class="card__head">
      <span v-if="draggable && !readonly" class="card__grip module-drag-handle" :title="t('module.dragHandle')">
        <AppIcon name="grip" :size="13" />
      </span>

      <AppIcon :name="definition?.meta.icon ?? 'text'" :size="13" class="card__icon" />

      <input
        v-if="titleEditing"
        v-model="titleDraft"
        class="card__title-input"
        type="text"
        autofocus
        :placeholder="t('module.titlePlaceholder')"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitle"
        @keydown.esc.prevent="titleEditing = false"
      />
      <button
        v-else
        class="card__title"
        type="button"
        :disabled="readonly"
        :title="t('module.titlePlaceholder')"
        @click="startTitleEdit"
      >
        {{ module.title }}
      </button>

      <span v-if="module.hidden" class="card__flag">{{ t('module.hiddenBadge') }}</span>

      <div v-if="!readonly" class="card__tools">
        <button
          v-if="hasOptions"
          class="card__tool"
          type="button"
          :class="{ 'card__tool--active': showOptions }"
          :title="t('module.options')"
          :aria-label="t('module.options')"
          :aria-pressed="showOptions"
          @click="showOptions = !showOptions"
        >
          <AppIcon name="settings" :size="13" />
        </button>
        <button
          class="card__tool"
          type="button"
          :title="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
          :aria-label="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
          :aria-pressed="module.hidden"
          @click="emit('patch', { hidden: !module.hidden })"
        >
          <AppIcon :name="module.hidden ? 'eye-off' : 'eye'" :size="13" />
        </button>
        <button
          class="card__tool"
          type="button"
          :title="t('module.duplicate')"
          :aria-label="t('module.duplicate')"
          @click="emit('duplicate')"
        >
          <AppIcon name="plus" :size="13" />
        </button>
        <button
          class="card__tool card__tool--danger"
          type="button"
          :title="t('module.remove')"
          :aria-label="t('module.remove')"
          @click="emit('remove')"
        >
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
    </header>

    <!-- 编辑器 -->
    <component
      :is="definition?.editor"
      v-if="definition"
      class="card__editor"
      :module="module"
      :side-id="sideId"
      :readonly="readonly === true"
      :patch-data="forwardData"
      :patch-props="forwardProps"
    />

    <!-- 选项（由模块定义的 options 驱动，通用渲染，无需每个模块自己写表单） -->
    <div v-if="showOptions && hasOptions && !readonly" class="card__options">
      <label v-for="option in definition?.options ?? []" :key="option.key" class="option">
        <span class="option__label">{{ t(option.labelKey) }}</span>

        <select
          v-if="option.type === 'select'"
          class="option__control"
          :value="module.props[option.key] ?? option.default"
          @change="emit('patchProps', { [option.key]: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="value in option.values ?? []" :key="String(value.value)" :value="value.value">
            {{ t(value.labelKey) }}
          </option>
        </select>

        <input
          v-else-if="option.type === 'boolean'"
          class="option__check"
          type="checkbox"
          :checked="module.props[option.key] !== false"
          @change="emit('patchProps', { [option.key]: ($event.target as HTMLInputElement).checked })"
        />

        <input
          v-else-if="option.type === 'number'"
          class="option__control"
          type="number"
          :min="option.min"
          :max="option.max"
          :step="option.step ?? 1"
          :value="module.props[option.key] ?? option.default"
          @change="emit('patchProps', { [option.key]: Number(($event.target as HTMLInputElement).value) })"
        />

        <input
          v-else
          class="option__control"
          type="text"
          :value="module.props[option.key] ?? option.default"
          @change="emit('patchProps', { [option.key]: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <!-- 实时预览：用展示视图的渲染器 -->
    <div class="card__preview">
      <span class="card__preview-label">{{ t('common.preview') }}</span>
      <component :is="definition?.renderer" v-if="definition" v-bind="rendererProps" />
    </div>
  </article>
</template>

<style scoped>
.card {
  padding: var(--sp-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent, var(--accent-500));
  border-radius: var(--radius-md);
  transition: opacity var(--dur-fast) var(--ease-out);
}

.card--hidden {
  opacity: 0.55;
}

.card__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-3);
}

.card__grip {
  cursor: grab;
  color: var(--text-disabled);
}

.card__grip:active {
  cursor: grabbing;
}

.card__icon {
  flex: none;
  color: var(--accent, var(--accent-500));
}

.card__title {
  min-width: 0;
  overflow: hidden;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__title:hover:not(:disabled) {
  color: var(--accent, var(--accent-500));
}

.card__title-input {
  flex: 1;
  min-width: 0;
  padding: 1px var(--sp-2);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
}

.card__flag {
  flex: none;
  padding: 0 6px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.card__tools {
  display: flex;
  flex: none;
  gap: 1px;
  margin-left: auto;
}

.card__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-disabled);
  border-radius: var(--radius-xs);
  transition: color var(--dur-fast) var(--ease-out);
}

.card__tool:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.card__tool--active {
  color: var(--accent, var(--accent-500));
  background: var(--accent-soft);
}

.card__tool--danger:hover {
  color: var(--danger);
}

.card__options {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-3);
  background: var(--bg-surface-2);
  border-radius: var(--radius-sm);
}

.option {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
}

.option__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.option__control {
  max-width: 160px;
  padding: 2px var(--sp-2);
  font-size: var(--fs-xs);
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
}

.option__check {
  accent-color: var(--accent-600);
}

.card__preview {
  padding-top: var(--sp-3);
  border-top: 1px dashed var(--border-subtle);
}

.card__preview-label {
  display: block;
  margin-bottom: var(--sp-2);
  font-size: 10px;
  color: var(--text-disabled);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
