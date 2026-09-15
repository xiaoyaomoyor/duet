<script setup lang="ts">
/**
 * 歌词渲染器
 *
 * - 有时间轴：按播放进度高亮当前行并平滑滚动到中部
 * - 无时间轴：静态展示，不做假同步（不给出误导性的高亮）
 * - 固定高度 + 内部滚动，保证左右两栏高度可预期（§7.5 对齐）
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { findActiveLine, parseLrc, plainLines } from '@/lib/lrc'
import { useAudioClock } from '@/composables/useAudioClock'
import type { ModuleRendererProps } from '../types'
import type { LyricsData } from './data'

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()

const data = computed<LyricsData>(() => {
  const raw = props.module.data as Partial<LyricsData> | undefined
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    syncWithAudio: raw?.syncWithAudio !== false,
    maxHeight: raw?.maxHeight ?? 240,
  }
})

const parsed = computed(() => parseLrc(data.value.text))
const timed = computed(() => parsed.value.timed && data.value.syncWithAudio)

/** 统一成"行"结构，供两种模式共用渲染 */
const lines = computed<Array<{ key: string; text: string; timeMs: number }>>(() =>
  timed.value
    ? parsed.value.lines.map((line, index) => ({
        key: `t${index}`,
        text: line.text,
        timeMs: line.timeMs,
      }))
    : plainLines(data.value.text).map((text, index) => ({
        key: `p${index}`,
        text,
        timeMs: -1,
      })),
)

const clock = useAudioClock(props.sideId)

/** 当前高亮行；仅在"有时间轴且已开始播放"时给出 */
const activeIndex = computed(() => {
  if (!timed.value) return -1
  if (!clock.playing.value && clock.currentMs.value === 0) return -1
  return findActiveLine(parsed.value.lines, clock.currentMs.value)
})

const scroller = ref<HTMLElement | null>(null)

watch(activeIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  const container = scroller.value
  if (!container) return

  const line = container.querySelector<HTMLElement>(`[data-line="${index}"]`)
  if (!line) return

  // 平滑滚动到容器中部，避免当前行贴边
  const top = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
})
</script>

<template>
  <div class="lyrics" :style="{ maxHeight: `${data.maxHeight}px` }">
    <div ref="scroller" class="lyrics__scroll u-scroll-y" :style="{ maxHeight: `${data.maxHeight}px` }">
      <p
        v-for="(line, index) in lines"
        :key="line.key"
        class="lyrics__line"
        :class="{ 'lyrics__line--active': index === activeIndex }"
        :data-line="index"
      >
        {{ line.text }}
      </p>
    </div>

    <span v-if="timed" class="lyrics__badge">{{ t('lyrics.synced') }}</span>
    <span v-else-if="parsed.timed" class="lyrics__badge lyrics__badge--muted">
      {{ t('lyrics.syncOff') }}
    </span>
  </div>
</template>

<style scoped>
.lyrics {
  position: relative;
}

.lyrics__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-right: var(--sp-2);
  scroll-behavior: smooth;
}

.lyrics__line {
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  color: var(--text-muted);
  transition:
    color var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.lyrics__line--active {
  color: var(--text-primary);
  transform: translateX(4px);
}

/* 当前行左侧的强调竖条：用伪元素避免额外 DOM */
.lyrics__line--active::before {
  display: inline-block;
  width: 2px;
  height: 0.9em;
  margin-right: var(--sp-2);
  vertical-align: -0.1em;
  content: '';
  background: var(--accent, var(--accent-500));
  border-radius: var(--radius-full);
}

.lyrics__badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0 6px;
  font-size: 10px;
  color: var(--success);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.lyrics__badge--muted {
  color: var(--text-muted);
}
</style>
