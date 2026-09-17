<script setup lang="ts">
/**
 * 通用输入对话框
 *
 * 用于"从外链导入媒体"等需要一段文本输入的场景。
 * 比 window.prompt 可靠：可校验、可显示错误、可带附加选项。
 */
import { ref, useId, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

interface Props {
  open: boolean
  title: string
  label?: string
  placeholder?: string
  /** 初始值 */
  initial?: string
  /** 确认按钮文案 */
  confirmLabel?: string
  /** 附加复选框（如"仅引用不下载"） */
  checkboxLabel?: string
  checkboxDefault?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [value: string, checked: boolean]
  cancel: []
}>()

const { t } = useI18n()
const value = ref('')
const checked = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    value.value = props.initial ?? ''
    checked.value = props.checkboxDefault ?? false
  },
  { immediate: true },
)

function confirm(): void {
  const trimmed = value.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed, checked.value)
}

const inputId = useId()
const dialogRoot = ref<HTMLElement | null>(null)
useModalFocus(dialogRoot, () => emit('cancel'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click.self="emit('cancel')">
      <div ref="dialogRoot" class="prompt" role="dialog" aria-modal="true" :aria-label="title">
        <header class="prompt__head">
          <AppIcon name="link" :size="16" class="prompt__icon" />
          <h2 class="prompt__title">{{ title }}</h2>
        </header>

        <label v-if="label" :for="inputId" class="prompt__label">{{ label }}</label>
        <input
          :id="inputId"
          v-model="value"
          class="prompt__input"
          type="text"
          autofocus
          :placeholder="placeholder"
          @keydown.enter.prevent="!$event.isComposing && confirm()"
        />

        <label v-if="checkboxLabel" class="prompt__check">
          <input v-model="checked" type="checkbox" />
          <span>{{ checkboxLabel }}</span>
        </label>

        <footer class="prompt__foot">
          <button class="btn" type="button" @click="emit('cancel')">{{ t('common.cancel') }}</button>
          <button class="btn btn--primary" type="button" :disabled="!value.trim()" @click="confirm">
            {{ confirmLabel ?? t('common.confirm') }}
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
  background: var(--bg-overlay);
}

.prompt {
  width: min(460px, calc(100vw - 48px));
  padding: var(--sp-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}

.prompt__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-4);
}

.prompt__icon {
  color: var(--accent-500);
}

.prompt__title {
  font-size: var(--fs-lg);
}

.prompt__label {
  display: block;
  margin-bottom: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.prompt__input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.prompt__check {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-top: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.prompt__foot {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}

.btn {
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.btn:hover {
  background: var(--bg-hover);
}

.btn--primary {
  color: var(--accent-fg);
  background: var(--accent-solid);
  border-color: var(--accent-solid);
}

.btn--primary:hover {
  background: var(--accent-solid-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
