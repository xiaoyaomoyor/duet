/**
 * 进度条模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface ProgressData {
  /** 绑定的媒体资源（可选） */
  assetId?: string
  /** 手工时长（ms）；未绑定资源时使用 */
  manualDurationMs?: number
  showTime: boolean
  showWaveform: boolean
}
