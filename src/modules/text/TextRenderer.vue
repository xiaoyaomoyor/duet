<script setup lang="ts">
import { computed } from 'vue'
import type { ModuleRendererProps } from '../types'
import type { TextData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<TextData>(() => {
  const raw = props.module.data as Partial<TextData> | undefined
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    align: raw?.align ?? 'left',
  }
})

const large = computed(() => props.module.props.size === 'large')
/** 保留段落分隔：编辑时怎么换行，展示时就怎么换行 */
const paragraphs = computed(() => data.value.text.split(/\n{2,}/).filter((p) => p.trim() !== ''))
</script>

<template>
  <div
    class="text"
    :class="{ 'text--large': large }"
    :style="{ textAlign: data.align }"
  >
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="text__p anim-enter-up">
      {{ paragraph }}
    </p>
  </div>
</template>

<style scoped>
.text {
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text--large {
  font-size: var(--fs-lg);
}

.text__p + .text__p {
  margin-top: var(--sp-3);
}

.text__p {
  margin: 0;
}
</style>
