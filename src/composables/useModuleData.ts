/**
 * 从模块 props 中取"当前模块"的响应式引用
 *
 * 为什么需要它（这是一个真实踩过的坑）：
 *   模块的 editor / renderer 常写成
 *     const data = props.module.data as XData
 *   这在 setup 时把 `data` **快照**下来了。当 store 换掉模块对象（例如导入媒体后
 *   写入 assetId）时，父组件若因 `v-model` 绑定（VueDraggable）未能把新对象传下来，
 *   子组件里的 `data` 仍指向旧对象，于是"数据已保存但界面不变"——
 *   表现为"上传成功却看不到预览，刷新后才正常"。
 *
 * 这里用 computed 包一层：只要 `props.module` 这个**prop 引用**变化，
 * 就会重新求值，从而总是读到最新的内容，而不是 setup 时的快照。
 */

import { computed, type ComputedRef } from 'vue'
import type { ModuleInstance } from '@/types/project'

/** 取响应式的模块实例 */
export function useModuleRef(
  getModule: () => ModuleInstance,
): ComputedRef<ModuleInstance> {
  return computed(() => getModule())
}

/**
 * 取响应式的模块内容（data）。
 *
 * @param getModule 返回当前模块对象的取值函数（`() => props.module`）
 * @param shape 校验函数：用于把 `unknown` 安全收窄到具体形状
 */
export function useModuleData<T>(
  getModule: () => ModuleInstance,
  shape: (value: unknown) => value is T,
): ComputedRef<T> {
  return computed(() => {
    const data = getModule().data
    // 数据损坏时给出空对象而非抛错：渲染层必须能容错（§7.4）
    return shape(data) ? data : ({} as T)
  })
}

/** 取响应式的模块配置（props） */
export function useModuleProps<T extends Record<string, unknown>>(
  getModule: () => ModuleInstance,
): ComputedRef<Partial<T>> {
  return computed(() => (getModule().props ?? {}) as Partial<T>)
}
