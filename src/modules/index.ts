/**
 * 模块注册入口（唯一的副作用注册点）
 *
 * 纪律：新增模块只需在这里加一行 import；
 * 其余任何地方都不应该出现"模块类型 → 组件"的映射。
 *
 * 注册顺序不影响功能（选择器按 modules/meta.ts 的声明顺序排列），
 * 但为可读性仍按"媒体 → 文本 → 数据 → 布局 → 通用"分组。
 *
 * M7 归纳：`cover` 并入 `image`、`stars` 并入 `score`、`note` 并入 `text`。
 * 三者都是"同一份数据、只差观感"的重复，合并后由选项区分
 * （image.fit / score.style / text.variant）。
 */

// 媒体
import './image'
import './gallery'
import './audio'
import './video'
import './model3d'

// 文本
import './text'
import './lyrics'
import './markdown'
import './richText'
import './code'
import './diff'

// 数据
import './keyValue'
import './link'
import './progress'
import './score'
import './tagList'
import './timeline'

// 布局
import './divider'
import './placeholder'
import './title'

// 高级
import './iframe'
import './audioConsole'

export { allModules, getModule, hasModule, registerModule, registeredTypes } from './registry'
export type { AnyModuleDefinition } from './registry'
export type { ModuleDefinition, ModuleEditorProps, ModuleRendererProps } from './types'
