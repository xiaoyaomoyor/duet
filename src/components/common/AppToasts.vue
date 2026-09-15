<script setup lang="ts">
/**
 * 全局轻提示（Toast）
 *
 * 支持一个可选操作按钮（如"撤销"），用于删除类操作的可逆提示。
 */
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore, type ToastTone } from '@/stores/useUiStore'

const ui = useUiStore()

const toneIcon: Record<ToastTone, string> = {
  info: 'comment',
  success: 'check',
  warning: 'comment',
  danger: 'close',
}
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="`toast--${toast.tone}`">
        <AppIcon :name="toneIcon[toast.tone]" :size="14" class="toast__icon" />
        <span class="toast__message">{{ toast.message }}</span>
        <button
          v-if="toast.actionLabel"
          class="toast__action"
          type="button"
          @click="
            () => {
              toast.onAction?.()
              ui.dismissToast(toast.id)
            }
          "
        >
          {{ toast.actionLabel }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  bottom: var(--sp-6);
  left: 50%;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  pointer-events: none;
  transform: translateX(-50%);
}

.toast {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-primary);
  pointer-events: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
}

.toast--success .toast__icon {
  color: var(--success);
}

.toast--warning .toast__icon {
  color: var(--warning);
}

.toast--danger .toast__icon {
  color: var(--danger);
}

.toast__icon {
  color: var(--accent-500);
}

.toast__action {
  font-size: var(--fs-sm);
  color: var(--accent-500);
}

.toast__action:hover {
  text-decoration: underline;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
