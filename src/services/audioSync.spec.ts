/**
 * 双轨同步引擎单测（§13）
 *
 * 同步播放是本项目里**最容易被"看起来对了"骗过去**的功能：
 * 界面上两条进度条一起走，不代表真的对齐。因此这里用假的
 * AudioContext / 媒体元素，直接验证校正算法本身。
 *
 * 覆盖三类风险：
 *   1. 起播不对齐（一侧先响）
 *   2. 播放中持续漂移而不被校正
 *   3. 环境不支持或跨域时**假装成功**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AudioSyncEngine,
  DEFAULT_DRIFT_THRESHOLD_MS,
  getAudioContextCtor,
  isSyncSupported,
  type SyncStatus,
} from './audioSync'

// ——————————————————————————————————————————————————————————
// 测试替身
// ——————————————————————————————————————————————————————————

/** 只记录调用的最小 GainNode / AnalyserNode 替身 */
function makeGainStub() {
  return {
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

function makeAnalyserStub() {
  return {
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: (data: Uint8Array) => {
      // 固定给一个递增的频谱，便于断言映射关系
      for (let i = 0; i < data.length; i += 1) data[i] = Math.min(255, i * 2)
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = { connect: vi.fn() }

  createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
  createGain = vi.fn(() => makeGainStub())
  createAnalyser = vi.fn(() => makeAnalyserStub())
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
}

/** 可控的媒体元素替身 */
function makeElement(options: { duration?: number; currentTime?: number } = {}) {
  const element = {
    currentTime: options.currentTime ?? 0,
    duration: options.duration ?? 120,
    paused: true,
    play: vi.fn(async function (this: unknown) {
      return undefined
    }),
    pause: vi.fn(),
  }
  return element as unknown as HTMLMediaElement & { currentTime: number; duration: number }
}

/** 把假的 AudioContext 装到 window 上 */
function installFakeContext(): void {
  ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
}

function removeContext(): void {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext
  delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
}

beforeEach(() => {
  removeContext()
})

// ——————————————————————————————————————————————————————————
// 环境能力
// ——————————————————————————————————————————————————————————

describe('环境能力探测', () => {
  it('没有 AudioContext 时明确返回不支持（而不是静默失败）', () => {
    expect(getAudioContextCtor()).toBeNull()
    expect(isSyncSupported()).toBe(false)
  })

  it('有 AudioContext 时视为支持', () => {
    installFakeContext()
    expect(isSyncSupported()).toBe(true)
  })

  it('支持 webkit 前缀（Safari）', () => {
    ;(window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = FakeAudioContext
    expect(getAudioContextCtor()).toBe(FakeAudioContext)
  })
})

// ——————————————————————————————————————————————————————————
// 装配与降级
// ——————————————————————————————————————————————————————————

describe('装配与降级', () => {
  it('没有音轨时返回 no-tracks', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const result = engine.attach([])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-tracks')
  })

  it('环境不支持时返回 no-audio-context，且不抛异常', () => {
    const engine = new AudioSyncEngine()
    const result = engine.attach([{ sideId: 'a', element: makeElement(), offsetMs: 0 }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-audio-context')
    expect(engine.isSupported).toBe(false)
  })

  it('媒体无法接入音频节点时返回 cross-origin', () => {
    // 用一个"创建源节点必失败"的专用替身，避免污染其他用例共享的类
    class CrossOriginAudioContext extends FakeAudioContext {
      override createMediaElementSource = vi.fn(() => {
        throw new DOMException('cross origin', 'SecurityError')
      }) as unknown as FakeAudioContext['createMediaElementSource']
    }
    ;(window as unknown as { AudioContext: unknown }).AudioContext = CrossOriginAudioContext

    const engine = new AudioSyncEngine()
    const result = engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('cross-origin')
    expect(engine.isSupported).toBe(false)
  })

  it('装配成功后状态标记为可用', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const result = engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    expect(result.ok).toBe(true)
    expect(engine.isSupported).toBe(true)
    expect(engine.getStatus().reason).toBeUndefined()
  })

  it('detach 后回到不支持状态（便于切换素材后重新装配）', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    engine.detach()
    expect(engine.isSupported).toBe(false)
  })
})

// ——————————————————————————————————————————————————————————
// 对齐与校正（核心）
// ——————————————————————————————————————————————————————————

describe('起播对齐', () => {
  it('起播时把两侧对齐到同一时刻', async () => {
    installFakeContext()
    const engine = new AudioSyncEngine()

    // A 已经播到 5 秒，B 还在 0
    const a = makeElement({ currentTime: 5, duration: 60 })
    const b = makeElement({ currentTime: 0, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    await engine.play()

    // 主轨取时长较长的 B（120s），A 应被拉到 B 的位置
    expect(b.currentTime).toBe(0)
    expect(a.currentTime).toBeCloseTo(0, 3)
  })

  it('偏移量参与对齐：offset 表示"这一侧要提前/延后多少"', async () => {
    installFakeContext()
    const engine = new AudioSyncEngine()

    const a = makeElement({ currentTime: 0, duration: 60 })
    const b = makeElement({ currentTime: 0, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 2000 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    // 主轨 B 在 10 秒处起播 → A 应定位到 12 秒（提前 2 秒，以补偿前奏差异）
    b.currentTime = 10
    await engine.play()

    expect(a.currentTime).toBeCloseTo(12, 3)
  })

  it('两侧都调用 play（不能只播一侧）', async () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement()
    const b = makeElement()

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])
    await engine.play()

    expect(a.play).toHaveBeenCalledTimes(1)
    expect(b.play).toHaveBeenCalledTimes(1)
  })
})

describe('漂移校正', () => {
  it('漂移在阈值内不校正', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ currentTime: 10, duration: 60 })
    const b = makeElement({ currentTime: 10.05, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.sampleOnce()

    expect(engine.getStatus().corrections).toBe(0)
    expect(a.currentTime).toBe(10)
    // 漂移会被记录（用于界面显示）
    expect(Math.abs(engine.getStatus().driftMs)).toBeCloseTo(50, 0)
  })

  it('漂移超过阈值时被硬校正回主轨', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ currentTime: 10, duration: 60 })
    const b = makeElement({ currentTime: 12, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    // 主轨是 b（时长更长），a 落后 2 秒 → 应被拉到 12
    engine.sampleOnce()

    expect(a.currentTime).toBeCloseTo(12, 3)
    expect(engine.getStatus().corrections).toBe(1)
  })

  it('阈值可配置', () => {
    installFakeContext()
    const engine = new AudioSyncEngine({ driftThresholdMs: 5000 })
    const a = makeElement({ currentTime: 10, duration: 60 })
    const b = makeElement({ currentTime: 12, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])
    engine.sampleOnce()

    expect(engine.getStatus().corrections).toBe(0)
    expect(a.currentTime).toBe(10)
  })

  it('默认阈值与规范一致（120ms）', () => {
    expect(DEFAULT_DRIFT_THRESHOLD_MS).toBe(120)
  })

  it('校正计数会累计，便于诊断"是不是一直在硬拉"', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ currentTime: 10, duration: 60 })
    const b = makeElement({ currentTime: 12, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.sampleOnce()
    a.currentTime = 10 // 再次跑偏
    engine.sampleOnce()

    expect(engine.getStatus().corrections).toBe(2)
  })

  it('只有一条音轨时不做校正（无可比对象）', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ currentTime: 10, duration: 60 })

    engine.attach([{ sideId: 'a', element: a, offsetMs: 0 }])
    engine.sampleOnce()

    expect(engine.getStatus().corrections).toBe(0)
  })
})

// ——————————————————————————————————————————————————————————
// 定位、Solo、音量
// ——————————————————————————————————————————————————————————

describe('定位', () => {
  it('seek 保持两侧偏移关系', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ duration: 60 })
    const b = makeElement({ duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 1500 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.seek(20_000)

    expect(b.currentTime).toBeCloseTo(20, 3)
    expect(a.currentTime).toBeCloseTo(21.5, 3)
  })

  it('seek 不会越过媒体时长', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ duration: 30 })
    const b = makeElement({ duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.seek(90_000)
    expect(a.currentTime).toBe(30)
  })

  it('回到开头', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement({ currentTime: 30, duration: 60 })
    const b = makeElement({ currentTime: 40, duration: 120 })

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.rewindToStart()
    expect(a.currentTime).toBe(0)
    expect(b.currentTime).toBe(0)
  })
})

describe('Solo 与静音', () => {
  it('Solo 一侧时另一侧目标音量为 0（而不是暂停）', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const a = makeElement()
    const b = makeElement()

    engine.attach([
      { sideId: 'a', element: a, offsetMs: 0 },
      { sideId: 'b', element: b, offsetMs: 0 },
    ])

    engine.setSolo('a')

    // 关键：没有调用 pause —— 暂停会打断时钟
    expect(a.pause).not.toHaveBeenCalled()
    expect(b.pause).not.toHaveBeenCalled()
  })

  it('静音与取消静音都不抛异常', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    expect(() => engine.setMuted('a', true)).not.toThrow()
    expect(() => engine.setMuted('a', false)).not.toThrow()
    expect(() => engine.setSolo(null)).not.toThrow()
  })

  it('音量被限制在 0~1', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    expect(() => engine.setVolume('a', 5)).not.toThrow()
    expect(() => engine.setVolume('a', -3)).not.toThrow()
  })
})

describe('频谱数据', () => {
  it('返回指定数量的条，且取值在 0~1', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    const bars = engine.getSpectrum('a', 16)
    expect(bars).toHaveLength(16)
    for (const value of bars) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('未装配的侧返回全 0（不抛异常）', () => {
    installFakeContext()
    const engine = new AudioSyncEngine()
    const bars = engine.getSpectrum('nope', 8)
    expect(bars).toEqual(new Array<number>(8).fill(0))
  })
})

describe('状态回调', () => {
  it('状态变化会通知订阅者', () => {
    installFakeContext()
    const seen: SyncStatus[] = []
    const engine = new AudioSyncEngine({ onStatus: (status) => seen.push(status) })

    engine.attach([
      { sideId: 'a', element: makeElement(), offsetMs: 0 },
      { sideId: 'b', element: makeElement(), offsetMs: 0 },
    ])

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.supported).toBe(true)
  })
})
