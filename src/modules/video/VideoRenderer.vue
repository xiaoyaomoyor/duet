<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { assetSource, useResolvedMedia } from '@/composables/useResolvedMedia'
import { reportAudioState } from '@/composables/useAudioClock'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { VideoProps } from './data'

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()
const settings = useSettingsStore()

const data = computed(() => props.module.data as MediaData)
const videoProps = computed<VideoProps>(() => ({
  autoplay: props.module.props.autoplay === true,
  loop: props.module.props.loop !== false,
  muted: props.module.props.muted !== false,
  controls: props.module.props.controls !== false,
}))

const source = computed(() => {
  if (data.value.assetId) return assetSource(data.value.assetId)
  if (data.value.sourceUrl) return { kind: 'url' as const, url: data.value.sourceUrl }
  return undefined
})

const media = useResolvedMedia(source)
const videoEl = ref<HTMLVideoElement | null>(null)

/**
 * 是否允许自动播放：尊重"动效强度"设置。
 * 用户在设置里关闭动效时，不应该被视频自动播放打扰。
 */
const autoplayAllowed = computed(
  () => videoProps.value.autoplay && settings.settings.reducedMotion !== 'always',
)

watch(autoplayAllowed, (allowed) => {
  const el = videoEl.value
  if (!el) return
  if (allowed) void el.play().catch(() => void 0)
  else el.pause()
})

function onTimeUpdate(): void {
  const el = videoEl.value
  if (!el) return
  reportAudioState(props.sideId, { currentMs: Math.round(el.currentTime * 1000) })
}

function onLoadedMetadata(): void {
  const el = videoEl.value
  if (!el) return
  reportAudioState(props.sideId, {
    durationMs: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0,
  })
}
</script>

<template>
  <div class="video">
    <video
      v-if="media.src"
      ref="videoEl"
      class="video__el"
      :src="media.src"
      :controls="videoProps.controls"
      :loop="videoProps.loop"
      :muted="videoProps.muted"
      :autoplay="autoplayAllowed"
      playsinline
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
    />

    <p v-else-if="media.status === 'loading'" class="video__state">{{ t('common.loading') }}</p>

    <p v-else class="video__state video__state--error">
      <AppIcon name="comment" :size="14" />
      {{ media.error ? t(media.error.messageKey) : t('media.error.unknown') }}
    </p>
  </div>
</template>

<style scoped>
.video {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  overflow: hidden;
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.video__el {
  display: block;
  width: 100%;
  max-height: 420px;
}

.video__state {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-6);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.video__state--error {
  color: var(--danger);
}
</style>
