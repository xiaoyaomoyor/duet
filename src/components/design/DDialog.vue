<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalFocus } from '@/composables/useModalFocus'
import DButton from './DButton.vue'
withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    size?: 's' | 'm' | 'l'
    theme: 'ink' | 'paper'
    danger?: boolean
  }>(),
  { size: 'm' },
)
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
useModalFocus(root, () => emit('close'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="d-dialog-mask" :data-design-theme="theme" @click.self="emit('close')">
      <section
        ref="root"
        class="d-dialog"
        :class="`d-dialog--${size}`"
        :role="danger ? 'alertdialog' : 'dialog'"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="d-dialog__head">
          <div>
            <h2>{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <DButton
            tone="quiet"
            icon="close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          />
        </header>
        <div class="d-dialog__body"><slot /></div>
        <footer class="d-dialog__foot">
          <slot name="footer"
            ><DButton tone="primary" @click="emit('close')">{{ t('common.done') }}</DButton></slot
          >
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.d-dialog-mask {
  position: fixed;
  z-index: var(--z-modal);
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #050907b3;
  backdrop-filter: blur(8px);
}
.d-dialog {
  width: min(640px, 100%);
  max-height: min(820px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--d-line);
  border-radius: var(--d-radius-dialog);
  box-shadow: var(--d-shadow);
  background: var(--d-surface);
  overflow: hidden;
  animation: dialog-in var(--d-enter) var(--d-ease);
}
.d-dialog--s {
  width: min(440px, 100%);
}
.d-dialog--l {
  width: min(960px, 100%);
}
.d-dialog__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  border-bottom: 1px solid var(--d-line);
}
.d-dialog__head h2 {
  font-size: 19px;
  font-weight: 500;
}
.d-dialog__head p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--d-muted);
  margin-top: 8px;
}
.d-dialog__body {
  min-height: 0;
  overflow: auto;
  padding: 28px;
}
.d-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: center;
  padding: 16px 28px;
  border-top: 1px solid var(--d-line);
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 600px) {
  .d-dialog-mask {
    padding: 12px;
  }
  .d-dialog {
    max-height: calc(100dvh - 24px);
  }
  .d-dialog__head,
  .d-dialog__body {
    padding: 20px;
  }
}
</style>
