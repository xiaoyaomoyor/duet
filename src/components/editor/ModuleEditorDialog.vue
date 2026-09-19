<script setup lang="ts">
/**
 * 模块编辑弹窗
 *
 * 编辑视图的卡片现在"就是最终效果 + 几个按钮"，所有细节调整收敛到这里：
 *   ① 标题（清空即不显示标题）
 *   ② 模块自己的内容编辑器（来自注册表，通用接入）
 *   ③ 呈现选项（由模块定义的 options 驱动，同样是通用的）
 *
 * 刻意不做成确认框语义：这里的每一次修改都**立即写回并自动保存**，
 * 没有"取消"的概念——底部只有一个"完成"。做成 确定/取消 会骗用户，
 * 因为中途的改动其实已经落库了。
 *
 * M7 紧凑化（用户实测反馈"编辑窗口太长，一屏放不下，每次都要滚"）：
 *   1. 三块内容都能**折叠**。长弹窗的滚动成本主要来自"我已经改完了的那一块
 *      还在占着半屏"，折叠把它交给用户自己决定。
 *   2. 标题选项那一排用**并排 + 一排多个**：标题、各选项都是单行小控件，
 *      原来一行一个、每行还带一段说明，六行才放得下三个下拉框。
 *      现在标题独占一行（它需要宽度），选项走自适应多列网格。
 *   3. 模块自己的编辑器保持**整宽**不参与并排——图集、参数表、代码对比
 *      这类编辑器都需要横向空间，挤成半屏只会让人更想滚。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { getModule } from '@/modules/registry'
import type { ModuleInstance, SideId } from '@/types/project'
import type { ModuleOption } from '@/modules/types'

const props = defineProps<{
  open: boolean
  module: ModuleInstance
  sideId: SideId
  accent: string
  options?: ModuleOption[]
  stage?: boolean
}>()

const emit = defineEmits<{
  close: []
  patch: [patch: { title?: string }]
  patchData: [patch: Record<string, unknown>]
  patchProps: [patch: Record<string, unknown>]
}>()

const { t } = useI18n()

const definition = computed(() => getModule(props.module.type))
const options = computed(() => props.options ?? definition.value?.options ?? [])
const hasOptions = computed(() => options.value.length > 0)
/** 该模块的编辑器要整幅宽度（自己就是双列的那种，如「标题」模块） */
const editorWide = computed(() => definition.value?.editorWide === true)

/**
 * 各分块的展开状态。
 *
 * 默认全开：折叠是"我觉得这块看够了"之后的动作，
 * 一进来就藏起来会让用户以为功能没了。状态跨次打开保留，
 * 因为"我每次都不看选项"这件事在一次会话里通常是稳定的。
 */
const sections = reactive({ basics: true, content: true, options: true })

function toggleSection(key: keyof typeof sections): void {
  sections[key] = !sections[key]
}

/** 标题用本地草稿 + 失焦提交：避免每敲一个字都进一次撤销栈 */
const titleDraft = ref('')
const dialogRoot = ref<HTMLElement | null>(null)
useModalFocus(dialogRoot, close)

watch(
  () => [props.open, props.module.title] as const,
  ([open]) => {
    if (open) titleDraft.value = props.module.title
  },
  { immediate: true },
)

function commitTitle(): void {
  const next = titleDraft.value.trim()
  if (next !== props.module.title) emit('patch', { title: next })
}

function forwardData(patch: Record<string, unknown>): void {
  emit('patchData', patch)
}

function forwardProps(patch: Record<string, unknown>): void {
  emit('patchProps', patch)
}

function close(): void {
  commitTitle()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" role="presentation" @click.self="close">
      <div
        ref="dialogRoot"
        class="editor-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('module.editTitle', { title: module.title || t('module.untitled') })"
        :style="{ '--accent': accent }"
        tabindex="-1"
      >
        <header class="editor-dialog__head">
          <AppIcon :name="definition?.meta.icon ?? 'text'" :size="16" class="editor-dialog__icon" />
          <h2 class="editor-dialog__title">
            {{ t('module.editTitle', { title: module.title || t('module.untitled') }) }}
          </h2>
          <button
            class="editor-dialog__close"
            type="button"
            :aria-label="t('common.close')"
            @click="
              () => {
                commitTitle()
                emit('close')
              }
            "
          >
            <AppIcon name="close" :size="15" />
          </button>
        </header>

        <div class="editor-dialog__body" :class="{ 'editor-dialog__body--wide': editorWide }">
          <!-- ① 基本：标题（双列布局里落在右列上） -->
          <p v-if="stage && module.type === 'title'" class="editor-dialog__stage-note">
            {{ t('studio.compatibilityHint') }}
          </p>
          <section class="sec sec--basics">
            <button
              class="sec__head"
              type="button"
              :aria-expanded="sections.basics"
              @click="toggleSection('basics')"
            >
              <AppIcon
                name="chevron-down"
                :size="14"
                class="sec__caret"
                :class="{ 'sec__caret--folded': !sections.basics }"
              />
              <span class="sec__title">{{ t('module.sectionBasics') }}</span>
            </button>

            <div v-show="sections.basics" class="sec__body">
              <label class="field">
                <span class="field__label">{{ t('module.titleLabel') }}</span>
                <input
                  data-modal-autofocus
                  v-model="titleDraft"
                  class="field__control dialog__title-input"
                  type="text"
                  :placeholder="t('module.titlePlaceholder')"
                  @blur="commitTitle"
                  @keydown.enter.prevent="commitTitle"
                />
              </label>
              <p class="field__hint">{{ t('module.titleHint') }}</p>
            </div>
          </section>

          <!-- ② 内容：模块自己的编辑器，占左列并跨两行（它是最需要宽度的那一块） -->
          <section class="sec sec--content">
            <button
              class="sec__head"
              type="button"
              :aria-expanded="sections.content"
              @click="toggleSection('content')"
            >
              <AppIcon
                name="chevron-down"
                :size="14"
                class="sec__caret"
                :class="{ 'sec__caret--folded': !sections.content }"
              />
              <span class="sec__title">{{ t('module.sectionContent') }}</span>
            </button>

            <div v-show="sections.content" class="sec__body">
              <component
                :is="definition?.editor"
                v-if="definition"
                :module="module"
                :side-id="sideId"
                :readonly="false"
                :patch-data="forwardData"
                :patch-props="forwardProps"
              />
            </div>
          </section>

          <!-- ③ 呈现选项：由模块定义的 options 驱动，自适应多列 -->
          <section v-if="hasOptions" class="sec sec--options">
            <button
              class="sec__head"
              type="button"
              :aria-expanded="sections.options"
              @click="toggleSection('options')"
            >
              <AppIcon
                name="chevron-down"
                :size="14"
                class="sec__caret"
                :class="{ 'sec__caret--folded': !sections.options }"
              />
              <span class="sec__title">{{ t('module.options') }}</span>
            </button>

            <div v-show="sections.options" class="sec__body">
              <!--
                一排多个：选项都是"标签 + 一个控件"的窄行，
                排成自适应网格后六行缩成两三行，且不必为每个选项留整行。
              -->
              <div class="options">
                <label v-for="option in options" :key="option.key" class="option">
                  <span class="option__label">{{ t(option.labelKey) }}</span>

                  <select
                    v-if="option.type === 'select'"
                    class="option__control"
                    :value="module.props[option.key] ?? option.default"
                    @change="
                      emit('patchProps', {
                        [option.key]: ($event.target as HTMLSelectElement).value,
                      })
                    "
                  >
                    <option
                      v-for="value in option.values ?? []"
                      :key="String(value.value)"
                      :value="value.value"
                    >
                      {{ t(value.labelKey) }}
                    </option>
                  </select>

                  <input
                    v-else-if="option.type === 'boolean'"
                    class="option__check"
                    type="checkbox"
                    :checked="module.props[option.key] !== false"
                    @change="
                      emit('patchProps', {
                        [option.key]: ($event.target as HTMLInputElement).checked,
                      })
                    "
                  />

                  <input
                    v-else-if="option.type === 'number'"
                    class="option__control"
                    type="number"
                    :min="option.min"
                    :max="option.max"
                    :step="option.step ?? 1"
                    :value="module.props[option.key] ?? option.default"
                    @change="
                      emit('patchProps', {
                        [option.key]: Number(($event.target as HTMLInputElement).value),
                      })
                    "
                  />

                  <input
                    v-else
                    class="option__control"
                    type="text"
                    :value="module.props[option.key] ?? option.default"
                    @change="
                      emit('patchProps', {
                        [option.key]: ($event.target as HTMLInputElement).value,
                      })
                    "
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <footer class="editor-dialog__foot">
          <span class="editor-dialog__autosave">{{ t('module.autosaveNote') }}</span>
          <button class="btn btn--primary" type="button" @click="emit('close')">
            {{ t('common.done') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6);
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
}

.editor-dialog {
  display: flex;
  flex-direction: column;
  /* 双列布局需要更宽：920px 下左列约 480px、右列约 380px */
  width: min(920px, 100%);
  max-height: min(760px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  animation: duet-pop-in var(--dur-base) var(--ease-spring) both;
}

/* 编辑器自己就是双列时，弹窗要更宽，否则它那一列的每一半都会很窄 */
.editor-dialog:has(.editor-dialog__body--wide) {
  width: min(1040px, 100%);
}

.editor-dialog__head {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--border-subtle);
}

.editor-dialog__icon {
  color: var(--accent, var(--accent-500));
}

.editor-dialog__title {
  flex: 1;
  overflow: hidden;
  font-size: var(--fs-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-dialog__close {
  flex: none;
  padding: var(--sp-1);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: color var(--dur-fast) var(--ease-out);
}

.editor-dialog__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* 内容区独立滚动：模块编辑器可能很长（图集、参数表、代码对比） */
.editor-dialog__body {
  display: grid;
  flex: 1;
  /*
   * 双列布局（M9 按实测反馈"内部使用双列布局，使整体更加紧凑"）。
   *
   * 分工不是平均分：左列给**模块自己的编辑器**（图集、参数表、代码对比
   * 都需要横向空间，所以给 1.25fr 并跨两行）；右列放**标题与选项**
   * 这类单行小控件，1fr 足够，堆在一起也不再各占一整屏。
   *
   * 窄屏（<880px）自动退回单列，见下面的媒体查询——那时两列都会挤成
   * 一条窄缝，反而比单列更难用。
   */
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: var(--sp-4) var(--sp-5);
  align-items: start;
  padding: var(--sp-4) var(--sp-5);
  overflow-y: auto;
}

.sec--content {
  grid-row: 1 / span 2;
  grid-column: 1;
}

.sec--basics {
  grid-row: 1;
  grid-column: 2;
}

.sec--options {
  grid-row: 2;
  grid-column: 2;
}

/*
 * 编辑器的内容块整幅宽（模块自己就是双列时）。
 * 顺序按 DOM：标题 → 内容 → 选项——标题在最上面才像"这一块叫什么"。
 */
.editor-dialog__body--wide {
  grid-template-columns: minmax(0, 1fr);
}

.editor-dialog__body--wide .sec--content,
.editor-dialog__body--wide .sec--basics,
.editor-dialog__body--wide .sec--options {
  grid-row: auto;
  grid-column: auto;
}

@media (max-width: 880px) {
  .editor-dialog__body {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 单列时按 DOM 顺序（标题 → 内容 → 选项）排列，并清掉显式定位 */
  .sec--content,
  .sec--basics,
  .sec--options {
    grid-row: auto;
    grid-column: auto;
  }
}

/* —— 可分块折叠的区段 —— */
.sec {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.sec__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-1) 0;
  color: var(--text-muted);
  text-align: left;
}

.sec__head:hover {
  color: var(--text-secondary);
}

.sec__caret {
  flex: none;
  transition: transform var(--dur-fast) var(--ease-out);
}

/* 折叠时把箭头转成"指向右"，这是折叠控件最省字的表达 */
.sec__caret--folded {
  transform: rotate(-90deg);
}

.sec__title {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sec__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/*
 * 选项网格：一排多个。
 * auto-fit + minmax 而不是固定两列：选项数量因模块而异，
 * 固定列数在只有两个选项时会白白撑出一片空白。
 */
.options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--sp-2) var(--sp-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field__control {
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.field__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/*
 * 单个选项：标签在左、控件在右**并排**。
 * 早先每个选项都是"标签一行、控件一行"，六个选项就是十二行。
 */
.option {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  min-width: 0;
  font-size: var(--fs-sm);
}

.option__label {
  flex: none;
  min-width: 60px;
  color: var(--text-secondary);
}

.option__control {
  flex: 1;
  min-width: 0;
  padding: var(--sp-1) var(--sp-2);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.option__check {
  flex: none;
  width: 16px;
  height: 16px;
}

.editor-dialog__foot {
  display: flex;
  flex: none;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-5);
  border-top: 1px solid var(--border-subtle);
}

.editor-dialog__autosave {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.btn {
  padding: var(--sp-2) var(--sp-5);
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}

.btn--primary {
  color: var(--accent-fg);
  background: var(--accent-solid);
  border: 1px solid var(--accent-solid);
}

.btn--primary:hover {
  background: var(--accent-solid-hover);
}
</style>
