/**
 * 模板服务单测
 *
 * 断言模板实例化后的骨架结构，这是 M1「点击模板即得可用项目」的基础。
 */
import { describe, expect, it } from 'vitest'
import {
  ACCENT_PAIRS,
  BUILTIN_TEMPLATES,
  DEFAULT_ACCENT_PAIR,
  createBlankProject,
  getTemplate,
  instantiateTemplate,
} from './templateService'
import { SCHEMA_VERSION } from '@/types'

const music = getTemplate('music')

describe('内置模板', () => {
  it('四个模板 id 唯一', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('音乐模板具备封面/音频/歌词/进度条四行', () => {
    expect(music?.fields.map((f) => f.field.type)).toEqual([
      'cover',
      'audio',
      'lyrics',
      'progress',
    ])
  })

  it('getTemplate 对未知 id 返回 undefined', () => {
    expect(getTemplate('nope')).toBeUndefined()
  })

  it('所有配色预设都是两色且合法十六进制', () => {
    for (const preset of ACCENT_PAIRS) {
      expect(preset.colors).toHaveLength(2)
      for (const color of preset.colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('instantiateTemplate', () => {
  it('生成结构完整的项目', () => {
    const project = instantiateTemplate(music!, { name: 'Suno vs Lyria' })

    expect(project.title).toBe('Suno vs Lyria')
    expect(project.schemaVersion).toBe(SCHEMA_VERSION)
    expect(project.sheet.sides).toHaveLength(2)
    expect(project.sheet.rows).toHaveLength(4)
    expect(project.ui.mode).toBe('edit')
    expect(project.pinned).toBe(false)
  })

  it('两侧 id 不同，且每行在两侧都建了格子', () => {
    const project = instantiateTemplate(music!, { name: 'x' })
    const [sideA, sideB] = project.sheet.sides
    expect(sideA.id).not.toBe(sideB.id)

    for (const row of project.sheet.rows) {
      expect(Object.keys(row.cells).sort()).toEqual([sideA.id, sideB.id].sort())
      expect(row.cells[sideA.id]?.modules).toHaveLength(1)
      expect(row.cells[sideB.id]?.modules).toHaveLength(1)
    }
  })

  it('左右两侧的模块是不同的实例（编辑一侧不影响另一侧）', () => {
    const project = instantiateTemplate(music!, { name: 'x' })
    const [sideA, sideB] = project.sheet.sides
    const row = project.sheet.rows[0]!

    expect(row.cells[sideA.id]?.modules[0]?.id).not.toBe(row.cells[sideB.id]?.modules[0]?.id)
  })

  it('所有模块初始为空内容（因此展示视图默认什么都不显示，§7.4）', () => {
    const project = instantiateTemplate(music!, { name: 'x' })
    for (const row of project.sheet.rows) {
      for (const cell of Object.values(row.cells)) {
        for (const module of cell.modules) {
          expect(module.data).toEqual({})
          expect(module.hidden).toBe(false)
        }
      }
    }
  })

  it('应用模板默认配色，可被参数覆盖', () => {
    const withDefault = instantiateTemplate(music!, { name: 'x' })
    expect(withDefault.sheet.sides[0].accent).toBe(DEFAULT_ACCENT_PAIR[0])
    expect(withDefault.sheet.sides[1].accent).toBe(DEFAULT_ACCENT_PAIR[1])

    const custom = instantiateTemplate(music!, { name: 'x', accent: ['#ffffff', '#000000'] })
    expect(custom.sheet.sides[0].accent).toBe('#ffffff')
    expect(custom.sheet.sides[1].accent).toBe('#000000')
  })

  it('now 可注入，便于测试与确定性快照', () => {
    const project = instantiateTemplate(music!, { name: 'x', now: 1_700_000_000_000 })
    expect(project.createdAt).toBe(1_700_000_000_000)
    expect(project.updatedAt).toBe(1_700_000_000_000)
  })

  it('每次实例化的 id 都不同（同一模板可反复使用）', () => {
    const a = instantiateTemplate(music!, { name: 'x' })
    const b = instantiateTemplate(music!, { name: 'x' })
    expect(a.id).not.toBe(b.id)
    expect(a.sheet.id).not.toBe(b.sheet.id)
  })

  it('layout 是深拷贝，改一个项目不影响另一个', () => {
    const a = instantiateTemplate(music!, { name: 'a' })
    const b = instantiateTemplate(music!, { name: 'b' })
    a.sheet.layout.gutter = 99
    expect(b.sheet.layout.gutter).toBe(32)
  })

  it('模板的 props 透传到模块实例', () => {
    const project = instantiateTemplate(music!, { name: 'x' })
    const audioRow = project.sheet.rows.find((row) =>
      Object.values(row.cells).some((cell) => cell.modules[0]?.type === 'audio'),
    )
    const cell = Object.values(audioRow!.cells)[0]!
    expect(cell.modules[0]?.props).toEqual({ showWaveform: true })
  })
})

describe('createBlankProject', () => {
  it('创建没有任何行的空项目', () => {
    const project = createBlankProject('空白对比')
    expect(project.title).toBe('空白对比')
    expect(project.sheet.rows).toHaveLength(0)
    expect(project.sheet.sides).toHaveLength(2)
  })
})
