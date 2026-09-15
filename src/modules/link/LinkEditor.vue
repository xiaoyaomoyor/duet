<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModuleEditorProps } from '../types'
import type { LinkData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const data = computed<LinkData>(() => {
  const raw = props.module.data as Partial<LinkData> | undefined
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    label: typeof raw?.label === 'string' ? raw.label : '',
    desc: typeof raw?.desc === 'string' ? raw.desc : '',
  }
})

/** 只拦明显非法的输入，不阻断用户（校验过严会让人放弃使用） */
const urlLooksValid = computed(() => {
  const url = data.value.url.trim()
  if (!url) return true
  return /^https?:\/\//i.test(url)
})
</script>

<template>
  <div class="editor">
    <input
      class="editor__input"
      type="url"
      :value="data.url"
      :readonly="readonly"
      :placeholder="t('link.urlPlaceholder')"
      @input="patchData({ url: ($event.target as HTMLInputElement).value })"
    />
    <p v-if="!urlLooksValid" class="editor__warn">{{ t('link.urlHint') }}</p>

    <input
      class="editor__input"
      type="text"
      :value="data.label"
      :readonly="readonly"
      :placeholder="t('link.labelPlaceholder')"
      @input="patchData({ label: ($event.target as HTMLInputElement).value })"
    />

    <input
      class="editor__input"
      type="text"
      :value="data.desc"
      :readonly="readonly"
      :placeholder="t('link.descPlaceholder')"
      @input="patchData({ desc: ($event.target as HTMLInputElement).value })"
    />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__warn {
  font-size: var(--fs-xs);
  color: var(--warning);
}
</style>
