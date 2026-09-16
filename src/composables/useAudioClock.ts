/**
 * 播放时钟（组件侧 API）
 *
 * 演进说明：
 *   M2 时这是一个轻量的按 sideId 分组的发布订阅——各播放器自己上报 `currentTime`，
 *   歌词与进度条据此联动。那时还不需要真正的"同步"。
 *   M4 引入 `AudioSyncEngine` 后，**同一对比项目内两侧都有音轨**时，
 *   时钟由引擎统一驱动（共用 AudioContext、漂移校正、Solo/Mute）；
 *   其余情况（只有一侧有音轨、浏览器不支持、媒体跨域）仍走独立上报。
 *
 * 对外 API 保持 M2 的形状不变，因此歌词与进度条模块无需改动。
 */

import { onUnmounted, ref } from 'vue'
import { AudioSyncEngine, isSyncSupported, type SyncDegradeReason, type SyncStatus } from '@/services/audioSync'

export interface AudioClockState {
  currentMs: number
  durationMs: number
  playing: boolean
}

/** 某一侧的独立上报（降级路径 / 单轨场景） */
interface ManualState extends AudioClockState {
  /** 该侧的媒体元素（注册后由引擎接管） */
  element: HTMLMediaElement | null
  volume: number
  muted: boolean
  /** 偏移量（ms） */
  offsetMs: number
}

type Listener = (state: AudioClockState) => void

const manual = new Map<string, ManualState>()
const listeners = new Map<string, Set<Listener>>()

/** 每个项目一个引擎（不同项目不应互相干扰） */
const engines = new Map<string, AudioSyncEngine>()

function stateOf(sideId: string): ManualState {
  let state = manual.get(sideId)
  if (!state) {
    state = {
      currentMs: 0,
      durationMs: 0,
      playing: false,
      element: null,
      volume: 0.8,
      muted: false,
      offsetMs: 0,
    }
    manual.set(sideId, state)
  }
  return state
}

function emit(sideId: string, state: AudioClockState): void {
  const set = listeners.get(sideId)
  if (!set) return
  for (const listener of set) listener(state)
}

// ——————————————————————————————————————————————————————————
// 独立上报（降级路径）
// —————————————————————————————————————————————————————————

/** 播放器上报状态（由音频/视频模块的媒体事件调用） */
export function reportAudioState(sideId: string, patch: Partial<AudioClockState>): void {
  const next = { ...stateOf(sideId), ...patch }
  manual.set(sideId, next)
  emit(sideId, next)
}

/** 读取某个对比方当前的播放状态 */
export function getAudioState(sideId: string): AudioClockState {
  const state = stateOf(sideId)
  return { currentMs: state.currentMs, durationMs: state.durationMs, playing: state.playing }
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
    if (current.size === 0) listeners.delete(sideId)
  })

  return { currentMs, durationMs, playing }
}

/**
 * 订阅某个对比方的播放状态（**与组件生命周期无关**，供画布级逻辑使用）。
 *
 * 与 useAudioClock 的区别：那个返回 ref 并绑定组件生命周期，适合
 * "一个组件盯着一侧"；这个只给回调，适合"一块画布同时盯住两侧"——
 * 聚光灯需要判断"哪一侧正在播放"，而侧的数量是动态的，
 * 没法在 setup 里写死几次 useAudioClock 调用。
 *
 * 订阅瞬间会先推一次当前值，避免首帧停在"都没在播"的默认态。
 *
 * @returns 退订函数
 */
export function subscribeAudioState(sideId: string, listener: (state: AudioClockState) => void): () => void {
  let set = listeners.get(sideId)
  if (!set) {
    set = new Set()
    listeners.set(sideId, set)
  }
  set.add(listener)

  listener(getAudioState(sideId))

  return () => {
    const current = listeners.get(sideId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(sideId)
  }
}

// ——————————————————————————————————————————————————————————
// 引擎接管（同步路径）
// —————————————————————————————————————————————————————————

export interface RegisterTrackOptions {
  /** 所属对比项目（决定用哪个引擎） */
  projectId: string
  sideId: string
  element: HTMLMediaElement
}

/**
 * 把某侧的媒体元素登记到同步引擎。
 *
 * 注意 `createMediaElementSource` 对同一个元素**只能调用一次**，
 * 因此重复登记必须先移除旧元素；这也是为什么登记与注销要成对出现。
 */
export function registerSyncTrack(options: RegisterTrackOptions): void {
  const { projectId, sideId, element } = options
  const state = stateOf(sideId)
  state.element = element
  manual.set(sideId, state)
  void projectId
}

/** 注销某侧的媒体元素（模块卸载时调用） */
export function unregisterSyncTrack(sideId: string): void {
  const state = manual.get(sideId)
  if (state) state.element = null
}

/** 取得（或创建）某个项目的同步引擎 */
export function getSyncEngine(projectId: string): AudioSyncEngine {
  let engine = engines.get(projectId)
  if (!engine) {
    engine = new AudioSyncEngine({
      onStatus: (status) => {
        lastStatus = status
      },
    })
    engines.set(projectId, engine)
  }
  return engine
}

let lastStatus: SyncStatus = { supported: false, driftMs: 0, playing: false, corrections: 0 }

export function getSyncStatus(): SyncStatus {
  return lastStatus
}

export interface AttachResult {
  ok: boolean
  reason?: SyncDegradeReason
}

/**
 * 尝试装配双轨同步。
 * 条件：环境支持 + 两侧都登记了媒体元素。
 */
export function attachSync(projectId: string, sides: string[]): AttachResult {
  if (!isSyncSupported()) return { ok: false, reason: 'no-audio-context' }

  const tracks = sides
    .map((sideId) => {
      const state = manual.get(sideId)
      if (!state?.element) return null
      return { sideId, element: state.element, offsetMs: state.offsetMs }
    })
    .filter((track): track is { sideId: string; element: HTMLMediaElement; offsetMs: number } =>
      track !== null,
    )

  if (tracks.length < 2) return { ok: false, reason: 'no-tracks' }

  const engine = getSyncEngine(projectId)
  const result = engine.attach(tracks)
  if (result.ok) {
    // 引擎接管后，把播放时间同步到手动状态，让歌词/进度条无缝切换数据源
    engine.setMaster(null)
  }
  return result
}

/** 拆掉某个项目的同步（切换项目 / 卸载时调用） */
export function detachSync(projectId: string): void {
  engines.get(projectId)?.detach()
}

/** 供测试与诊断：清空全部状态 */
export function __resetAudioClocks(): void {
  for (const engine of engines.values()) engine.detach()
  engines.clear()
  manual.clear()
  listeners.clear()
  lastStatus = { supported: false, driftMs: 0, playing: false, corrections: 0 }
}
