/**
 * 展示视图的可见性判定（§7.4）
 *
 * 单独成模块的原因：这条规则同时被**画布**（决定整行是否跳过）
 * 与**行组件**（决定单个模块是否渲染）使用。
 * 两处各写一份判定迟早会漂移，因此收敛到这里作为唯一真源。
 */

import { getModule } from './registry'
import type { ModuleInstance } from '@/types/project'

/**
 * 该模块是否应该在展示视图出现。
 *
 * 三态规则：
 *   - 空模块（模块自己判定 isEmpty）→ 不出现
 *   - 用户手动隐藏（hidden）        → 不出现
 *   - 模块类型未注册                → 不出现（宁可漏渲染也不要崩）
 *   - 其余                          → 出现
 *
 * ⚠️ 防御式设计（踩过的坑）：
 *   这里在**渲染期**运行，data 可能是 `{}` 或旧版本遗留的残缺对象。
 *   早期实现直接调用 `definition.isEmpty(module.data, module.props)`，
 *   而某些模块的 isEmpty 会写 `data.text.trim()`，遇到 `{}` 直接抛
 *   TypeError，**整个展示视图白屏**。
 *   现在先过一遍 schema.isData：形状不对就当作"不可展示"，
 *   而不是把异常抛到渲染函数里。
 */
export function isPresentable(module: ModuleInstance): boolean {
  if (module.hidden) return false

  const definition = getModule(module.type)
  if (!definition) return false

  // 形状不对（残缺/损坏）时不展示，避免 isEmpty 内部崩掉
  if (!definition.schema.isData(module.data)) return false

  try {
    return !definition.isEmpty(module.data, module.props)
  } catch {
    // 模块自身的判定出错也不该拖垮整页
    return false
  }
}

/** 一组模块中是否有可见的（用于整行/整格跳过判定） */
export function hasPresentable(modules: readonly ModuleInstance[]): boolean {
  return modules.some((module) => isPresentable(module))
}
