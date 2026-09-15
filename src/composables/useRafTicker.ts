/**
 * 统一的 requestAnimationFrame 调度器（§12.3）
 *
 * 为什么必须统一：
 *   频谱、进度条、播放脉冲都需要逐帧更新。如果每个组件各自起一个 rAF，
 *   一屏十几个模块就会有十几个循环互相抢占，帧率反而更差，
 *   而且页面不可见时无人负责暂停。
 *
 * 因此：全局只保留**一个** rAF 循环，谁需要逐帧更新就订阅它。
 * 页面不可见（document.hidden）时自动停表，恢复可见时自动续上。
 */

type Tick = (deltaMs: number, nowMs: number) => void

const ticks = new Set<Tick>()

let frameId: number | null = null
let lastTime = 0
let visibilityBound = false

function loop(now: number): void {
  const delta = lastTime === 0 ? 16 : now - lastTime
  lastTime = now

  // 复制一份再遍历：回调里可能会退订
  for (const tick of Array.from(ticks)) {
    try {
      tick(delta, now)
    } catch {
      // 单个订阅者出错不应拖垮整个循环
    }
  }

  frameId = ticks.size > 0 ? requestAnimationFrame(loop) : null
}

function start(): void {
  if (frameId !== null || ticks.size === 0) return
  bindVisibility()
  lastTime = 0
  frameId = requestAnimationFrame(loop)
}

function stop(): void {
  if (frameId === null) return
  cancelAnimationFrame(frameId)
  frameId = null
}

/** 页面不可见时停表（省电、避免后台空转） */
function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else start()
  })
}

/**
 * 订阅逐帧回调，返回退订函数。
 * 组件应在 onUnmounted 里调用它（或使用 useRafTick）。
 */
export function onRafTick(tick: Tick): () => void {
  ticks.add(tick)
  start()

  return () => {
    ticks.delete(tick)
    if (ticks.size === 0) stop()
  }
}

/** 当前订阅者数量（测试与诊断用） */
export function rafSubscriberCount(): number {
  return ticks.size
}

/** 仅测试使用：清空全部订阅并停表 */
export function __resetRaf(): void {
  ticks.clear()
  stop()
  lastTime = 0
}
