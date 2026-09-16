/**
 * 内置工具的本地改写 / 移除（v0.3.5）
 *
 * 内置工具**不落库**（它们来自代码里的种子表，随版本更新），
 * 所以"用户改了它"只能记成一份差异，渲染时叠加。这里钉的就是叠加规则：
 *   - 只覆盖改过的字段，没改的继续跟着种子表走（否则应用升级后用户会被冻结在旧数据上）
 *   - 被移除的工具从列表里消失，但 `builtin:<key>` 这个 id 仍然可解析
 *     （否则引用了它的旧对比页会变成"未知工具"）
 *   - 停用与移除是两件事
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_TOOL_SEEDS, resolveBuiltinTools } from './builtinTools'

const SEED = BUILTIN_TOOL_SEEDS[0]!
const SEED_KEY = SEED.key

describe('resolveBuiltinTools 的本地改写', () => {
  it('没有改写时与种子表逐字段一致', () => {
    const tool = resolveBuiltinTools().find((item) => item.builtinKey === SEED_KEY)
    expect(tool?.name).toBe(SEED.name)
    expect(tool?.vendor).toBe(SEED.vendor)
    expect(tool?.color).toBe(SEED.color)
    expect(tool?.overridden).toBe(false)
  })

  it('只覆盖改过的字段，其余继续跟着种子表走', () => {
    const tool = resolveBuiltinTools([], { [SEED_KEY]: { name: '我的名字' } }).find(
      (item) => item.builtinKey === SEED_KEY,
    )
    expect(tool?.name).toBe('我的名字')
    // 关键：分类/厂商这些没改过的仍然来自种子表，
    // 因此应用升级时它们会跟着更新，而不是被这次改写冻结
    expect(tool?.category).toBe(SEED.category)
    expect(tool?.vendor).toBe(SEED.vendor)
    expect(tool?.overridden).toBe(true)
  })

  it('aliases 可以被整体替换', () => {
    const tool = resolveBuiltinTools([], { [SEED_KEY]: { aliases: ['别名甲'] } }).find(
      (item) => item.builtinKey === SEED_KEY,
    )
    expect(tool?.aliases).toEqual(['别名甲'])
  })

  it('iconAssetId 用 null 显式表示"清掉图标"（与"没改过"区分开）', () => {
    const cleared = resolveBuiltinTools([], { [SEED_KEY]: { iconAssetId: null } }).find(
      (item) => item.builtinKey === SEED_KEY,
    )
    expect(cleared?.iconAssetId).toBeUndefined()

    const kept = resolveBuiltinTools([], {}).find((item) => item.builtinKey === SEED_KEY)
    expect(kept?.iconAssetId).toBeUndefined()

    const set = resolveBuiltinTools([], { [SEED_KEY]: { iconAssetId: 'abc' } }).find(
      (item) => item.builtinKey === SEED_KEY,
    )
    expect(set?.iconAssetId).toBe('abc')
  })
})

describe('resolveBuiltinTools 的移除与停用', () => {
  it('被移除的工具不出现在列表里', () => {
    const before = resolveBuiltinTools().length
    const after = resolveBuiltinTools([], {}, [SEED_KEY])
    expect(after.length).toBe(before - 1)
    expect(after.some((item) => item.builtinKey === SEED_KEY)).toBe(false)
  })

  it('停用仍然出现在列表里（只是带 disabled 标记）', () => {
    const tool = resolveBuiltinTools([SEED_KEY]).find((item) => item.builtinKey === SEED_KEY)
    expect(tool).toBeDefined()
    expect(tool?.disabled).toBe(true)
  })

  it('id 始终是 `builtin:<key>`，与是否被改写/停用无关', () => {
    // 这一点关系到旧工程文件的引用是否还能解析
    const tool = resolveBuiltinTools([SEED_KEY], { [SEED_KEY]: { name: 'x' } }).find(
      (item) => item.builtinKey === SEED_KEY,
    )
    expect(tool?.id).toBe(`builtin:${SEED_KEY}`)
  })
})
