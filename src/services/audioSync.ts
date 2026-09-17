/**
 * 双轨同步播放引擎（§13）
 *
 * 为什么必须共用一个时钟源：
 *   两个 `<audio>` 各自按自己的 `currentTime` 推进，起播瞬间就可能差几十毫秒，
 *   播放中途还会持续漂移。音乐对比场景下这种偏差是**结论级错误**——
 *   用户会听到"错位"从而误判某个工具的质量。
 *   因此这里让两条音轨共用同一个 `AudioContext` 时钟，并周期性校正。
 *
 * 设计要点：
 *   1. **纯逻辑、无 Vue**：可在单测里用假的 AudioContext 验证校正算法
 *   2. **降级明确**：拿不到 AudioContext 或媒体跨域时返回具体原因，
 *      由 UI 提示"已降级为独立播放"，绝不假装同步成功
 *   3. **Solo 用淡出而非暂停**：暂停会打断时钟，切回来又要重新对齐；
 *      把 gain 淡到 0 可以让时钟继续走
 */

/** 单条音轨 */
export interface SyncTrack {
  sideId: string
  element: HTMLMediaElement
  /** 用户设定的偏移量（ms）：用于补偿前奏差异 */
  offsetMs: number
}

export type SyncDegradeReason =
  | 'no-audio-context'
  | 'source-node-failed'
  | 'no-tracks'
  | 'cross-origin'

export interface SyncStatus {
  supported: boolean
  /** 降级原因；supported 为 true 时不存在（exactOptionalPropertyTypes 下不能显式赋 undefined） */
  reason?: SyncDegradeReason
  /** 两条音轨的实时漂移（ms）；未播放时为 0 */
  driftMs: number
  playing: boolean
  /** 已校正次数（用于诊断"是不是一直在硬拉"） */
  corrections: number
}

export interface SyncEngineOptions {
  /** 漂移超过该值才校正（ms） */
  driftThresholdMs?: number
  /** 校正采样间隔（ms） */
  sampleIntervalMs?: number
  /** 状态变化回调 */
  onStatus?: (status: SyncStatus) => void
}

/** 默认参数（§13.2） */
export const DEFAULT_DRIFT_THRESHOLD_MS = 120
export const DEFAULT_SAMPLE_INTERVAL_MS = 250

export class AudioSyncEngine {
  private context: AudioContext | null = null
  private tracks: SyncTrack[] = []
  private gains = new Map<string, GainNode>()
  private analysers = new Map<string, AnalyserNode>()
  private sources = new Map<string, MediaElementAudioSourceNode>()
  private volumes = new Map<string, number>()
  private soloed: string | null = null
  private muted = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private status: SyncStatus = { supported: false, driftMs: 0, playing: false, corrections: 0 }

  /** 主轨：以它为准校正另一条 */
  private masterSideId: string | null = null

  constructor(private readonly options: SyncEngineOptions = {}) {}

  /**
   * 装配音轨。失败时不会抛异常，而是返回降级原因——调用方据此提示用户。
   *
   * ⚠️ 这是**增量**装配，不是"推倒重来"。
   *
   * 原因：`createMediaElementSource` 对同一个元素**只能调用一次**，
   * 第二次会抛异常。而 v0.5.0 起音轨是**逐个**登记的（先有左侧、再来右侧），
   * 如果每次都先 `detach()`（关掉 AudioContext、断开所有 source）再重建，
   * 第二次装配就会在已绑定过的元素上抛错，整个引擎降级成 'cross-origin'，
   * 表现为"加了第二段音频之后波形反而没了"。
   *
   * 所以：已经建好的 source/gain/analyser **原样复用**，
   * 只为新出现的音轨建节点、只拆掉已经消失的音轨。
   */
  attach(tracks: SyncTrack[]): { ok: true } | { ok: false; reason: SyncDegradeReason } {
    if (tracks.length === 0) {
      this.detach()
      return { ok: false, reason: 'no-tracks' }
    }

    const Ctor = getAudioContextCtor()
    if (!Ctor) {
      this.setStatus({ supported: false, reason: 'no-audio-context' })
      return { ok: false, reason: 'no-audio-context' }
    }

    if (!this.context) {
      try {
        this.context = new Ctor()
      } catch {
        this.setStatus({ supported: false, reason: 'no-audio-context' })
        return { ok: false, reason: 'no-audio-context' }
      }
    }

    // 1. 拆掉已经不在列表里的音轨（换素材、模块被删掉）
    const nextSideIds = new Set(tracks.map((track) => track.sideId))
    for (const sideId of [...this.sources.keys()]) {
      if (nextSideIds.has(sideId)) continue
      this.disposeTrack(sideId)
    }

    // 2. 为新出现的音轨建节点（已有的直接跳过，绝不重复 createMediaElementSource）
    for (const track of tracks) {
      if (this.sources.has(track.sideId)) continue
      try {
        const source = this.context.createMediaElementSource(track.element)
        const gain = this.context.createGain()
        const analyser = this.context.createAnalyser()
        analyser.fftSize = 256

        source.connect(gain)
        gain.connect(analyser)
        analyser.connect(this.context.destination)

        this.sources.set(track.sideId, source)
        this.gains.set(track.sideId, gain)
        this.analysers.set(track.sideId, analyser)
        this.volumes.set(track.sideId, 0.8)
      } catch {
        // 跨域媒体无法接入分析器与增益控制（浏览器同源策略）
        this.detach()
        this.setStatus({ supported: false, reason: 'cross-origin' })
        return { ok: false, reason: 'cross-origin' }
      }
    }

    this.tracks = tracks
    this.applyGains()
    this.setStatus({ supported: true, driftMs: 0, playing: false, corrections: 0 })
    this.setStatus({ reason: undefined })
    return { ok: true }
  }

  /** 拆掉单条音轨的节点（保留 AudioContext 与其余音轨） */
  private disposeTrack(sideId: string): void {
    try {
      this.sources.get(sideId)?.disconnect()
    } catch {
      // 忽略：已经断开
    }
    this.sources.delete(sideId)
    this.gains.delete(sideId)
    this.analysers.delete(sideId)
    this.volumes.delete(sideId)
    this.muted.delete(sideId)
    if (this.masterSideId === sideId) this.masterSideId = null
    if (this.soloed === sideId) this.soloed = null
  }

  /** 拆掉所有连接（组件卸载、换素材时调用） */
  detach(): void {
    this.stopSampling()
    for (const source of this.sources.values()) {
      try {
        source.disconnect()
      } catch {
        // 忽略：已经断开
      }
    }
    this.sources.clear()
    this.gains.clear()
    this.analysers.clear()
    this.volumes.clear()
    this.tracks = []
    this.masterSideId = null
    this.soloed = null
    this.muted.clear()

    if (this.context) {
      void this.context.close().catch(() => void 0)
      this.context = null
    }
    this.setStatus({ supported: false, driftMs: 0, playing: false, corrections: 0 })
  }

  /** 是否已可用（可用于 UI 决定是否显示同步播放按钮） */
  get isSupported(): boolean {
    return this.status.supported
  }

  /**
   * 引擎是否已接管音轨。
   *
   * 音频模块的播放键据此决定怎么播：引擎接管了就交给引擎（这样频谱与漂移校正
   * 都有效），没接管就直接操作元素。M9 之前模块用的是浏览器原生控件，
   * 那时它**永远**绕开引擎，频谱也就永远是空的（表现为波形摊成一条线）。
   */
  get isAttached(): boolean {
    return this.tracks.length > 0 && this.context !== null
  }

  getStatus(): SyncStatus {
    return this.status
  }

  /** 设置某一侧的偏移量（补偿前奏差异） */
  setOffset(sideId: string, offsetMs: number): void {
    const track = this.tracks.find((item) => item.sideId === sideId)
    if (track) track.offsetMs = offsetMs
  }

  /** 指定主轨；不指定时自动取时长较长的一条 */
  setMaster(sideId: string | null): void {
    this.masterSideId = sideId
  }

  /**
   * 起播：两侧先对齐到各自 offset，再同时 play。
   *
   * 注意这里是**必须由用户手势触发**的——浏览器禁止无交互自动播放（§13.4）。
   */
  async play(): Promise<void> {
    if (!this.context || this.tracks.length === 0) return

    // 音频上下文可能因自动播放策略处于 suspended
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => void 0)
    }

    const master = this.resolveMaster()
    if (!master) return

    const targetMs = this.displayTimeMs(master)

    for (const track of this.tracks) {
      if (track === master) continue
      this.alignTrack(track, targetMs)
    }

    // 先对齐再一起 play，避免"一边先响"
    const results = await Promise.allSettled(this.tracks.map((track) => track.element.play()))
    const failed = results.some((item) => item.status === 'rejected')

    this.setStatus({ playing: !failed, driftMs: 0 })
    if (!failed) this.startSampling()
  }

  pause(): void {
    for (const track of this.tracks) track.element.pause()
    this.stopSampling()
    this.setStatus({ playing: false, driftMs: 0 })
  }

  /** 定位到某个时间点（两侧保持各自偏移） */
  seek(ms: number): void {
    for (const track of this.tracks) {
      const target = Math.max(0, (ms + track.offsetMs) / 1000)
      const duration = Number.isFinite(track.element.duration) ? track.element.duration : target
      track.element.currentTime = Math.min(target, Math.max(0, duration))
    }
    this.setStatus({ driftMs: 0 })
  }

  /**
   * 只定位**一侧**（v0.5.3，音频模块自己的进度条用）。
   *
   * 为什么需要它：`seek()` 是"整体定位"，两个音轨一起动。
   * 而模块里的进度条是**这一侧**的控件——用户拖它时另一侧也跟着跳，
   * 实测反馈"拖动进度条不应该一起变动"。
   *
   * 关键在**同时改写这一侧的偏移量**：引擎每 250ms 会把各轨对齐到参考轨，
   * 只写 `currentTime` 的话下一次采样就把它拉回原处
   * （这正是 M10 误判成"拨不动"的那个现象）。
   * 把偏移改成「目标位置 − 参考位置」之后，对齐公式算出来的落点
   * 恰好就是用户放下的位置，两边都自洽。
   */
  seekSide(sideId: string, ms: number): void {
    const track = this.tracks.find((item) => item.sideId === sideId)
    if (!track) return

    const reference = this.resolveMaster()
    const referenceMs = reference && reference.sideId !== sideId ? this.displayTimeMs(reference) : ms

    // 先改偏移再落位：顺序反过来的话中间会有一瞬按旧偏移对齐
    track.offsetMs = Math.round(ms - referenceMs)

    const target = Math.max(0, ms / 1000)
    const duration = Number.isFinite(track.element.duration) ? track.element.duration : target
    track.element.currentTime = Math.min(target, Math.max(0, duration))
    this.setStatus({ driftMs: 0 })
  }

  /** 以两侧中较早的播放位置为准，用于"从头对齐" */
  rewindToStart(): void {
    this.seek(0)
  }

  setSolo(sideId: string | null): void {
    this.soloed = sideId
    this.applyGains()
  }

  setMuted(sideId: string, muted: boolean): void {
    if (muted) this.muted.add(sideId)
    else this.muted.delete(sideId)
    this.applyGains()
  }

  setVolume(sideId: string, volume: number): void {
    this.volumes.set(sideId, Math.min(1, Math.max(0, volume)))
    this.applyGains()
  }

  /** 取某一侧的频谱数据（0~1 的数组），供 A6 动效使用 */
  getSpectrum(sideId: string, bars: number): number[] {
    const analyser = this.analysers.get(sideId)
    if (!analyser) return new Array<number>(bars).fill(0)

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    const step = Math.max(1, Math.floor(data.length / bars))
    const out: number[] = []
    for (let i = 0; i < bars; i += 1) {
      let sum = 0
      for (let j = 0; j < step; j += 1) sum += data[i * step + j] ?? 0
      out.push(sum / step / 255)
    }
    return out
  }

  /** 供测试驱动的一次采样（内部也会按 interval 自动调用） */
  sampleOnce(): void {
    if (!this.status.supported || this.tracks.length < 2) return

    const master = this.resolveMaster()
    if (!master) return

    const reference = this.displayTimeMs(master)
    let worst = 0

    for (const track of this.tracks) {
      if (track === master) continue
      const drift = this.displayTimeMs(track) - reference
      worst = Math.abs(drift) > Math.abs(worst) ? drift : worst

      const threshold = this.options.driftThresholdMs ?? DEFAULT_DRIFT_THRESHOLD_MS
      if (Math.abs(drift) > threshold) {
        this.alignTrack(track, reference)
        this.status = { ...this.status, corrections: this.status.corrections + 1 }
      }
    }

    this.setStatus({ driftMs: Math.round(worst) })
  }

  // ————————————————————————————————————————————————————————
  // 内部
  // ————————————————————————————————————————————————————————

  /**
   * 当前"显示时间"：媒体时间减去该侧偏移。
   * 偏移的意义是让两条音轨在**听觉上**对齐，所以比较时必须扣掉它。
   */
  private displayTimeMs(track: SyncTrack): number {
    return track.element.currentTime * 1000 - track.offsetMs
  }

  private alignTrack(track: SyncTrack, referenceMs: number): void {
    const target = Math.max(0, (referenceMs + track.offsetMs) / 1000)
    if (Math.abs(target - track.element.currentTime) < 0.001) return
    try {
      track.element.currentTime = target
    } catch {
      // 某些状态下不可 seek（如元数据未加载），跳过本次校正
    }
  }

  private resolveMaster(): SyncTrack | null {
    if (this.tracks.length === 0) return null

    if (this.masterSideId) {
      const explicit = this.tracks.find((track) => track.sideId === this.masterSideId)
      if (explicit) return explicit
    }

    // 默认取时长较长的一条：长的那条更可能是"完整版"，用它当基准更稳
    return this.tracks.reduce((longest, track) => {
      const a = Number.isFinite(longest.element.duration) ? longest.element.duration : 0
      const b = Number.isFinite(track.element.duration) ? track.element.duration : 0
      return b > a ? track : longest
    }, this.tracks[0]!)
  }

  /** 应用音量：solo 优先，其次 mute。用短时渐变避免爆音 */
  private applyGains(): void {
    const now = this.context?.currentTime ?? 0
    for (const [sideId, gain] of this.gains) {
      const solo = this.soloed
      const audible = solo ? sideId === solo : !this.muted.has(sideId)
      const volume = this.volumes.get(sideId) ?? 0.8
      const target = audible ? volume : 0

      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setTargetAtTime(target, now, 0.04)
      } catch {
        gain.gain.value = target
      }
    }
  }

  private startSampling(): void {
    this.stopSampling()
    const interval = this.options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS
    this.timer = setInterval(() => this.sampleOnce(), interval)
  }

  private stopSampling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /**
   * 合并状态。
   *
   * 参数类型显式允许 undefined：SyncStatus 的 `reason` 是可选字段，
   * 在 exactOptionalPropertyTypes 下不能直接赋 undefined，
   * 因此这里做一次"值为 undefined 就删键"的归并。
   */
  private setStatus(patch: { [K in keyof SyncStatus]?: SyncStatus[K] | undefined }): void {
    const next: SyncStatus = { ...this.status }

    for (const [key, value] of Object.entries(patch) as Array<[keyof SyncStatus, unknown]>) {
      if (value === undefined) {
        delete next[key]
        continue
      }
      ;(next as unknown as Record<string, unknown>)[key] = value
    }

    this.status = next
    this.options.onStatus?.(this.status)
  }
}

/** 取 AudioContext 构造器（兼容 Safari 的 webkit 前缀；不存在时返回 null） */
export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** 环境是否支持同步播放（UI 提前判断，避免给出点不动的按钮） */
export function isSyncSupported(): boolean {
  return getAudioContextCtor() !== null
}
