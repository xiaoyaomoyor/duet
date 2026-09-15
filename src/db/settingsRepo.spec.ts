/**
 * 设置仓储单测（fake-indexeddb 环境）
 *
 * 重点覆盖「脏数据不得让应用崩在启动阶段」这条底线。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/types'
import {
  clearSettings,
  loadSettings,
  mergeSettings,
  readMeta,
  saveSettings,
  writeMeta,
} from './settingsRepo'
import { resetDb } from './db'

beforeEach(async () => {
  await resetDb()
  await clearSettings()
})

describe('loadSettings', () => {
  it('首次运行返回默认值（并是独立副本，不受后续修改影响）', async () => {
    const settings = await loadSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)

    settings.language = 'en-US'
    const again = await loadSettings()
    expect(again.language).toBe('zh-CN')
  })

  it('保存后可原样读回', async () => {
    const custom = { ...DEFAULT_SETTINGS, language: 'en-US' as const, sidebarWidth: 320 }
    await saveSettings(custom)

    const loaded = await loadSettings()
    expect(loaded.language).toBe('en-US')
    expect(loaded.sidebarWidth).toBe(320)
  })
})

describe('mergeSettings', () => {
  it('旧版本缺少的字段用默认值补齐', () => {
    const legacy = { language: 'en-US' as const }
    const merged = mergeSettings(legacy)
    expect(merged.language).toBe('en-US')
    expect(merged.autosaveDebounceMs).toBe(DEFAULT_SETTINGS.autosaveDebounceMs)
    expect(merged.accentPresets).toEqual(DEFAULT_SETTINGS.accentPresets)
  })

  it('undefined 输入返回完整默认值', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('非法语言回退到默认语言', () => {
    const merged = mergeSettings({ language: 'fr-FR' as never })
    expect(merged.language).toBe('zh-CN')
  })

  it('未知主题回退到紫夜', () => {
    const merged = mergeSettings({ themeId: 'neon-light' as never })
    expect(merged.themeId).toBe('violet-dark')
  })

  it('非法配色对回退到默认（而非留下长度不对的数组）', () => {
    expect(mergeSettings({ defaultAccent: ['#fff'] as never }).defaultAccent).toEqual(
      DEFAULT_SETTINGS.defaultAccent,
    )
    expect(mergeSettings({ accentPresets: [] }).accentPresets).toEqual(
      DEFAULT_SETTINGS.accentPresets,
    )
  })

  it('数值字段被夹紧到合法区间', () => {
    expect(mergeSettings({ autosaveDebounceMs: 0 }).autosaveDebounceMs).toBe(100)
    expect(mergeSettings({ autosaveDebounceMs: 99_999 }).autosaveDebounceMs).toBe(2000)
    expect(mergeSettings({ sidebarWidth: 10 }).sidebarWidth).toBe(200)
    expect(mergeSettings({ sidebarWidth: 9999 }).sidebarWidth).toBe(400)
    expect(mergeSettings({ maxMirrorSizeMB: 0 }).maxMirrorSizeMB).toBe(1)
  })

  it('NaN 不致命（回落到下限而非留下 NaN）', () => {
    expect(Number.isNaN(mergeSettings({ sidebarWidth: Number.NaN }).sidebarWidth)).toBe(false)
  })

  it('导出倍率只允许 1 或 2', () => {
    expect(mergeSettings({ exportScale: 3 as never }).exportScale).toBe(2)
    expect(mergeSettings({ exportScale: 1 }).exportScale).toBe(1)
  })

  it('非法 disabledBuiltinTools 回退为空数组', () => {
    expect(mergeSettings({ disabledBuiltinTools: 'x' as never }).disabledBuiltinTools).toEqual([])
  })
})

describe('meta 存储', () => {
  it('写入后可读回', async () => {
    await writeMeta('lastBackupAt', 1_757_900_000_000)
    expect(await readMeta<number>('lastBackupAt')).toBe(1_757_900_000_000)
  })

  it('未写入的键返回 undefined', async () => {
    expect(await readMeta('nope')).toBeUndefined()
  })
})
