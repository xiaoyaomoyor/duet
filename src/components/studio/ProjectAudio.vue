<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResolvedMedia, assetSource, sourceKey } from '@/composables/useResolvedMedia'
import type { useStagePlayback } from '@/composables/useStagePlayback'
import { repairEmbeddedCover } from '@/services/assetService'
import { reportAudioState, releaseAudioClock } from '@/composables/useAudioClock'
import StageMedia from '@/components/stage/StageMedia.vue'
import type { StageParticipant } from '@/components/stage/types'
import type { ResolvedContent } from '@/services/sceneResolver'
import type { MediaData } from '@/modules/shared/mediaData'
const props = defineProps<{ content: ResolvedContent; participant: StageParticipant }>()
const { t } = useI18n()
const player = inject<ReturnType<typeof useStagePlayback>>('duet:stage-playback')!
const data = computed(() => props.content.module.data as MediaData & { coverAssetId?: string })
const source = computed(() =>
  data.value.assetId
    ? assetSource(data.value.assetId)
    : data.value.sourceUrl
      ? { kind: 'url' as const, url: data.value.sourceUrl }
      : undefined,
)
const media = useResolvedMedia(source)
const embedded = ref<string>()
watch(
  () => data.value.assetId,
  async (id) => {
    embedded.value = undefined
    if (!id) return
    try {
      const cover = await repairEmbeddedCover(id)
      if (data.value.assetId === id) embedded.value = cover ?? undefined
    } catch {
      /* Cover failure never blocks playback. */
    }
  },
  { immediate: true },
)
const cover = useResolvedMedia(
  computed(() => assetSource(data.value.coverAssetId || embedded.value)),
)
const participant = computed<StageParticipant>(() => ({
  ...props.participant,
  track: data.value.name?.replace(/\.[^.]+$/, '') || props.content.module.title,
  description: '',
  ...(media.status === 'ready' && media.src ? { source: media.src } : {}),
  ...(cover.status === 'ready' && cover.src ? { artwork: cover.src } : {}),
}))
const audio = ref<HTMLAudioElement | null>(null)
watch(audio, (element) => player.register(props.content.trackId, element))
watch(
  () => sourceKey(source.value),
  () => {
    audio.value?.pause()
    if (audio.value) audio.value.removeAttribute('src')
  },
)
function update() {
  player.update(props.content.trackId)
  const state = player.state[props.content.trackId]
  if (state && props.content.module.props.reportClock !== false)
    reportAudioState(props.content.clockId, {
      playing: state.playing,
      currentMs: state.current * 1000,
      durationMs: state.duration * 1000,
    })
}
onBeforeUnmount(() => {
  audio.value?.pause()
  player.register(props.content.trackId, null)
  reportAudioState(props.content.clockId, { playing: false, currentMs: 0, durationMs: 0 })
  releaseAudioClock(props.content.clockId)
})
</script>
<template>
  <div class="project-audio">
    <StageMedia
      :participant="participant"
      v-bind="player.state[content.trackId]"
      :show-player="content.module.props.showPlayer !== false"
      :show-cover="content.module.props.showCover !== false"
      @toggle="player.toggle(content.trackId)"
      @seek="player.seek(content.trackId, $event)"
    />
    <audio
      ref="audio"
      hidden
      :src="media.status === 'ready' ? (media.src ?? undefined) : undefined"
      preload="metadata"
      :data-track-id="content.trackId"
      @play="update"
      @pause="update"
      @timeupdate="update"
      @loadedmetadata="update"
      @ended="update"
      @error="update"
      @emptied="update"
    />
    <p
      v-if="media.status === 'loading' || media.status === 'error'"
      class="project-audio__status"
      role="status"
    >
      {{ t(media.status === 'loading' ? 'studio.loading' : 'studio.failed') }}
    </p>
  </div>
</template>
<style scoped>
.project-audio__status {
  font-size: clamp(12px, 1cqw, 20px);
  color: var(--d-muted);
  margin-top: 14px;
}
</style>
