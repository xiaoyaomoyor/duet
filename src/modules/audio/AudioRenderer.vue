<script setup lang="ts">
/**
 * 音频渲染器
 *
 * 职责：
 *   1. 播放音频（原生控件，保证在演示视图里也一定能用）
 *   2. 把播放时间上报到侧内时钟，供歌词与进度条联动
 *   3. 播放时给出律动光效（A5 动效的 M2 版本，M4 换成真实频谱）
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaImage from '@/components/media/MediaImage.vue'
import { useResolvedMedia, assetSource, sourceKey } from '@/composables/useResolvedMedia'
import {
  registerSyncTrack,
  reportAudioState,
  unregisterSyncTrack,
} from '@/composables/useAudioClock'
import { getSyncEngine } from '@/composables/useAudioClock'
import { onRafTick } from '@/composables/useRafTicker'
import { repairEmbeddedCover } from '@/services/assetService'
import { formatDuration } from '@/lib/time'
import { stripMediaExtension } from '@/lib/text'
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
  layout: props.module.props.layout === 'square' ? 'square' : 'bar',
}))

/**
 * 展示用的曲名：**去掉扩展名**（用户实测反馈"不需要显示媒体与扩展名，
 * 比如 xxx.mp3"）。剥离规则与边界都在 `stripMediaExtension` 里，并有单测。
 */
const displayName = computed(() => stripMediaExtension(data.value.name ?? ''))

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
const embeddedCoverId = ref<string | undefined>(undefined)

/**
 * 最终用的封面（v0.5.0）：**用户上传的那张优先**。
 *
 * 内嵌封面是"文件自带的"，用户传的是"我想要的那张"——后者既然存在，
 * 就该盖住前者。清空上传项即回到内嵌封面，两条信息都留着。
 */
const coverAssetId = computed(
  () => (data.value as { coverAssetId?: string }).coverAssetId || embeddedCoverId.value,
)

watch(
  () => data.value.assetId,
  async (assetId) => {
    embeddedCoverId.value = undefined
    if (!assetId) return
    try {
      /*
       * 用 repairEmbeddedCover 而不是直接读 derived.thumbAssetId：
       * 它会顺带处理两种"读出来是空的"情况——M8 之前解析器的 bug 导致
       * 当初就没抽出封面的老资源，以及 .duet 往返后指向不存在资源的悬空引用。
       * 两者都表现为"Windows 有封面、对奏没有"，而用户无从判断原因。
       */
      embeddedCoverId.value = (await repairEmbeddedCover(assetId)) ?? undefined
    } catch {
      // 读不到封面不算错误：模板会退回音乐图标占位
      embeddedCoverId.value = undefined
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
 * 自研播放条的播放 / 暂停：**只管这一侧**。
 *
 * 这里踩过一次坑（M12 → v0.5.5 修回）：M12 为了让频谱有数据，把播放键
 * 交给了 `engine.play()`——而引擎的 play 是**两侧一起播**，
 * 于是"点左边模块的播放键，右边的音乐也响了"（用户实测反馈）。
 *
 * 其实完全不必：分析器是接在**元素自己**的节点链上的
 * （source → gain → analyser → destination），谁调用 `el.play()` 都有频谱。
 * 唯一需要引擎的地方是**恢复音频上下文**——自动播放策略会让它停在
 * suspended，不 resume 就没有声音。
 */
function togglePlay(): void {
  const el = audioEl.value
  if (!el) return

  if (!el.paused) {
    el.pause()
    return
  }

  const id = projectId?.value
  const engine = id ? getSyncEngine(id) : null
  const start = (): void => {
    void el.play().catch(() => void 0)
  }

  if (engine?.isAttached) {
    void engine.resume().then(start).catch(start)
    return
  }
  start()
}

/**
 * 拖动进度。
 *
 * 引擎接管时交给引擎的 `seekSide`（**只定位这一侧**）：
 *   - 直接写 `el.currentTime` 会被下一次采样拉回去（引擎每 250ms 对齐一次），
 *     表现就是"进度条拨不动"；
 *   - 而用 `engine.seek()` 是整体定位，**另一侧的进度条会跟着跳**——
 *     用户实测反馈"拖动进度条不应该一起变动"。
 * `seekSide` 同时改写这一侧的偏移，因此对齐之后它仍停在用户放下的位置。
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
    engine.seekSide(props.sideId, ms)
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
watch(
  () => sourceKey(source.value),
  () => {
    durationMs.value = 0
    currentMs.value = 0
    playing.value = false
    if (audioProps.value.reportClock) {
      reportAudioState(props.sideId, { currentMs: 0, durationMs: 0, playing: false })
    }
  },
)

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

/**
 * 正方形布局的背景图。
 *
 * 用 CSS 变量把封面地址传下去，而不是再渲染一个 `<img>`：
 * 背景天然被 `background-size: cover` 裁成正方形，也不会被屏幕阅读器
 * 当成一张有含义的图（它只是背景）。
 * 没有封面时退回"品牌色渐变"——总比一块空白好，而且仍然能区分左右两侧。
 */
const squareStyle = computed(() => {
  if (!coverUrl.value) return undefined
  return { '--audio-cover': `url("${coverUrl.value}")` }
})

/**
 * 封面的可渲染地址。
 *
 * `MediaImage` 内部自己解析 assetId → blob URL，但背景图需要**地址本身**，
 * 所以这里单独解析一次。共用一个解析器（mediaResolver）因此仍是同一份缓存。
 */
const coverUrl = ref<string | null>(null)
const coverMedia = useResolvedMedia(
  computed(() => (coverAssetId.value ? assetSource(coverAssetId.value) : undefined)),
)
watch(
  () => coverMedia.src,
  (src) => {
    coverUrl.value = src
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="audio"
    :class="[
      `audio--${audioProps.layout}`,
      { 'audio--playing': playing, 'audio--no-cover': !audioProps.showCover },
    ]"
    :style="squareStyle"
  >
    <!--
      正方形布局：封面铺满整块作背景，其余内容叠在它上面。
      背景用 CSS 变量下发而不是真的塞一个 <img>：
      这样它天然被裁切成正方形、且不会参与无障碍朗读（它只是装饰）。
    -->
    <div
      v-if="audioProps.layout === 'square'"
      class="audio__backdrop"
      :class="{ 'audio__backdrop--placeholder': !audioProps.showCover || !coverUrl }"
      aria-hidden="true"
    >
      <!--
        没有封面（或用户关掉了"显示封面"）时退回占位图标（用户要求）。
        关掉封面不该得到一块空白方块——那看起来像加载失败。
      -->
      <AppIcon v-if="!audioProps.showCover || !coverUrl" name="music" :size="36" />
    </div>

    <div class="audio__body">
      <!--
        长条布局的封面：**卡片左侧那一块就是它**（v0.5.0 重做）。
        名字压在上侧、播放键在左下、总时间在右下——三样都在封面内部，
        这样封面的高度就正好等于右侧"波形 + 进度条"的高度，
        整张卡片因此变得很薄（此前封面只有 56px，右侧却堆了三层）。
        正方形布局下封面已经铺成背景，这一块整块不渲染。
      -->
      <template v-if="audioProps.showCover && audioProps.layout === 'bar'">
        <div class="cover">
          <MediaImage
            v-if="coverAssetId"
            class="cover__img"
            :asset-id="coverAssetId"
            :alt="displayName || t('media.untitled')"
            fit="cover"
            ratio="1/1"
            :rounded="false"
            silent-on-error
          />
          <span v-else class="cover__img cover__img--placeholder" aria-hidden="true">
            <AppIcon name="music" :size="18" />
          </span>

          <span class="cover__name u-truncate">{{ displayName || t('media.untitled') }}</span>

          <!--
            底部一行：播放键在左、总时间在右（用户指定）。
            两者同处一行而不是上下堆叠——封面很薄，堆叠会挤在一起。
          -->
          <span class="cover__foot">
            <button
              v-if="audioProps.showPlayer"
              class="cover__play"
              type="button"
              :title="playing ? t('audio.pause') : t('audio.play')"
              :aria-label="playing ? t('audio.pause') : t('audio.play')"
              :aria-pressed="playing"
              @click="togglePlay"
            >
              <AppIcon :name="playing ? 'pause' : 'play'" :size="11" />
            </button>
            <span v-else />

            <span class="cover__total">
              {{ durationMs > 0 ? formatDuration(durationMs) : '--:--' }}
            </span>
          </span>
        </div>
      </template>

      <div class="audio__info">
        <!-- 曲名去掉扩展名：`Song.mp3` → `Song`（用户实测反馈） -->
        <span class="audio__name u-truncate">{{ displayName || t('media.untitled') }}</span>
        <span class="audio__duration">
          {{ durationMs > 0 ? formatDuration(durationMs) : '--:--' }}
        </span>
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
          :style="
            playing && hasSpectrum
              ? { height: `${Math.max(8, Math.round(value * 100))}%` }
              : undefined
          "
        />
      </div>

      <!--
        自研播放条（M9 取代浏览器原生 `<audio controls>`）。
        换掉它的原因有两条，都来自实测反馈：
          1. 原生那条的**已播放部分**是浏览器用固定色画的，改不了 → 现在用工具强调色
          2. 关不掉 → 现在可以整条隐藏（音频控制台提供播放控制时，这一条是重复的）
        时间固定在播放条**右侧**（用户明确要求的位置）。
      -->
      <div v-if="audioProps.showPlayer" class="player">
        <button
          v-if="audioProps.layout === 'square' || !audioProps.showCover"
          class="player__play player__play--inline"
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

        <span v-if="audioProps.layout === 'square'" class="player__time">
          {{ formatDuration(currentMs) }}
        </span>
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
  </div>
</template>

<style scoped>
.audio {
  display: flex;
  /*
   * v0.4.5 按实测反馈去掉内层卡片：模块本来就住在「模块卡片」里，
   * 再套一层底色 + 描边就成了"卡片里还有一张卡片"，
   * 左右两栏并排时尤其显得脏。这里只保留排布，不画面板。
   */
  padding: 0;
  background: none;
  border: none;
}

.audio__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: 100%;
  min-width: 0;
}

/* —— 长条布局（v0.5.0 重做） ——
 * 封面在左、右侧波形 + 进度条，卡片因此很薄。
 * 封面高度 = 右侧两行的高度（由 grid 自动拉齐，不需要写死像素）。
 */
.audio--bar .audio__body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: var(--sp-2) var(--sp-3);
  align-items: center;
}

/*
 * 封面占满左列两行——于是"封面高度 = 右侧波形 + 进度条的高度"
 * 由网格自动成立，不需要写死像素去凑。
 */
.audio--bar .cover {
  grid-row: 1 / span 2;
}

/*
 * 关掉封面时不该留一格空列：波形与播放条各占整行，
 * 否则它们会缩在左侧那一格里（看起来像坏了）。
 */
.audio--bar .audio__body > .wave:first-child,
.audio--bar .audio__body > .player:first-child {
  grid-column: 1 / -1;
}

.audio--bar .wave {
  grid-column: 2;
  grid-row: 1;
  align-self: end;
}

.audio--bar .player {
  grid-column: 2;
  grid-row: 2;
  align-self: start;
}

/*
 * 长条布局下名称/时长那一块整块不渲染——名字已经印在封面里了，
 * 再在右边重复一次就是同一句话出现两遍（而且会把网格挤出一行）。
 */
.audio--bar .audio__info {
  display: none;
}

.audio--bar.audio--no-cover .audio__body {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto;
}

.audio--bar.audio--no-cover .audio__body > .audio__info,
.audio--bar.audio--no-cover .audio__body > .wave,
.audio--bar.audio--no-cover .audio__body > .player {
  grid-column: 1;
  grid-row: auto;
}

.audio--bar.audio--no-cover .audio__info {
  display: flex;
}

/*
 * 封面块：方形、圆角，铺满卡片左侧那一格。
 *
 * 它同时是**内容的容器**（名字 / 播放键 / 总时间都压在它上面）：
 * 这样"封面高度 = 右侧波形 + 进度条的高度"是自动成立的，
 * 而不是靠调一个 magic number 去凑。
 */
.cover {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 68px;
  height: 100%;
  min-height: 52px;
  padding: 4px;
  overflow: hidden;
  background: var(--accent-soft, var(--bg-surface-2));
  border-radius: var(--radius-md);
}

.cover__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

/*
 * 没有内嵌封面时的图标：**居中**（用户第二次反馈"调整占位的音符的位置"）。
 *
 * 第一次我把它挪到右上角是为了躲开左下角的播放键——那时播放键还在
 * 纵向流里、正好压在中间。现在播放键已经归到 `.cover__foot` 那一行，
 * 中间整块都空着，占位图标回到正中才是它该在的位置。
 */
.cover__img--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0.75;
}

.cover__name,
.cover__foot {
  position: relative;
  z-index: 1;
}

.cover__foot {
  display: flex;
  gap: var(--sp-1);
  align-items: center;
  justify-content: space-between;
}

.cover__name {
  font-size: 9px;
  line-height: 1.2;
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 70%);
}

.cover__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: #fff;
  background: rgb(0 0 0 / 45%);
  border: none;
  border-radius: var(--radius-full);
}

.cover__play:hover {
  background: rgb(0 0 0 / 70%);
}

.cover__total {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgb(255 255 255 / 85%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 70%);
}

/* 封面上压了字，整块盖一层渐变保证可读 */
.cover::after {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  background: linear-gradient(to bottom, rgb(0 0 0 / 55%), rgb(0 0 0 / 15%) 45%, rgb(0 0 0 / 60%));
}

/* 没有封面图（占位态）时不加压暗，否则只剩一块黑 */
.cover:has(.cover__img--placeholder)::after {
  background: none;
}

.cover:has(.cover__img--placeholder) .cover__name,
.cover:has(.cover__img--placeholder) .cover__total {
  color: var(--text-secondary);
  text-shadow: none;
}

.cover:has(.cover__img--placeholder) .cover__play {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

/* —— 正方形布局：封面铺满作背景，其余内容叠在上面 —— */
.audio--square {
  position: relative;
  display: block;
  /* 边长取"可用宽度的全部，但不超过 320px"：
     整卡宽度的正方形在大屏上会变成 500px 见方，一屏放不下两个模块。 */
  width: min(100%, 320px);
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: var(--radius-md);
  /* 居中（用户要求）：不写这一条它会贴在左侧，与长条布局的左对齐视觉不一致 */
  margin-inline: auto;
}

/* 正方形布局下内容整体居中（名称、波形、播放条都对齐到中轴） */
.audio--square .audio__body {
  align-items: center;
  text-align: center;
}

.audio__backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background-color: var(--accent-soft, var(--bg-surface-2));
  background-image: var(--audio-cover, none);
  background-position: center;
  background-size: cover;
}

/* 占位态：不铺封面图，只留品牌色底 + 一枚音符 */
.audio__backdrop--placeholder {
  background-image: none;
}

/*
 * 叠在封面上的那层内容。
 * 加一层自上而下的暗化渐变：封面可能是亮的，白字压上去会看不清。
 * 用渐变而不是整块半透明黑，是为了让上半部分仍然看得到封面。
 */
.audio--square .audio__body {
  position: relative;
  justify-content: space-between;
  height: 100%;
  padding: var(--sp-3);
  background: linear-gradient(
    to bottom,
    rgb(0 0 0 / 45%) 0%,
    rgb(0 0 0 / 25%) 45%,
    rgb(0 0 0 / 70%) 100%
  );
}

/*
 * 名称块**不要**参与伸展：基础样式里它是 flex:1（长条布局需要它填满右侧），
 * 在正方形布局里那会把它拉成一整片空白，名称孤零零挂在顶上。
 */
.audio--square .audio__info {
  flex: none;
}

/* 封面之上的一切都必须用浅色字——它们压在一张不确定的图片上 */
.audio--square .audio__name,
.audio--square .audio__duration,
.audio--square .player__time {
  color: #fff;
}

.audio--square .player__seek::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    var(--accent, var(--accent-500)) var(--played, 0%),
    rgb(255 255 255 / 35%) var(--played, 0%)
  );
}

.audio--square .player__seek::-moz-range-track {
  background: linear-gradient(
    to right,
    var(--accent, var(--accent-500)) var(--played, 0%),
    rgb(255 255 255 / 35%) var(--played, 0%)
  );
}

.audio--square .audio__el,
.audio--square .audio__state {
  display: none;
}

.audio__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-1);
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
