/**
 * 音频模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface AudioProps {
  /** 波形展示（M4 接入真实波形数据；M2 显示占位律动） */
  showWaveform: boolean
  /** 是否上报播放时间（供歌词/进度条联动） */
  reportClock: boolean
}
