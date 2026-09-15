/**
 * 富文本模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface RichTextData {
  /** 已净化的 HTML 片段 */
  html: string
}
