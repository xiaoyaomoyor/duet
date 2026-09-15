<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioClock } from '@/composables/useAudioClock'
import { formatDuration, formatDurationMs } from '@/lib/time'
import { useAssetsStore } from '@/stores/useAssetsStore'
import type { ModuleRendererProps } from '../types'
import type { ProgressData } from './data'

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()
const assets = useAssetsStore()
const clock = useAudioClock(props.sideId)

const data = computed<ProgressData>(() => {
  const raw = props.module.data as Partial<ProgressData> | undefined
  return {
    ...(raw?.assetId ? { assetId: raw.assetId } : {}),
    ...(raw?.manualDurationMs ? { manualDurationMs: raw.manualDurationMs } : {}),
    showTime: raw?.showTime !== false,
    showWaveform: raw?.showWaveform !== false,
  }
})

/** 时长优先级：绑定资源的探测结果 → 侧内时钟上报 → 手工填写 */
const durationMs = computed(() => {
  if (data.value.assetId) {
    const meta = assets.metaById(data.value.assetId)
    const probed = meta?.derived?.durationMs
    if (probed && probed > 0) return probed
    if (clock.durationMs.value > 0) return clock.durationMs.value
    return 0
  }
  return data.value.manualDurationMs ?? 0
})

const boundToClock = computed(() => Boolean(data.value.assetId))

const currentMs = computed(() => (boundToClock.value ? clock.currentMs.value : 0))

const ratio = computed(() => {
  if (durationMs.value <= 0) return 0
  return Math.min(1, Math.max(0, currentMs.value / durationMs.value))
})

const hasDuration = computed(() => durationMs.value > 0)
</script>

<template>
  <div class="progress" :class="{ 'progress--playing': clock.playing }">
    <div class="progress__head">
      <span class="progress__time">
        <template v-if="data.showTime && hasDuration">
          {{ formatDuration(currentMs) }} / {{ formatDuration(durationMs) }}
        </template>
        <template v-else-if="data.showTime">
          {{ formatDurationMs(currentMs) }}
        </template>
      </span>
      <span v-if="boundToClock" class="progress__badge">{{ t('progress.following') }}</span>
      <span v-else-if="!hasDuration" class="progress__badge progress__badge--muted">
        {{ t('progress.noDuration') }}
      </span>
    </div>

    <div
      class="progress__track"
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="hasDuration ? 100 : 0"
      :aria-valuenow="Math.round(ratio * 100)"
      :aria-label="t('modules.progress')"
    >
      <span class="progress__fill" :style="{ transform: `scaleX(${ratio})` }">
        <span v-if="data.showWaveform" class="progress__head-dot" aria-hidden="true" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.progress__head {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.progress__badge {
  padding: 0 6px;
  font-family: var(--font-sans);
  color: var(--accent, var(--accent-500));
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.progress__badge--muted {
  color: var(--text-disabled);
}

.progress__track {
  position: relative;
  height: 6px;
  overflow: hidden;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
}

/* 用 scaleX 而非 width：只触发合成层，不引发重排（§12.3） */
.progress__fill {
  position: absolute;
  inset: 0;
  background: var(--accent, var(--accent-500));
  border-radius: var(--radius-full);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform var(--dur-fast) linear;
}

.progress--playing .progress__fill {
  box-shadow: var(--glow-accent);
}

.progress__head-dot {
  position: absolute;
  top: 50%;
  right: 0;
  width: 6px;
  height: 6px;
  background: var(--text-primary);
  border-radius: var(--radius-full);
  transform: translate(0, -50%);
}
</style>
