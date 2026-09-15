/**
 * 歌词模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface LyricsData {
  /** 原始文本（保留用户输入的原貌，便于二次编辑） */
  text: string
  /** 是否与音频同步（仅在有时间轴时有意义） */
  syncWithAudio: boolean
  /** 展示区最大高度（px），超出后内部滚动 */
  maxHeight: number
}
