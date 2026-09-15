/**
 * 模块注册入口（唯一的副作用注册点）
 *
 * 纪律：新增模块只需在这里加一行 import；
 * 其余任何地方都不应该出现"模块类型 → 组件"的映射。
 *
 * 注册顺序不影响功能（选择器按 modules/meta.ts 的声明顺序排列），
 * 但为可读性仍按"媒体 → 文本 → 数据 → 布局"分组。
 */

// 媒体
import './cover'
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
import './note'
import './code'
import './diff'

// 数据
import './keyValue'
import './link'
import './progress'
import './score'
import './stars'
import './tagList'
import './timeline'

// 布局
import './divider'
import './placeholder'

// 高级
import './iframe'

export { allModules, getModule, hasModule, registerModule, registeredTypes } from './registry'
export type { AnyModuleDefinition } from './registry'
export type { ModuleDefinition, ModuleEditorProps, ModuleRendererProps } from './types'
