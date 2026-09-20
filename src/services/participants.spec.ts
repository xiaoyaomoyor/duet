import { describe, expect, it } from 'vitest'
import '@/modules'
import { createProject, duplicateProject } from './projectService'
import { applyCommandResult } from './commands'
import { editParticipants } from './participants'
import { addCase, copySample } from './comparisonEditing'
import { collectAssetIds, validateProject } from '@/types/validate'
import { resolveComparison } from './sceneResolver'
import { exportFrames } from './presentationExport'
import { SCHEMA_VERSION, type Project } from '@/types/project'

function add(p: Project) {
  const r = applyCommandResult(p, { t: 'participant/add', name: '新工具' })
  if (!r.ok) throw new Error(r.error)
  return r.value
}
describe('R4 participant graph', () => {
  it('adds through six in all cases without sharing mutable samples and rejects a seventh', () => {
    let p = createProject({ templateId: 'stage-music' })
    addCase(p.comparison!, p.comparison!.cases[0]!)
    const original = structuredClone(p)
    for (let n = 3; n <= 6; n++) {
      p = add(p)
      expect(p.sheet.sides).toHaveLength(n)
      expect(validateProject(p).ok).toBe(true)
      for (const c of p.comparison!.cases) expect(Object.keys(c.entries)).toHaveLength(n)
    }
    expect(original.sheet.sides).toHaveLength(2)
    expect(editParticipants(p, { t: 'participant/add', name: 'seventh' }).ok).toBe(false)
    const ids = p.comparison!.cases.flatMap((c) =>
      Object.values(c.entries).flatMap((e) => e.samples.map((s) => s.id)),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('reorders stable identities, preserves selections and rejects malformed orders', () => {
    const p = add(createProject({ templateId: 'stage-music' }))
    p.sheet.sides[0].anonymizeName = true
    const ids = p.sheet.sides.map((s) => s.id).reverse()
    const r = editParticipants(p, { t: 'participant/reorder', ids })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.sheet.sides.map((s) => s.catalogueLabel)).toEqual(['C', 'B', 'A'])
    expect(r.value.comparison).toEqual(p.comparison)
    const scene = resolveComparison(
      r.value,
      () => ({ name: 'secret' }),
      (k) => k,
    )
    expect(scene.participants[2]!.name).toBe('studio.anonymous A')
    expect(
      editParticipants(p, { t: 'participant/reorder', ids: [ids[0]!, ids[0]!, ids[1]!] }).ok,
    ).toBe(false)
    expect(validateProject(duplicateProject(r.value)).ok).toBe(true)
  })
  it('removes every reference but preserves shared cells and inactive assets; original enables complete undo', () => {
    const p = add(createProject({ templateId: 'stage-music' })),
      content = p.comparison!,
      c = content.cases[0]!,
      id = p.sheet.sides[0].id
    const shared = c.sections.find((s) => s.kind === 'full')!
    shared.sharedCells![id] = {
      hidden: false,
      modules: [
        {
          id: 'shared-preserved',
          type: 'text',
          title: '',
          props: {},
          data: { text: '共同命题', assetId: 'shared-asset' },
          hidden: false,
        },
      ],
    }
    const sample = c.entries[id]!.samples[0]!
    content.scenes[0]!.samples[id] = sample.id
    content.scenes[0]!.steps = [
      { id: 'remove-step', kind: 'sample', participantId: id, sampleId: sample.id },
    ]
    content.combinations.push({
      id: 'combo',
      caseId: c.id,
      title: '组合',
      samples: { [id]: sample.id },
    })
    const keep = c.entries[p.sheet.sides[2]!.id]!.samples[0]!
    keep.contentBySection[c.sections.find((s) => s.kind === 'paired')!.id] = {
      hidden: true,
      modules: [
        {
          id: 'inactive',
          type: 'audio',
          data: { assetId: 'inactive-media' },
          props: {},
          title: '',
          hidden: true,
        },
      ],
    }
    const original = structuredClone(p),
      result = editParticipants(p, { t: 'participant/remove', id })
    if (!result.ok) throw new Error(result.error)
    expect(p).toEqual(original)
    expect(validateProject(result.value).ok).toBe(true)
    expect(result.value.comparison!.scenes[0]!.steps).toHaveLength(0)
    expect(result.value.comparison!.combinations[0]!.samples).toEqual({})
    expect(JSON.stringify(result.value.comparison)).toContain('共同命题')
    expect([...collectAssetIds(result.value)]).toEqual(
      expect.arrayContaining(['inactive-media', 'shared-asset']),
    )
    expect(
      editParticipants(result.value, {
        t: 'participant/remove',
        id: result.value.sheet.sides[0].id,
      }).ok,
    ).toBe(false)
  })
  it('preserves a complete schema 9 multi-sample recovery snapshot and migrates idempotently', () => {
    const p = createProject({ templateId: 'stage-music' })
    p.schemaVersion = 9
    const e = p.comparison!.cases[0]!.entries[p.sheet.sides[0].id]!
    e.samples.push(copySample(e.samples[0]!))
    const result = validateProject(p)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result.value.migrationSnapshot?.comparison).toEqual(p.comparison)
    const again = validateProject(result.value)
    if (!again.ok) throw new Error(again.error)
    expect(again.value).toEqual(result.value)
  })
  it('exports six participants with two samples in a linear number of fragments including empty choices', () => {
    let p = createProject({ templateId: 'stage-music' })
    while (p.sheet.sides.length < 6) p = add(p)
    const c = p.comparison!.cases[0]!,
      section = c.sections.find(
        (s) =>
          s.kind === 'paired' &&
          Object.values(c.entries).some((e) =>
            e.samples[0]!.contentBySection[s.id]?.modules.some((m) => m.type === 'audio'),
          ),
      )!
    for (const [n, e] of Object.values(c.entries).entries()) {
      e.samples[0]!.contentBySection[section.id] = {
        hidden: false,
        modules: [
          {
            id: `audio-${n}`,
            type: 'audio',
            data: { assetId: `media-${n}` },
            props: {},
            title: '',
            hidden: false,
          },
        ],
      }
      e.samples.push(copySample(e.samples[0]!))
    }
    p.comparison!.scenes = [
      {
        id: 'one',
        caseId: c.id,
        sectionId: section.id,
        title: '多方',
        hidden: false,
        samples: {},
        steps: [],
      },
    ]
    const frames = exportFrames(p)
    expect(frames).toHaveLength(13)
    for (const side of p.sheet.sides)
      expect(frames.some((f) => f.state.samples[side.id] === null)).toBe(true)
    expect(frames.every((f) => f.factorized)).toBe(true)
  })
})
