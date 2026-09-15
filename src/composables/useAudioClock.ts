/**
 * 侧内播放时钟（M2 的最小实现）
 *
 * 用途：让同一对比方内的"音频模块"与"歌词/进度条模块"共享播放时间，
 * 从而在 M2 就能看到歌词实时高亮。
 *
 * ⚠️ 架构说明：
 *   这是 M2 的过渡实现——一个轻量的按 sideId 分组的发布订阅。
 *   M4 会把它替换为基于 AudioContext 的**双轨同步播放服务**（§13），
 *   届时只需替换本文件内部实现，对外 API（useAudioClock）保持不变。
 *
 * 之所以不在 M2 直接做完整同步：双轨对齐、漂移校正、Solo/Mute
 * 需要音频分析器与统一的时钟源，属于 M4 的交付范围。
 */

import { onUnmounted, ref } from 'vue'

interface AudioClockState {
  currentMs: number
  durationMs: number
  playing: boolean
}

type Listener = (state: AudioClockState) => void

const states = new Map<string, AudioClockState>()
const listeners = new Map<string, Set<Listener>>()

function stateOf(sideId: string): AudioClockState {
  let state = states.get(sideId)
  if (!state) {
    state = { currentMs: 0, durationMs: 0, playing: false }
    states.set(sideId, state)
  }
  return state
}

/** 播放器上报状态（由音频/视频模块的媒体事件调用） */
export function reportAudioState(sideId: string, patch: Partial<AudioClockState>): void {
  const next = { ...stateOf(sideId), ...patch }
  states.set(sideId, next)

  const set = listeners.get(sideId)
  if (!set) return
  for (const listener of set) listener(next)
}

/** 读取某个对比方当前的播放状态 */
export function getAudioState(sideId: string): AudioClockState {
  return stateOf(sideId)
}

/**
 * 订阅某个对比方的播放状态。
 * 组件卸载时自动退订；订阅瞬间会收到一次当前值，避免首帧空状态。
 */
export function useAudioClock(sideId: string) {
  const currentMs = ref(stateOf(sideId).currentMs)
  const durationMs = ref(stateOf(sideId).durationMs)
  const playing = ref(stateOf(sideId).playing)

  const listener: Listener = (state) => {
    currentMs.value = state.currentMs
    durationMs.value = state.durationMs
    playing.value = state.playing
  }

  let set = listeners.get(sideId)
  if (!set) {
    set = new Set()
    listeners.set(sideId, set)
  }
  set.add(listener)

  onUnmounted(() => {
    const current = listeners.get(sideId)
    if (!current) return
    current.delete(listener)
    // 无人订阅时清掉分组，避免长期驻留
    if (current.size === 0) listeners.delete(sideId)
  })

  return { currentMs, durationMs, playing }
}

/** 仅测试使用：清空全部时钟状态 */
export function __resetAudioClocks(): void {
  states.clear()
  listeners.clear()
}
