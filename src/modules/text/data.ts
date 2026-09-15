/**
 * 文字模块的类型定义（见本文件顶部关于循环依赖的说明）
 */

export interface TextData {
  text: string
  align: 'left' | 'center' | 'right'
}

export interface TextProps {
  size: 'normal' | 'large'
}
