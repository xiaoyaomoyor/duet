/**
 * 文字模块的类型定义
 *
 * （见 text/index.ts 顶部关于循环依赖的说明：类型必须放在这里而不是 index.ts，
 *   否则 index.ts → SFC → index.ts 会成环，dev server 会报 500。）
 */

export interface TextData {
  text: string
  align: 'left' | 'center' | 'right'
}

export interface TextProps {
  size: 'normal' | 'large'
  /**
   * 观感：正文 / 标注。
   *
   * `note` 是 M7 从原「备注」模块并进来的——同一份文本数据，
   * 只是渲染成带语气色的短句块。合并的理由见 index.ts。
   */
  variant: 'body' | 'note'
  /** 仅 `variant === 'note'` 时有意义 */
  tone: 'neutral' | 'good' | 'warn' | 'bad'
}
