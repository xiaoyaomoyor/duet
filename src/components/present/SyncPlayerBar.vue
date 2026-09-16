<script setup lang="ts">
/**
 * 同步播放控制栏（§13）
 *
 * 出现条件：**两侧都登记了媒体元素**。只有一侧有时没有"双轨"可言，
 * 显示一条空控制栏只会让人困惑，因此条件不满足时整条不渲染。
 *
 * 设计取舍：
 *   - 播放/暂停/定位由控制栏统一发起（两侧同时动作），而不是各自播各自的
 *   - Solo / Mute 走 gain 淡出而非暂停，保证时钟不中断
 *   - 漂移值直接显示出来：用户能看到"已校正"，比默默硬拉更让人信任
 *   - 高级选项（偏移量、主轨）默认折叠，避免主流程被参数淹没
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import {
  attachSync,
  detachSync,
  getAudioState,
  getSyncEngine,
  getSyncStatus,
} from '@/composables/useAudioClock'
import { formatDuration } from '@/lib/time'
import type { Project, Side } from '@/types/project'

const props = defineProps<{
  project: Project
  /**
   * 作为**通用模块**内嵌在画布里（而不是作为固定控制栏）。
   *
   * 两者的差别只有两点：
   *   1. 内嵌时不能带 `no-export`——它现在是用户主动放进成稿的内容，必须能导出
   *   2. 内嵌时不再吸顶，随行滚动
   */
  embedded?: boolean
}>()

const { t } = useI18n()

const sides = computed<readonly Side[]>(() => props.project.sheet.sides)

const playing = ref(false)
const currentMs = ref(0)
const durationMs = ref(0)
const soloed = ref<string | null>(null)
const muted = ref<Set<string>>(new Set())
const volumes = ref<Record<string, number>>({})
const offsets = ref<Record<string, number>>({})
const driftMs = ref(0)
const corrections = ref(0)
const advancedOpen = ref(false)
/** 降级原因（有值时显示提示条） */
const degradeReason = ref<string | null>(null)
const attached = ref(false)

/**
 * 已有音轨的侧 id 列表（**响应式**）。
 *
 * 必须放在 ref 里：音轨是在媒体元素 loadedmetadata 之后才登记的，
 * 而 getAudioState 是普通函数、不参与响应式追踪。
 * 早期版本直接用它算"是否有两侧音频"，导致音频就绪后控制栏永远不出现，
 * 降级提示反而一直挂着。
 */
const readySideIds = ref<string[]>([])

/** 该侧是否有音轨（决定控制栏是否出现） */
const sidesWithAudio = computed(() =>
  sides.value.filter((side) => readySideIds.value.includes(side.id)),
)

const visible = computed(() => attached.value && sidesWithAudio.value.length >= 2)

/** 已装配的音轨集合，用于避免无意义地反复重建音频节点 */
let attachedKey = ''

function attach(): void {
  const ids = sidesWithAudio.value.map((side) => side.id)
  const key = ids.join('|')
  if (key === attachedKey && attached.value) return

  // 音轨变少（换素材/删模块）时先拆掉旧的，避免节点泄漏
  detachSync(props.project.id)
  attachedKey = ''

  const result = attachSync(props.project.id, ids)
  attached.value = result.ok
  degradeReason.value = result.ok ? null : (result.reason ?? null)

  if (result.ok) {
    attachedKey = key
    const engine = getSyncEngine(props.project.id)
    engine.setSolo(soloed.value)
  }
}

/** 轮询播放状态：引擎不主动推送进度（避免高频响应式更新） */
let pollTimer: ReturnType<typeof setInterval> | null = null
let tickCount = 0

function poll(): void {
  const first = sides.value[0]
  if (!first) return

  // 先刷新"哪些侧已有音轨"——它决定控制栏是否出现
  const ready = sides.value
    .filter((side) => getAudioState(side.id).durationMs > 0)
    .map((side) => side.id)
  if (ready.join('|') !== readySideIds.value.join('|')) {
    readySideIds.value = ready
    attach()
  }

  if (!attached.value) return

  const state = getAudioState(first.id)
  currentMs.value = state.currentMs
  playing.value = state.playing
  durationMs.value = Math.max(
    state.durationMs,
    ...sides.value.map((side) => getAudioState(side.id).durationMs),
  )

  const status = getSyncStatus()
  driftMs.value = status.driftMs
  corrections.value = status.corrections
}

async function togglePlay(): Promise<void> {
  const engine = getSyncEngine(props.project.id)
  if (playing.value) engine.pause()
  else await engine.play()
  poll()
}

function seekTo(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  getSyncEngine(props.project.id).seek(value)
  poll()
}

function restart(): void {
  getSyncEngine(props.project.id).rewindToStart()
  poll()
}

function toggleSolo(sideId: string): void {
  const next = soloed.value === sideId ? null : sideId
  soloed.value = next
  getSyncEngine(props.project.id).setSolo(next)
}

function toggleMute(sideId: string): void {
  const next = new Set(muted.value)
  if (next.has(sideId)) next.delete(sideId)
  else next.add(sideId)
  muted.value = next
  getSyncEngine(props.project.id).setMuted(sideId, next.has(sideId))
}

function setVolume(sideId: string, value: number): void {
  volumes.value = { ...volumes.value, [sideId]: value }
  getSyncEngine(props.project.id).setVolume(sideId, value)
}

function setOffset(sideId: string, value: number): void {
  offsets.value = { ...offsets.value, [sideId]: value }
  getSyncEngine(props.project.id).setOffset(sideId, value)
}

function setMaster(sideId: string): void {
  getSyncEngine(props.project.id).setMaster(sideId)
}

// ————————————————————————————————————————————————————————
// 生命周期
// ————————————————————————————————————————————————————————

onMounted(() => {
  // 立刻跑一轮，随后高频轮询一段时间以捕捉 loadedmetadata，
  // 之后降频（漂移显示不需要 200ms 的刷新率）
  poll()
  pollTimer = setInterval(() => {
    tickCount += 1
    poll()
    if (tickCount === 40 && pollTimer) {
      // 约 8 秒后降频到 1 秒一次
      clearInterval(pollTimer)
      pollTimer = setInterval(poll, 1000)
    }
  }, 200)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  detachSync(props.project.id)
  attachedKey = ''
})

/** 音轨就绪后重新尝试装配（首帧时媒体元素可能还没登记） */
function retryAttach(): void {
  attachedKey = ''
  attach()
}
</script>

<template>
  <div
    v-if="visible"
    class="syncbar"
    :class="{ 'no-export': !embedded, 'syncbar--embedded': embedded }"
  >
    <button
      class="syncbar__play"
      type="button"
      :title="playing ? t('sync.pause') : t('sync.play')"
      :aria-label="playing ? t('sync.pause') : t('sync.play')"
      :aria-pressed="playing"
      @click="togglePlay"
    >
      <AppIcon :name="playing ? 'pause' : 'play'" :size="16" />
    </button>

    <span class="syncbar__time">{{ formatDuration(currentMs) }}</span>

    <input
      class="syncbar__seek"
      type="range"
      min="0"
      :max="Math.max(1, durationMs)"
      :value="currentMs"
      :aria-label="t('sync.seek')"
      @input="seekTo"
    />

    <span class="syncbar__time syncbar__time--muted">{{ formatDuration(durationMs) }}</span>

    <div class="syncbar__side" v-for="(side, index) in sidesWithAudio" :key="side.id">
      <span class="syncbar__dot" :style="{ background: side.accent }" aria-hidden="true" />
      <button
        class="syncbar__chip"
        type="button"
        :class="{ 'syncbar__chip--on': soloed === side.id }"
        :title="t('sync.solo')"
        :aria-pressed="soloed === side.id"
        @click="toggleSolo(side.id)"
      >
        {{ t('sync.solo') }} {{ index === 0 ? 'A' : 'B' }}
      </button>
      <button
        class="syncbar__chip"
        type="button"
        :class="{ 'syncbar__chip--on': muted.has(side.id) }"
        :title="t('sync.mute')"
        :aria-pressed="muted.has(side.id)"
        @click="toggleMute(side.id)"
      >
        <AppIcon name="eye-off" :size="12" />
      </button>
      <input
        class="syncbar__volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="volumes[side.id] ?? 0.8"
        :aria-label="t('sync.volume')"
        @input="setVolume(side.id, Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <span class="syncbar__drift" :class="{ 'syncbar__drift--ok': Math.abs(driftMs) < 120 }">
      {{ t('sync.drift') }} {{ driftMs }}ms
      <template v-if="corrections > 0">· {{ t('sync.corrected', { n: corrections }) }}</template>
    </span>

    <button
      class="syncbar__chip"
      type="button"
      :aria-expanded="advancedOpen"
      @click="advancedOpen = !advancedOpen"
    >
      {{ t('sync.advanced') }}
    </button>
  </div>

  <!-- 降级提示：条件不满足时说明原因，而不是静默不显示 -->
  <p v-if="degradeReason && !visible" class="syncbar__degrade no-export">
    <AppIcon name="comment" :size="13" />
    {{ t(`sync.degrade.${degradeReason}`) }}
  </p>

  <div v-if="visible && advancedOpen" class="syncbar syncbar--advanced no-export">
    <template v-for="(side, index) in sidesWithAudio" :key="side.id">
      <label class="syncbar__field">
        <span>{{ index === 0 ? 'A' : 'B' }} {{ t('sync.offset') }}</span>
        <input
          class="syncbar__number"
          type="number"
          step="100"
          :value="offsets[side.id] ?? 0"
          @change="setOffset(side.id, Number(($event.target as HTMLInputElement).value))"
        />
        <span class="syncbar__unit">ms</span>
      </label>
      <button class="syncbar__chip" type="button" @click="setMaster(side.id)">
        {{ t('sync.setMaster') }} {{ index === 0 ? 'A' : 'B' }}
      </button>
    </template>
    <button class="syncbar__chip" type="button" @click="restart">
      {{ t('sync.restart') }}
    </button>
    <button class="syncbar__chip" type="button" @click="retryAttach">
      {{ t('common.retry') }}
    </button>
  </div>
</template>

<style scoped>
.syncbar {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

/*
 * 内嵌（作为通用模块）时：不再贴在页面顶部，而是一张独立的卡片。
 * 原先的 border-bottom 是"固定控制栏"的分隔线语义，在一张卡片上会显得像没画完的边框。
 */
.syncbar--embedded {
  flex-wrap: wrap;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.syncbar--advanced {
  flex-wrap: wrap;
  background: var(--bg-surface-2);
}

.syncbar__play {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--accent-fg);
  background: var(--accent-600);
  border-radius: var(--radius-full);
}

.syncbar__play:hover {
  background: var(--accent-700);
}

.syncbar__time {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.syncbar__time--muted {
  color: var(--text-muted);
}

.syncbar__seek {
  flex: 1;
  min-width: 80px;
  accent-color: var(--accent-600);
}

.syncbar__side {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
}

.syncbar__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.syncbar__chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.syncbar__chip:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.syncbar__chip--on {
  color: var(--accent-500);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.syncbar__volume {
  width: 64px;
  accent-color: var(--accent-600);
}

.syncbar__drift {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warning);
}

.syncbar__drift--ok {
  color: var(--text-disabled);
}

.syncbar__degrade {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-xs);
  color: var(--warning);
  border-bottom: 1px solid var(--border-subtle);
}

.syncbar__field {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.syncbar__number {
  width: 72px;
  padding: 2px var(--sp-2);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
}

.syncbar__unit {
  color: var(--text-disabled);
}
</style>
