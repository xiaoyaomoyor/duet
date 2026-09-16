<script setup lang="ts">
/**
 * 文字渲染器
 *
 * M7 起同时承担原「备注」模块的职责：
 * `variant === 'note'` 时渲染成带语气色的标注块，否则是普通正文。
 * 两者共用同一份数据（`TextData`），因此合并后旧工程文件不会丢内容。
 */
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

/** 标注样式（原「备注」模块）：短句 + 语气色 */
const variant = computed(() => (props.module.props.variant === 'note' ? 'note' : 'body'))

const TONES = ['neutral', 'good', 'warn', 'bad'] as const
const tone = computed(() => {
  const value = props.module.props.tone
  return (TONES as readonly unknown[]).includes(value)
    ? (`note--${String(value)}` as const)
    : 'note--neutral'
})

/** 保留段落分隔：编辑时怎么换行，展示时就怎么换行 */
const paragraphs = computed(() => data.value.text.split(/\n{2,}/).filter((p) => p.trim() !== ''))
</script>

<template>
  <!-- 标注样式：单块带色标注，不分段 -->
  <p v-if="variant === 'note'" class="note" :class="tone">{{ data.text }}</p>

  <div
    v-else
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
