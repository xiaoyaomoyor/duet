<script setup lang="ts">
/**
 * 通用确认对话框
 *
 * 用于删除项目、清空数据等破坏性操作。
 * 危险操作支持 requireText（要求用户输入指定文字才能确认），避免误点。
 */
import { computed, ref, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

interface Props {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  /** 要求输入的确认文字（如 "DELETE"）；不传则无需输入 */
  requireText?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
const typed = ref('')

/** 未显式传入时的兜底值 */
const tone = computed(() => props.tone ?? 'default')

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = ''
  },
)

const canConfirm = computed(
  () => !props.requireText || typed.value.trim() === props.requireText,
)

const dialogRoot = ref<HTMLElement | null>(null)
useModalFocus(dialogRoot, () => emit('cancel'))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-mask"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <div
        ref="dialogRoot"
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header class="dialog__head">
          <AppIcon
            :name="tone === 'danger' ? 'trash' : 'comment'"
            :size="18"
            :class="['dialog__icon', tone === 'danger' ? 'dialog__icon--danger' : '']"
          />
          <h2 class="dialog__title">{{ title }}</h2>
        </header>

        <p v-if="message" class="dialog__message">{{ message }}</p>
        <slot />

        <label v-if="requireText" class="dialog__require">
          <span>{{ t('dialog.typeToConfirm', { text: requireText }) }}</span>
          <input v-model="typed" class="dialog__input" type="text" autocomplete="off" />
        </label>

        <footer class="dialog__foot">
          <button class="btn" type="button" @click="emit('cancel')">
            {{ cancelLabel ?? t('common.cancel') }}
          </button>
          <button
            class="btn btn--primary"
            :class="{ 'btn--danger': tone === 'danger' }"
            type="button"
            :disabled="!canConfirm"
            @click="emit('confirm')"
          >
            {{ confirmLabel ?? t('common.confirm') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
}

.dialog {
  width: min(440px, calc(100vw - 48px));
  padding: var(--sp-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  animation: duet-pop-in var(--dur-base) var(--ease-spring) both;
}

.dialog__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-3);
}

.dialog__icon {
  color: var(--accent-500);
}

.dialog__icon--danger {
  color: var(--danger);
}

.dialog__title {
  font-size: var(--fs-lg);
}

.dialog__message {
  margin-bottom: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.dialog__require {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.dialog__input {
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.dialog__foot {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
}

.btn {
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
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

.btn--danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--text-inverse);
}

.btn--danger:hover {
  filter: brightness(1.08);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
