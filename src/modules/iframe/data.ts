/**
 * 网页嵌入模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface IframeData {
  url: string
  /** 嵌入区高度（px） */
  height: number
}
