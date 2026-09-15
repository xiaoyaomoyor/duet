/**
 * 参数表模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface KeyValueRow {
  key: string
  value: string
}

export interface KeyValueData {
  rows: KeyValueRow[]
}

export interface KeyValueProps {
  /** 行底色样式：striped 适合密集参数 */
  variant: 'plain' | 'striped'
}
