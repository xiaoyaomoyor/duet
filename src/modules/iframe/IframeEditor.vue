<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { safeNumber } from '../shared/inline'
import type { ModuleEditorProps } from '../types'
import type { IframeData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<IframeData>(() => {
  const raw = props.module.data as Partial<IframeData> | undefined
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    height: Math.max(120, Math.min(1200, Math.round(safeNumber(raw?.height) ?? 360))),
  }
})

/** 高度输入的安全解析：非法输入回落到默认高度，避免 NaN 写进数据 */
function readHeight(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(120, Math.min(1200, Math.round(value))) : 360
}

/** 只接受 http/https：`javascript:` 之类的协议绝不能进 iframe */
const valid = computed(() => data.value.url === '' || /^https?:\/\//i.test(data.value.url))
</script>

<template>
  <div class="editor">
    <input
      class="editor__input"
      type="url"
      :value="data.url"
      :readonly="readonly"
      :placeholder="t('iframe.urlPlaceholder')"
      @input="patchData({ url: ($event.target as HTMLInputElement).value })"
    />
    <p v-if="!valid" class="editor__warn">{{ t('iframe.urlHint') }}</p>

    <label class="editor__row">
      <span class="editor__label">{{ t('iframe.height') }}</span>
      <input
        class="editor__number"
        type="number"
        min="120"
        max="1200"
        step="20"
        :value="data.height"
        :readonly="readonly"
        @change="patchData({ height: readHeight(($event.target as HTMLInputElement).value) })"
      />
    </label>

    <p class="editor__note">
      <AppIcon name="comment" :size="13" />
      {{ t('iframe.sandboxNote') }}
    </p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__input,
.editor__number {
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__row {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.editor__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__number {
  width: 96px;
}

.editor__warn {
  font-size: var(--fs-xs);
  color: var(--warning);
}

.editor__note {
  display: flex;
  gap: var(--sp-2);
  align-items: flex-start;
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}
</style>
