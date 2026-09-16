/**
 * 配色预设单测
 *
 * 这张表的正确性直接决定"切主题之后两侧颜色对不对"，
 * 而它的三个函数各自都有一个容易写错的边界：
 *   resolveAccent  —— 优先级（预设 > hex > 空）
 *   presetIdOfColor —— 迁移时把老 hex 认回预设
 *   presetColor    —— 亮/暗两套取值
 */
import { describe, expect, it } from 'vitest'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_PRESETS,
  presetColor,
  presetIdOfColor,
  resolveAccent,
} from './accentPresets'

describe('配色预设', () => {
  it('每个预设都有亮暗两套取值，且 id 唯一', () => {
    const ids = ACCENT_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const preset of ACCENT_PRESETS) {
      expect(preset.light, `${preset.id} 缺少亮色取值`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(preset.dark, `${preset.id} 缺少暗色取值`).toMatch(/^#[0-9a-f]{6}$/i)
      // 同一个"紫"在两个主题下必须是两个不同的值，否则等于没做主题适配
      expect(preset.light).not.toBe(preset.dark)
    }
  })

  it('默认左右配色在预设表里都有', () => {
    for (const id of DEFAULT_ACCENT_PRESETS) {
      expect(presetColor(id, 'violet-dark')).toBeDefined()
    }
  })

  it('presetColor 按主题给出深浅两套值', () => {
    const violet = ACCENT_PRESETS[0]!
    expect(presetColor('violet', 'light')).toBe(violet.light)
    expect(presetColor('violet', 'dark')).toBe(violet.dark)
    // 紫夜也是深色主题，与"暗"共用同一套取值
    expect(presetColor('violet', 'violet-dark')).toBe(violet.dark)
  })

  it('presetColor 对未知 id / 空值返回 undefined（调用方据此回退）', () => {
    expect(presetColor('nope', 'light')).toBeUndefined()
    expect(presetColor(undefined, 'light')).toBeUndefined()
    expect(presetColor('', 'light')).toBeUndefined()
  })

  it('presetIdOfColor 两个主题的取值都能认回来（迁移靠它）', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(presetIdOfColor(preset.light)).toBe(preset.id)
      expect(presetIdOfColor(preset.dark)).toBe(preset.id)
    }
  })

  it('presetIdOfColor 大小写无关，且不认识的色值返回 undefined', () => {
    expect(presetIdOfColor('#A78BFA')).toBe('violet')
    expect(presetIdOfColor('#123456')).toBeUndefined()
    expect(presetIdOfColor(undefined)).toBeUndefined()
  })
})

describe('resolveAccent 的优先级', () => {
  it('有预设时以预设为准，hex 只是回退值', () => {
    // 这条是 M8 的核心：预设跟着主题走，而 hex 是死的
    expect(resolveAccent({ accentPreset: 'cyan', accent: '#ff0000' }, 'light')).toBe(
      presetColor('cyan', 'light'),
    )
    expect(resolveAccent({ accentPreset: 'cyan', accent: '#ff0000' }, 'dark')).toBe(
      presetColor('cyan', 'dark'),
    )
  })

  it('没有预设时用工程里存的 hex（老数据 / 用户自定义色）', () => {
    expect(resolveAccent({ accent: '#ff0000' }, 'light')).toBe('#ff0000')
    expect(resolveAccent({ accent: '#ff0000' }, 'dark')).toBe('#ff0000')
  })

  it('预设 id 不认识时退回 hex，而不是变成空', () => {
    // 手工改坏的文件可能带一个不存在的 preset，此时不该把颜色整个丢掉
    expect(resolveAccent({ accentPreset: 'ghost', accent: '#00ff00' }, 'light')).toBe('#00ff00')
  })

  it('什么都没有时返回空串，由调用方回落到 var(--accent-500)', () => {
    expect(resolveAccent({}, 'light')).toBe('')
  })
})
