import { describe, expect, it } from 'vitest'
import '@/modules'
import { createProject } from './projectService'
import { resolveComparison } from './sceneResolver'
import { validateProject } from '@/types/validate'
import type { Project } from '@/types/project'

const resolve = (p: Project) =>
  resolveComparison(
    p,
    () => ({ name: 'Tool' }),
    (key) => key,
  )
const fixture = () => createProject({ templateId: 'stage-generic', name: '评测' })
describe('R2 legacy scene adapter', () => {
  it('keeps stable participant/sample/track identities and never mutates legacy data', () => {
    const p = fixture(),
      before = JSON.stringify(p),
      a = resolve(p),
      b = resolve(p)
    expect(a).toEqual(b)
    expect(JSON.stringify(p)).toBe(before)
    expect(new Set(a.sections[2]!.contents.map((c) => c.trackId)).size).toBe(2)
    expect(a.sections[1]!.entries.map((e) => e.sampleId)).toEqual(
      a.sections[2]!.entries.map((e) => e.sampleId),
    )
    expect(a.sections[2]!.contents[0]!.module).toBe(
      p.sheet.rows[2]!.cells[p.sheet.sides[0].id]!.modules[0],
    )
    const copy = structuredClone(p)
    copy.id = 'copy'
    expect(resolve(copy).sections[2]!.contents[0]!.trackId).not.toBe(
      a.sections[2]!.contents[0]!.trackId,
    )
  })
  it('retains content in both cells of a shared row and excludes hidden, empty and unknown modules', () => {
    const p = fixture(),
      row = p.sheet.rows[1]!,
      [a, b] = p.sheet.sides
    const source = row.cells[a.id]!.modules[0]!
    source.data = { text: 'first' }
    row.cells[b.id]!.modules = [
      { ...structuredClone(source), id: 'other', data: { text: 'second' } },
    ]
    expect(resolve(p).sections[1]!.contents.filter((c) => c.visible)).toHaveLength(2)
    row.cells[a.id]!.hidden = true
    expect(resolve(p).sections[1]!.contents.filter((c) => c.visible)).toHaveLength(1)
    row.cells[b.id]!.modules[0]!.hidden = true
    expect(resolve(p).sections[1]!.visible).toBe(false)
    source.type = 'future'
    row.cells[a.id]!.hidden = false
    expect(resolve(p).sections[1]!.contents[0]!.known).toBe(false)
    expect(resolve(p).sections[0]!.identity).toBe(true)
    expect(resolve(p).sections[0]!.visible).toBe(false)
  })
  it('aligns reordered and repeated dimensions by label, preserving zero and missing values', () => {
    const p = fixture(),
      row = p.sheet.rows[4]!,
      [a, b] = p.sheet.sides
    row.cells[a.id]!.modules[0]!.data = {
      rows: [
        { key: 'Cost', value: '0' },
        { key: 'Speed', value: 'fast' },
        { key: 'Cost', value: '10' },
      ],
    }
    row.cells[b.id]!.modules[0]!.data = {
      rows: [
        { key: 'Speed', value: 'slow' },
        { key: 'Cost', value: '20' },
      ],
    }
    const metrics = resolve(p).sections[4]!.metrics
    expect(metrics.map((m) => m.label)).toEqual(['Cost', 'Speed', 'Cost'])
    expect(metrics[0]!.values[a.id]!.value).toBe('0')
    expect(metrics[0]!.values[b.id]!.value).toBe('20')
    expect(metrics[1]!.values[b.id]!.value).toBe('slow')
    expect(metrics[2]!.values[b.id]).toBeUndefined()
  })
  it('does not align scores with different scales, and null is not a zero score', () => {
    const p = fixture(),
      row = p.sheet.rows[4]!,
      [a, b] = p.sheet.sides
    for (const [side, score, max] of [
      [a, 0, 10],
      [b, 4, 5],
    ] as const) {
      const m = row.cells[side.id]!.modules[0]!
      m.type = 'score'
      m.data = { label: 'Quality', score, max }
    }
    expect(resolve(p).sections[4]!.metrics).toHaveLength(2)
    expect(resolve(p).sections[4]!.metrics[0]!.values[a.id]!.value).toBe('0')
    row.cells[a.id]!.modules[0]!.data = { score: null, max: 10 }
    expect(resolve(p).sections[4]!.metrics).toHaveLength(1)
  })
  it('respects anonymity/display flags and validates optional project appearance without migration', () => {
    const p = fixture(),
      [a, b] = p.sheet.sides
    a.labelOverride = 'PRIVATE'
    a.modelVersion = 'SECRET'
    a.anonymizeName = true
    a.anonymizeVersion = true
    b.showName = false
    b.showVersion = false
    const names = JSON.stringify(resolve(p).participants)
    expect(names).not.toContain('PRIVATE')
    expect(names).not.toContain('SECRET')
    expect(resolve(p).participants[1]!.name).toBe('')
    p.sheet.layout.presentation = { enabled: true, theme: 'paper' }
    expect(resolve(p).theme).toBe('paper')
    expect(validateProject(JSON.parse(JSON.stringify(p))).ok).toBe(true)
    expect(
      validateProject({
        ...p,
        sheet: {
          ...p.sheet,
          layout: { ...p.sheet.layout, presentation: { enabled: true, theme: 'invalid' } },
        },
      }).ok,
    ).toBe(false)
    delete p.sheet.layout.presentation
    expect(validateProject(p).ok).toBe(true)
  })
})
