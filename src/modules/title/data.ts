/**
 * 「标题」模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

/**
 * 标题模块**没有自己的数据**。
 *
 * 它显示的是"这一侧是谁"——名称、版本、LOGO、字号、匿名开关，
 * 全部存在 `Side` 上（`sheet.sides[]`）。
 *
 * 为什么不做成"把 Side 的字段搬进模块"：
 *   1. 一个对比方只有一份身份信息，而模块可以有很多个（能重复添加）；
 *      数据挂在模块上就会出现"两个标题模块各说各话"的状态，
 *      而画布、导出、只读页到处都要回答"这一侧叫什么"。
 *   2. 老工程里 Side 已经存着这些字段，搬家要迁移所有引用点。
 * 所以模块只是**一个可移动的视图**，指向同一个真源。
 */
export interface TitleData {
  /** 占位：schema 需要一个对象形状 */
  readonly placeholder?: never
}

export interface TitleProps {
  /** 是否显示 LOGO（由 Side.showIcon 决定时这里留空） */
  readonly placeholder?: never
}
