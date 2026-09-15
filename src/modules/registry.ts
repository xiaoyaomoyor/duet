/**
 * 模块注册表
 *
 * 纪律：
 *   1. 所有模块在 modules/index.ts 中集中 import 一次（副作用注册）。
 *   2. 注册与 meta.ts 的一致性由 modules/registry.spec.ts 断言——
 *      任何一边漏登记都会让单测失败。
 */

import type { ModuleDefinition } from './types'
import { MODULE_META } from './meta'

/**
 * 注册表内部的统一类型。
 *
 * 为什么需要它：ModuleDefinition 的 isEmpty / schema 参数是**逆变的**，
 * 因此 ModuleDefinition<TextData> 无法赋给 ModuleDefinition<unknown>。
 * 注册表只做"类型 id → 定义"的登记，不消费这些泛型参数，
 * 所以这里用一次显式别名把泛型抹平，而不是让 11 个模块各写一遍转换。
 *
 * 这是全项目唯一允许出现 any 的位置，理由已在此说明。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyModuleDefinition = ModuleDefinition<any, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

const registry = new Map<string, ModuleDefinition>()

export function registerModule(definition: AnyModuleDefinition): void {
  if (registry.has(definition.type)) {
    // 重复注册是编码错误：同一类型有两个实现会让渲染结果不可预测
    throw new Error(`模块类型重复注册：${definition.type}`)
  }
  registry.set(definition.type, definition as ModuleDefinition)
}

export function getModule(type: string): ModuleDefinition | undefined {
  return registry.get(type)
}

export function hasModule(type: string): boolean {
  return registry.has(type)
}

/** 已实现（可直接使用）的模块类型 id */
export function registeredTypes(): string[] {
  return Array.from(registry.keys())
}

/** 全部已注册定义（按 meta.ts 的声明顺序排列，保证选择器顺序稳定） */
export function allModules(): ModuleDefinition[] {
  const order = new Map(MODULE_META.map((meta, index) => [meta.type, index]))
  return Array.from(registry.values()).sort(
    (a, b) => (order.get(a.type) ?? 999) - (order.get(b.type) ?? 999),
  )
}

/** 取模块标题的 i18n key（未注册时回退到 meta，再回退到通用文字） */
export function moduleTitleKey(type: string): string {
  return registry.get(type)?.meta.titleKey ?? MODULE_META.find((m) => m.type === type)?.titleKey ?? 'modules.text'
}

/** 仅测试使用：清空注册表（避免用例间串扰） */
export function __resetRegistryForTests(): void {
  registry.clear()
}
