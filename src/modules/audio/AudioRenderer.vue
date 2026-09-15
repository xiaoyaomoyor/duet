<script setup lang="ts">
/**
 * 音频渲染器
 *
 * 职责：
 *   1. 播放音频（原生控件，保证在展示视图里也一定能用）
 *   2. 把播放时间上报到侧内时钟，供歌词与进度条联动
 *   3. 播放时给出律动光效（A5 动效的 M2 版本，M4 换成真实频谱）
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaImage from '@/components/media/MediaImage.vue'
import { useResolvedMedia, assetSource } from '@/composables/useResolvedMedia'
import { reportAudioState } from '@/composables/useAudioClock'
import { formatDuration } from '@/lib/time'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { AudioProps } from './data'

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()

const data = computed(() => props.module.data as MediaData)
const audioProps = computed<AudioProps>(() => ({
  showWaveform: props.module.props.showWaveform !== false,
  reportClock: props.module.props.reportClock !== false,
}))

const source = computed(() => {
  if (data.value.assetId) return assetSource(data.value.assetId)
  if (data.value.sourceUrl) return { kind: 'url' as const, url: data.value.sourceUrl }
  return undefined
})

const media = useResolvedMedia(source)
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const durationMs = ref(0)

/** 播放进度（0~1），用于律动条的活跃比例 */
const progress = computed(() => {
  const duration = durationMs.value
  if (duration <= 0) return 0
  return Math.min(1, (audioEl.value?.currentTime ?? 0) * 1000 / duration)
})

function onLoadedMetadata(): void {
  const el = audioEl.value
  if (!el) return
  durationMs.value = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0
  if (audioProps.value.reportClock) {
    reportAudioState(props.sideId, { durationMs: durationMs.value, currentMs: 0 })
  }
}

function onTimeUpdate(): void {
  if (!audioProps.value.reportClock) return
  const el = audioEl.value
  if (!el) return
  reportAudioState(props.sideId, {
    currentMs: Math.round(el.currentTime * 1000),
    durationMs: durationMs.value,
  })
}

function onPlay(): void {
  playing.value = true
  if (audioProps.value.reportClock) reportAudioState(props.sideId, { playing: true })
}

function onPause(): void {
  playing.value = false
  if (audioProps.value.reportClock) reportAudioState(props.sideId, { playing: false })
}

function onEnded(): void {
  playing.value = false
  if (audioProps.value.reportClock) {
    reportAudioState(props.sideId, { playing: false, currentMs: durationMs.value })
  }
}

// 换曲后重置时长与时钟，避免残留上一首的进度
watch(source, () => {
  durationMs.value = 0
  playing.value = false
  if (audioProps.value.reportClock) {
    reportAudioState(props.sideId, { currentMs: 0, durationMs: 0, playing: false })
  }
})
</script>

<template>
  <div class="audio" :class="{ 'audio--playing': playing }">
    <div class="audio__head">
      <MediaImage
        v-if="data.assetId || data.sourceUrl"
        class="audio__cover"
        :asset-id="data.assetId"
        :source-url="data.sourceUrl"
        :alt="data.name ?? ''"
        fit="cover"
        ratio="1/1"
        :rounded="false"
      />
      <div class="audio__info">
        <span class="audio__name u-truncate">{{ data.name ?? t('media.untitled') }}</span>
        <span class="audio__duration">
          {{ durationMs > 0 ? formatDuration(durationMs) : '--:--' }}
        </span>
      </div>
    </div>

    <!-- 律动条：播放时点亮，M4 会换成真实频谱（A6） -->
    <div v-if="audioProps.showWaveform" class="wave" aria-hidden="true">
      <span
        v-for="index in 48"
        :key="index"
        class="wave__bar"
        :class="{ 'wave__bar--active': playing && index / 48 <= progress }"
      />
    </div>

    <audio
      v-if="media.src"
      ref="audioEl"
      class="audio__el"
      :src="media.src"
      controls
      preload="metadata"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
    />

    <p v-else-if="media.status === 'loading'" class="audio__state">{{ t('common.loading') }}</p>

    <p v-else class="audio__state audio__state--error">
      <AppIcon name="comment" :size="14" />
      {{ media.error ? t(media.error.messageKey) : t('media.error.unknown') }}
    </p>
  </div>
</template>

<style scoped>
.audio {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: box-shadow var(--dur-slow) var(--ease-out);
}

.audio--playing {
  box-shadow: 0 0 0 1px var(--accent, var(--accent-500)), var(--glow-accent);
}

.audio__head {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}

.audio__cover {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
}

.audio__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.audio__name {
  font-size: var(--fs-sm);
}

.audio__duration {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.wave {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 24px;
}

.wave__bar {
  flex: 1;
  height: 20%;
  background: var(--border-strong);
  border-radius: var(--radius-full);
  transition:
    height var(--dur-base) var(--ease-out),
    background var(--dur-base) var(--ease-out);
}

.wave__bar--active {
  height: 100%;
  background: var(--accent, var(--accent-500));
}

/* 偶数条高度错落，静态时也像波形而不是色块 */
.wave__bar:nth-child(even) {
  height: 40%;
}

.audio__el {
  width: 100%;
  height: 36px;
}

.audio__state {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.audio__state--error {
  color: var(--danger);
}
</style>
