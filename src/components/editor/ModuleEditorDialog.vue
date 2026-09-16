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
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { getModule } from '@/modules/registry'
import type { ModuleInstance, SideId } from '@/types/project'

const props = defineProps<{
  open: boolean
  module: ModuleInstance
  sideId: SideId
  accent: string
}>()

const emit = defineEmits<{
  close: []
  patch: [patch: { title?: string }]
  patchData: [patch: Record<string, unknown>]
  patchProps: [patch: Record<string, unknown>]
}>()

const { t } = useI18n()

const definition = computed(() => getModule(props.module.type))
const hasOptions = computed(() => (definition.value?.options?.length ?? 0) > 0)

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
const titleInput = ref<HTMLInputElement | null>(null)

watch(
  () => [props.open, props.module.title] as const,
  ([open]) => {
    if (open) titleDraft.value = props.module.title
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (open) void Promise.resolve().then(() => titleInput.value?.focus())
  },
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 先提交标题再关闭，否则用户刚敲的标题会被丢掉
    commitTitle()
    emit('close')
  }
}

/*
 * Esc 关窗监听在 **window** 上，而不是挂在弹窗元素上。
 *
 * 挂在元素上的话，只有"焦点恰好在弹窗内部"时才能收到事件；
 * 而自动聚焦有可能失败（元素刚渲染、浏览器拒绝、用户点了别处），
 * 一旦失败，Esc 就完全失效——弹窗关不掉，模态遮罩留在页面上
 * **拦截所有后续点击**，表现为"后面什么都点不动"。
 * 这个坑在 E2E 里被放大成了十几个看似无关的失败。
 */
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" role="presentation" @click.self="emit('close')">
      <div
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

        <div class="editor-dialog__body">
          <!-- ① 基本：标题（单行，独占一行因为它需要宽度） -->
          <section class="sec">
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
                  ref="titleInput"
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

          <!-- ② 内容：模块自己的编辑器，来自注册表，整宽不参与并排 -->
          <section class="sec">
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
          <section v-if="hasOptions" class="sec">
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
                <label v-for="option in definition?.options ?? []" :key="option.key" class="option">
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
  width: min(620px, 100%);
  max-height: min(760px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  animation: duet-pop-in var(--dur-base) var(--ease-spring) both;
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
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  overflow-y: auto;
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
  background: var(--accent-600);
  border: 1px solid var(--accent-600);
}

.btn--primary:hover {
  background: var(--accent-700);
}
</style>
