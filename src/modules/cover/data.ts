/**
 * 封面图模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface CoverProps {
  ratio: '1/1' | '4/3' | '16/9' | '3/4' | 'auto'
}
