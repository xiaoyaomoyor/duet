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
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
            <span class="field__hint">{{ t('module.titleHint') }}</span>
          </label>

          <!-- 模块自己的编辑器：来自注册表，因此新增模块类型时这里不用改 -->
          <div class="editor-dialog__section">
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

          <!-- 呈现选项：由模块定义的 options 驱动，同样无需每个模块自己写表单 -->
          <div v-if="hasOptions" class="editor-dialog__section">
            <h3 class="editor-dialog__subtitle">{{ t('module.options') }}</h3>
            <label v-for="option in definition?.options ?? []" :key="option.key" class="option">
              <span class="option__label">{{ t(option.labelKey) }}</span>

              <select
                v-if="option.type === 'select'"
                class="option__control"
                :value="module.props[option.key] ?? option.default"
                @change="
                  emit('patchProps', { [option.key]: ($event.target as HTMLSelectElement).value })
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
                  emit('patchProps', { [option.key]: ($event.target as HTMLInputElement).value })
                "
              />
            </label>
          </div>
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
  gap: var(--sp-5);
  padding: var(--sp-5);
  overflow-y: auto;
}

.editor-dialog__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor-dialog__subtitle {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.option {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  font-size: var(--fs-sm);
}

.option__label {
  flex: none;
  min-width: 96px;
  color: var(--text-secondary);
}

.option__control {
  flex: 1;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.option__check {
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
