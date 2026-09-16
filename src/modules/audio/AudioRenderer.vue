<script setup lang="ts">
/**
 * 音频渲染器
 *
 * 职责：
 *   1. 播放音频（原生控件，保证在展示视图里也一定能用）
 *   2. 把播放时间上报到侧内时钟，供歌词与进度条联动
 *   3. 播放时给出律动光效（A5 动效的 M2 版本，M4 换成真实频谱）
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaImage from '@/components/media/MediaImage.vue'
import { useResolvedMedia, assetSource } from '@/composables/useResolvedMedia'
import { registerSyncTrack, reportAudioState, unregisterSyncTrack } from '@/composables/useAudioClock'
import { getSyncEngine } from '@/composables/useAudioClock'
import { onRafTick } from '@/composables/useRafTicker'
import { getAsset } from '@/db/assetsRepo'
import { formatDuration } from '@/lib/time'
import type { ModuleRendererProps } from '../types'
import type { MediaData } from '../shared/mediaData'
import type { AudioProps } from './data'

/** 频谱竖条数量（与 §12.2 A6 的 48 根一致） */
const SPECTRUM_BARS = 48

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()

/** 所属项目 id（由 CanvasRow 通过 provide 透传，见那里的说明） */
const projectId = inject<Ref<string> | null>('duet:projectId', null)

const data = computed(() => props.module.data as MediaData)
const audioProps = computed<AudioProps>(() => ({
  showWaveform: props.module.props.showWaveform !== false,
  reportClock: props.module.props.reportClock !== false,
  showCover: props.module.props.showCover !== false,
}))

const source = computed(() => {
  if (data.value.assetId) return assetSource(data.value.assetId)
  if (data.value.sourceUrl) return { kind: 'url' as const, url: data.value.sourceUrl }
  return undefined
})

const media = useResolvedMedia(source)

/**
 * 内嵌封面（mp3 的 ID3 APIC）。
 *
 * 导入时已经把它抽出来存成一张独立的图片资源，id 记在音频资源的
 * `derived.thumbAssetId` 上。这里响应式地把它读出来。
 *
 * 为什么不直接把 audio 的 assetId 传给 MediaImage：
 *   那是个**音频** blob，图片组件解不出来，结果就是"封面永远不显示"——
 *   这正是用户实测反馈里的问题。必须用派生出来的那张图片。
 */
const coverAssetId = ref<string | undefined>(undefined)

watch(
  () => data.value.assetId,
  async (assetId) => {
    coverAssetId.value = undefined
    if (!assetId) return
    try {
      const asset = await getAsset(assetId)
      coverAssetId.value = asset?.derived?.thumbAssetId
    } catch {
      // 读不到封面不算错误：模板会退回纯文字头部
      coverAssetId.value = undefined
    }
  },
  { immediate: true },
)
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const durationMs = ref(0)

/** 频谱数据（A6 动效）：由统一的 rAF 调度器驱动，而不是每个模块各起一个循环 */
const spectrum = ref<number[]>(new Array<number>(SPECTRUM_BARS).fill(0))
let unsubscribeRaf: (() => void) | null = null

function startSpectrum(): void {
  if (unsubscribeRaf) return
  unsubscribeRaf = onRafTick(() => {
    spectrum.value = readSpectrum()
  })
}

function stopSpectrum(): void {
  unsubscribeRaf?.()
  unsubscribeRaf = null
  spectrum.value = new Array<number>(SPECTRUM_BARS).fill(0)
}

/** 从同步引擎取该侧的频谱；引擎没接管时返回空（动效退化为静态条） */
function readSpectrum(): number[] {
  const id = projectId?.value
  if (!id) return new Array<number>(SPECTRUM_BARS).fill(0)
  return getSyncEngine(id).getSpectrum(props.sideId, SPECTRUM_BARS)
}

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
  startSpectrum()
}

function onPause(): void {
  playing.value = false
  if (audioProps.value.reportClock) reportAudioState(props.sideId, { playing: false })
  stopSpectrum()
}

function onEnded(): void {
  playing.value = false
  stopSpectrum()
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

/**
 * 把自己登记到同步引擎。
 *
 * 为什么需要 nextTick：媒体元素要等渲染完成才存在；
 * 而 `createMediaElementSource` 对同一元素只能调用一次，
 * 因此登记与注销必须成对，且登记前要确保元素是当前这一个。
 */
watch(
  [audioEl, () => projectId?.value],
  async ([element]) => {
    await nextTick()
    unregisterSyncTrack(props.sideId)
    if (element && projectId?.value) {
      registerSyncTrack({ projectId: projectId.value, sideId: props.sideId, element })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  unregisterSyncTrack(props.sideId)
  stopSpectrum()
})
</script>

<template>
  <div class="audio" :class="{ 'audio--playing': playing }">
    <div class="audio__head">
      <!--
        封面三态：
          有内嵌封面        → 渲染它
          没有但开关开着    → 音乐图标占位（**必须占位**：
                              否则左右两栏一个有一块图、一个没有，
                              标题的起始位置就对不齐了）
          开关关掉          → 整个不渲染，也不留空位
      -->
      <template v-if="audioProps.showCover">
        <MediaImage
          v-if="coverAssetId"
          class="audio__cover"
          :asset-id="coverAssetId"
          :alt="data.name ?? ''"
          fit="cover"
          ratio="1/1"
          :rounded="false"
        />
        <span v-else class="audio__cover audio__cover--placeholder" aria-hidden="true">
          <AppIcon name="music" :size="20" />
        </span>
      </template>

      <div class="audio__info">
        <span class="audio__name u-truncate">{{ data.name ?? t('media.untitled') }}</span>
        <span class="audio__duration">
          {{ durationMs > 0 ? formatDuration(durationMs) : '--:--' }}
        </span>
      </div>
    </div>

    <!-- 频谱：播放时由 rAF 驱动（A6）；静态时是错落的波形示意 -->
    <div v-if="audioProps.showWaveform" class="wave" aria-hidden="true">
      <span
        v-for="(value, index) in spectrum"
        :key="index"
        class="wave__bar"
        :class="{ 'wave__bar--active': playing }"
        :style="playing ? { height: `${Math.max(8, Math.round(value * 100))}%` } : undefined"
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

.audio__cover--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
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
