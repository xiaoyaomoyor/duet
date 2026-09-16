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
import { repairEmbeddedCover } from '@/services/assetService'
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
  showPlayer: props.module.props.showPlayer !== false,
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
      /*
       * 用 repairEmbeddedCover 而不是直接读 derived.thumbAssetId：
       * 它会顺带处理两种"读出来是空的"情况——M8 之前解析器的 bug 导致
       * 当初就没抽出封面的老资源，以及 .duet 往返后指向不存在资源的悬空引用。
       * 两者都表现为"Windows 有封面、对奏没有"，而用户无从判断原因。
       */
      coverAssetId.value = (await repairEmbeddedCover(assetId)) ?? undefined
    } catch {
      // 读不到封面不算错误：模板会退回音乐图标占位
      coverAssetId.value = undefined
    }
  },
  { immediate: true },
)
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const durationMs = ref(0)
/** 本地播放位置（自研播放条要用；与上报给时钟的是同一份数据） */
const currentMs = ref(0)

/** 已播放比例，驱动播放条的填充长度 */
const playedRatio = computed(() => {
  if (durationMs.value <= 0) return 0
  return Math.min(1, Math.max(0, currentMs.value / durationMs.value))
})

/**
 * 频谱是否真的有数据。
 *
 * 没有数据时**不要**把 48 根柱子都写成 8%（那会摊成一条直线，
 * 看起来像"波形死了"）——保持样式表里那套错落的静态波形即可，
 * 它至少还像一条波形，而且播放时整条会变成工具强调色，
 * "正在播放"这件事仍然看得出来。
 *
 * 什么时候会没有数据：只有一侧有音频（引擎不接管）、浏览器不支持 Web Audio、
 * 或媒体跨域。这些都不是缺陷，而是降级路径。
 */
const hasSpectrum = computed(() => spectrum.value.some((value) => value > 0))

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
  const el = audioEl.value
  if (!el) return
  // 本地进度条无论如何都要更新（它属于这个模块自己的界面），
  // 而上报给时钟是另一件事，受"上报播放进度"开关控制
  currentMs.value = Math.round(el.currentTime * 1000)
  if (!audioProps.value.reportClock) return
  reportAudioState(props.sideId, {
    currentMs: currentMs.value,
    durationMs: durationMs.value,
  })
}

/**
 * 自研播放条的播放 / 暂停。
 *
 * 引擎已经接管两侧时**交给引擎**，而不是直接 `el.play()`：
 * 频谱（波形动效）是引擎的 AnalyserNode 出来的，绕开引擎播就等于
 * 没有频谱数据 → 波形摊成一条线（实测反馈"动态波形不动了"就是这个）。
 * 引擎没接管（只有一侧有音频、浏览器不支持等）时才直接操作元素。
 */
function togglePlay(): void {
  const el = audioEl.value
  if (!el) return

  const id = projectId?.value
  const engine = id ? getSyncEngine(id) : null

  if (engine?.isAttached) {
    if (!el.paused) {
      engine.pause()
      return
    }
    void engine.play().catch(() => void 0)
    return
  }

  if (el.paused) void el.play().catch(() => void 0)
  else el.pause()
}

/**
 * 拖动进度。
 *
 * 引擎接管时**必须交给引擎**（`engine.seek`）：引擎每 250ms 采样一次、
 * 把两侧对齐到主轨，直接写 `el.currentTime` 会被下一次采样**拉回去**——
 * 表现就是"进度条拨不动"（其实拨动了，只是立刻被同步逻辑纠正回原处）。
 * 交给引擎既没有这个冲突，也与「音频控制台」的定位行为一致。
 *
 * 同时立刻更新本地 `currentMs`：不然要等下一个 `timeupdate` 才回填，
 * 拖动时手感会顿一下。
 */
function onSeek(event: Event): void {
  const el = audioEl.value
  if (!el) return

  const ms = Number((event.target as HTMLInputElement).value)
  currentMs.value = ms

  const id = projectId?.value
  const engine = id ? getSyncEngine(id) : null
  if (engine?.isAttached) {
    engine.seek(ms)
    return
  }

  el.currentTime = ms / 1000
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
  currentMs.value = 0
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
          silent-on-error
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

    <!--
      频谱：引擎接管的播放由 rAF 驱动真实的频率数据（A6）；
      没有数据时保持样式表里那套错落的静态波形（见 hasSpectrum 的说明）。
    -->
    <div v-if="audioProps.showWaveform" class="wave" aria-hidden="true">
      <span
        v-for="(value, index) in spectrum"
        :key="index"
        class="wave__bar"
        :class="{ 'wave__bar--active': playing }"
        :style="playing && hasSpectrum ? { height: `${Math.max(8, Math.round(value * 100))}%` } : undefined"
      />
    </div>

    <!--
      自研播放条（M9 取代浏览器原生 `<audio controls>`）。
      换掉它的原因有两条，都来自实测反馈：
        1. 原生那条的**已播放部分**是浏览器用固定色画的，改不了 → 现在用工具强调色
        2. 关不掉 → 现在可以整条隐藏（音频控制台提供播放控制时，这一条是重复的）
      从波形图上就能看出用的是哪一侧的主题色，播放条与它保持一致。
    -->
    <div v-if="audioProps.showPlayer" class="player">
      <button
        class="player__play"
        type="button"
        :title="playing ? t('audio.pause') : t('audio.play')"
        :aria-label="playing ? t('audio.pause') : t('audio.play')"
        :aria-pressed="playing"
        @click="togglePlay"
      >
        <AppIcon :name="playing ? 'pause' : 'play'" :size="14" />
      </button>

      <input
        class="player__seek"
        type="range"
        min="0"
        :max="durationMs > 0 ? Math.round(durationMs) : 1000"
        step="10"
        :value="Math.round(currentMs)"
        :style="{ '--played': `${playedRatio * 100}%` }"
        :aria-label="t('audio.seek')"
        :aria-valuetext="`${formatDuration(currentMs)} / ${formatDuration(durationMs)}`"
        @input="onSeek"
      />

      <span class="player__time">{{ formatDuration(currentMs) }}</span>
    </div>

    <!--
      真正发声的元素。原生控件已由上面的自研播放条取代，因此隐藏它——
      用 display:none 不影响播放（音频元素不需要可见），
      而保持它在 DOM 里是 Web Audio 接管（createMediaElementSource）的前提。
    -->
    <audio
      v-if="media.src"
      ref="audioEl"
      class="audio__el"
      :src="media.src"
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
  /*
   * M9 按实测反馈去掉内层卡片：模块本来就住在「模块卡片」里，
   * 再套一层底色 + 描边就成了"卡片里还有一张卡片"，
   * 左右两栏并排时尤其显得脏。这里只保留排布，不画面板。
   */
  padding: 0;
  background: none;
  border: none;
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

/*
 * 自研播放条。
 *
 * 轨道用 `linear-gradient` 把"已播放"那一段直接画成工具强调色——
 * 这是换掉原生控件的**唯一**原因：原生那条的颜色由浏览器决定，改不了。
 * 未播放的部分保留一档中性底色，否则整条轨道的长度看不出来、没法定位。
 */
.player {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.player__play {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--accent-fg);
  background: var(--accent, var(--accent-500));
  border-radius: var(--radius-full);
  transition: transform var(--dur-fast) var(--ease-out);
}

.player__play:hover {
  transform: scale(1.06);
}

.player__seek {
  flex: 1;
  min-width: 0;
  height: 16px;
  cursor: pointer;
  appearance: none;
  background: transparent;
}

.player__seek::-webkit-slider-runnable-track {
  height: 4px;
  background: linear-gradient(
    to right,
    var(--accent, var(--accent-500)) var(--played, 0%),
    var(--bg-active) var(--played, 0%)
  );
  border-radius: var(--radius-full);
}

.player__seek::-moz-range-track {
  height: 4px;
  background: linear-gradient(
    to right,
    var(--accent, var(--accent-500)) var(--played, 0%),
    var(--bg-active) var(--played, 0%)
  );
  border-radius: var(--radius-full);
}

.player__seek::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -4px;
  appearance: none;
  background: var(--accent, var(--accent-500));
  border: none;
  border-radius: var(--radius-full);
}

.player__seek::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--accent, var(--accent-500));
  border: none;
  border-radius: var(--radius-full);
}

.player__time {
  flex: none;
  min-width: 40px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: right;
}

/* 隐藏的原生元素：不出现在版面上，但仍然是真正的播放器 */
.audio__el {
  display: none;
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
