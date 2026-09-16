/**
 * 模块成熟度（v0.4.0）
 *
 * 用户的原话是"目前只有图片、文字、音频标记为可用，其他模块均标记为实验，
 * 因为我还没有进行实测"。这里钉住三件事：
 *   1. 那三个确实是"可用"
 *   2. 其余已实现的都是"实验"（**可选**，不是禁用）
 *   3. 省略 maturity 时默认落到"实验"——保守默认，
 *      让"标成可用"成为一个需要主动写出来的动作
 */
import { describe, expect, it } from 'vitest'
import { MODULE_META, STABLE_MODULE_TYPES, moduleMaturity } from './meta'
import { registeredTypes } from './registry'
import '@/modules'

describe('模块成熟度', () => {
  it('图片 / 文字 / 音频标为可用', () => {
    expect([...STABLE_MODULE_TYPES].sort()).toEqual(['audio', 'image', 'text'])
    for (const type of STABLE_MODULE_TYPES) {
      expect(moduleMaturity(type), `${type} 应当标为可用`).toBe('stable')
    }
  })

  it('其余已实现的模块一律是"实验"（而不是禁用）', () => {
    const experimental = registeredTypes().filter(
      (type) => !STABLE_MODULE_TYPES.includes(type),
    )
    expect(experimental.length).toBeGreaterThan(10)
    for (const type of experimental) {
      expect(moduleMaturity(type), `${type} 应当标为实验`).toBe('experimental')
    }
  })

  it('每个已实现模块都在 meta.ts 里有登记（未知类型回落到实验）', () => {
    for (const type of registeredTypes()) {
      expect(MODULE_META.some((meta) => meta.type === type), `${type} 缺少 meta 登记`).toBe(true)
    }
    // 完全没登记的类型也不能抛错，按最保守的档处理
    expect(moduleMaturity('definitely-not-a-module')).toBe('experimental')
  })

  it('meta 里没有显式标 maturity 时按保守默认处理', () => {
    const undeclared = MODULE_META.filter((meta) => meta.maturity === undefined).map((m) => m.type)
    // 现有登记表刻意不写 maturity（真源在 STABLE_MODULE_TYPES 里）
    expect(undeclared.length).toBe(MODULE_META.length)
    expect(moduleMaturity('image')).toBe('stable')
    expect(moduleMaturity('markdown')).toBe('experimental')
  })
})
