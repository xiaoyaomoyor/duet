<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { safeNumber } from '../shared/inline'
import type { ModuleRendererProps } from '../types'
import type { IframeData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<IframeData>(() => {
  const raw = props.module.data as Partial<IframeData> | undefined
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    height: Math.max(120, Math.min(1200, Math.round(safeNumber(raw?.height) ?? 360))),
  }
})

/**
 * 只允许 http/https。
 * 展示态同样要校验：数据可能来自别人的 .duet 文件，
 * 不能假定写入时已经过滤过协议。
 */
const safeUrl = computed(() => (/^https?:\/\//i.test(data.value.url) ? data.value.url : ''))
</script>

<template>
  <div v-if="safeUrl" class="iframe anim-enter-up">
    <iframe
      class="iframe__frame"
      :src="safeUrl"
      :style="{ height: `${data.height}px` }"
      :title="safeUrl"
      loading="lazy"
      referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-popups allow-presentation"
    />
    <p class="iframe__note">
      <AppIcon name="comment" :size="12" />
      嵌入自 {{ safeUrl }}
    </p>
  </div>
</template>

<style scoped>
.iframe {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.iframe__frame {
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.iframe__note {
  display: flex;
  gap: var(--sp-1);
  align-items: center;
  font-size: 10px;
  color: var(--text-disabled);
}
</style>
