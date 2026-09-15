<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { ModuleRendererProps } from '../types'
import type { LinkData } from './data'

const props = defineProps<ModuleRendererProps>()

const data = computed<LinkData>(() => {
  const raw = props.module.data as Partial<LinkData> | undefined
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    label: typeof raw?.label === 'string' ? raw.label : '',
    desc: typeof raw?.desc === 'string' ? raw.desc : '',
  }
})

/** 展示用主机名：比整条 URL 更易读 */
const host = computed(() => {
  try {
    return new URL(data.value.url).hostname.replace(/^www\./, '')
  } catch {
    return data.value.url
  }
})
</script>

<template>
  <a
    class="link anim-enter-up"
    :href="data.url"
    target="_blank"
    rel="noopener noreferrer"
    @click.stop
  >
    <AppIcon name="link" :size="15" class="link__icon" />
    <span class="link__body">
      <span class="link__label u-truncate">{{ data.label || host }}</span>
      <span class="link__meta u-truncate">{{ data.desc || host }}</span>
    </span>
    <AppIcon name="chevron-right" :size="14" class="link__arrow" />
  </a>
</template>

<style scoped>
.link {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-3);
  text-decoration: none;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.link:hover {
  text-decoration: none;
  border-color: var(--accent, var(--accent-500));
  transform: translateY(-1px);
}

.link__icon {
  flex: none;
  color: var(--accent, var(--accent-500));
}

.link__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.link__label {
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.link__meta {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.link__arrow {
  flex: none;
  color: var(--text-disabled);
}
</style>
