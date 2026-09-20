import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import '@/modules'
import { createProject, duplicateProject, parseProjectFile } from './projectService'
import {
  withComparison,
  defaultSelection,
  projectSelection,
  resolveRuntime,
} from './comparisonContent'
import { copySample, addCase, deleteSample } from './comparisonEditing'
import { applyCommandResult } from './commands'
import { collectAssetIds, validateProject } from '@/types/validate'
import { exportFrames } from './presentationExport'
import { openDatabase, promisifyTransaction } from '@/db/core'
import { upgrade } from '@/db/schema'
import { SCHEMA_VERSION } from '@/types/project'

function fixture() {
  const p = createProject({ templateId: 'stage-music', name: 'R3' })
  const c = p.comparison!.cases[0]!,
    a = p.sheet.sides[0].id,
    b = p.sheet.sides[1].id
  const sample = c.entries[a]!.samples[0]!,
    audio = Object.values(sample.contentBySection)
      .flatMap((c) => c.modules)
      .find((m) => m.type === 'audio')!
  audio.data = { assetId: 'first-audio' }
  const second = copySample(sample)
  second.title = '第二作品'
  const secondAudio = Object.values(second.contentBySection)
    .flatMap((c) => c.modules)
    .find((m) => m.type === 'audio')!
  secondAudio.data = { assetId: 'inactive-audio', coverAssetId: 'inactive-cover' }
  c.entries[a]!.samples.push(second)
  const selection = defaultSelection(p.comparison!)
  return { p, c, a, b, sample, second, audio, secondAudio, selection }
}

describe('R3 comparison content and reference safety', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'migrates v%i without mutating the original; repeat import is idempotent',
    (version) => {
      const p = createProject({ templateId: 'stage-music' })
      delete p.comparison
      p.schemaVersion = version
      const shared = p.sheet.rows.find((r) => r.kind === 'full')!
      shared.cells[p.sheet.sides[1].id] = {
        hidden: true,
        modules: [
          {
            id: 'unknown-preserved',
            type: 'future-module',
            title: 'recovery',
            data: { assetId: 'hidden-asset' },
            props: { x: 9 },
            hidden: true,
            locked: true,
          },
        ],
      }
      const before = structuredClone(p)
      const result = parseProjectFile(JSON.stringify(p))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const migrated = result.value[0]!
      expect(p).toEqual(before)
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
      expect(migrated.migrationSnapshot?.sheet).toEqual(before.sheet)
      expect(collectAssetIds(migrated)).toContain('hidden-asset')
      expect(parseProjectFile(JSON.stringify(migrated))).toEqual(result)
      expect(withComparison(migrated)).toBe(migrated)
    },
  )
  it('edits a selected sample only, including inactive content in asset collection', () => {
    const { p, c, a, sample, second, secondAudio, selection } = fixture()
    selection.samples[a] = second.id
    const rowId = c.sections.find((s) =>
      second.contentBySection[s.id]?.modules.some((m) => m.id === secondAudio.id),
    )!.id
    const result = applyCommandResult(
      p,
      {
        t: 'module/data',
        ref: { rowId, sideId: a, moduleId: secondAudio.id },
        patch: { name: 'new.wav' },
      },
      selection,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const samples = result.value.comparison!.cases[0]!.entries[a]!.samples
    expect(samples[0]).toEqual(sample)
    expect(
      samples[1]!.contentBySection[rowId]!.modules.find((m) => m.id === secondAudio.id)!.data,
    ).toMatchObject({ name: 'new.wav', assetId: 'inactive-audio' })
    expect(collectAssetIds(result.value)).toEqual(
      expect.objectContaining(new Set(['first-audio', 'inactive-audio', 'inactive-cover'])),
    )
    expect(
      projectSelection(result.value, selection).sheet.rows.find((r) => r.id === rowId)!.cells[a]!
        .modules[0]!.id,
    ).toBe(secondAudio.id)
    expect(secondAudio.data).not.toHaveProperty('name')
  })
  it('never carries an old sample into a missing entry on another case', () => {
    const { p, c, a, selection } = fixture()
    const second = addCase(p.comparison!, c)
    second.entries[a] = { defaultSampleId: null, samples: [] }
    const projected = projectSelection(p, { caseId: second.id, samples: selection.samples })
    expect(
      projected.sheet.rows
        .filter((r) => r.kind === 'paired')
        .every((r) => r.cells[a]!.modules.length === 0),
    ).toBe(true)
  })
  it('reconstructs every step deterministically and rekeys all sample/scene references when copied', () => {
    const { p, a, b, second } = fixture(),
      content = p.comparison!,
      scene = content.scenes[0]!
    scene.steps = [
      { id: 'reveal', kind: 'reveal', participantId: b },
      { id: 'focus', kind: 'focus', participantId: a },
      { id: 'switch', kind: 'sample', participantId: a, sampleId: second.id },
      { id: 'identity', kind: 'identity', participantId: a },
    ]
    scene.samples[a] = second.id
    content.combinations.push({
      id: 'combo',
      title: '组合',
      caseId: scene.caseId,
      samples: { [a]: second.id },
    })
    const base = resolveRuntime(content, scene.id)
    expect(base.concealedIds).toEqual([b])
    expect(resolveRuntime(content, scene.id, 4).revealedIdentities).toEqual([a])
    expect(resolveRuntime(content, scene.id, 2).focusIds).toEqual([a])
    expect(resolveRuntime(content, scene.id)).toEqual(base)
    const copy = duplicateProject(p)
    expect(validateProject(copy).ok).toBe(true)
    expect(copy.sheet.sides[0].id).not.toBe(a)
    const copiedScene = copy.comparison!.scenes[0]!
    expect(copiedScene.steps[2]).toMatchObject({
      sampleId: copy.comparison!.cases[0]!.entries[copy.sheet.sides[0].id]!.samples[1]!.id,
    })
    expect(copiedScene.steps[2]).not.toMatchObject({ sampleId: second.id })
    expect(collectAssetIds(copy)).toEqual(collectAssetIds(p))
  })
  it('never treats schema keys as entity references when IDs happen to match them', () => {
    const p = createProject()
    p.sheet.id = 'sheet'
    const copy = duplicateProject(p)
    expect(copy.sheet).toBeDefined()
    expect(validateProject(copy).ok).toBe(true)
  })
  it('removes sample references atomically and rejects dangling/duplicate IDs', () => {
    const { p, c, a, second } = fixture(),
      scene = p.comparison!.scenes[0]!
    scene.samples[a] = second.id
    scene.steps.push({ id: 'switch', kind: 'sample', participantId: a, sampleId: second.id })
    deleteSample(p.comparison!, c.id, a, second.id)
    expect(scene.samples[a]).toBeNull()
    expect(scene.steps).toEqual([])
    expect(validateProject(p).ok).toBe(true)
    scene.samples[a] = 'missing'
    expect(validateProject(p).ok).toBe(false)
    scene.samples[a] = null
    c.entries[a]!.samples.push(structuredClone(c.entries[a]!.samples[0]!))
    expect(validateProject(p).ok).toBe(false)
  })
  it('flags retained lyrics after audio replacement, without touching the other sample', () => {
    const { p, c, a, audio, selection } = fixture()
    const rowId = c.sections.find((s) =>
      c.entries[a]!.samples[0]!.contentBySection[s.id]?.modules.some((m) => m.id === audio.id),
    )!.id
    const result = applyCommandResult(
      p,
      {
        t: 'module/data',
        ref: { rowId, sideId: a, moduleId: audio.id },
        patch: { assetId: 'replaced' },
      },
      selection,
    )
    expect(
      result.ok && result.value.comparison!.cases[0]!.entries[a]!.samples[0]!.lyricsNeedReview,
    ).toBe(true)
    expect(
      result.ok && result.value.comparison!.cases[0]!.entries[a]!.samples[1]!.lyricsNeedReview,
    ).toBeUndefined()
  })
  it('portable frames share reconstruction semantics, suppress identity reveals and enforce a bound', () => {
    const { p, a } = fixture(),
      s = p.comparison!.scenes[1]!
    s.steps.push({ id: 'identity', kind: 'identity', participantId: a })
    const frames = exportFrames(p)
    expect(frames.every((f) => f.state.revealedIdentities.length === 0)).toBe(true)
    expect(frames.some((f) => f.state.stepIndex === 1)).toBe(true)
    expect(() => exportFrames(p, 2)).toThrow('2 个画面')
  })
  it('rolls the entire database upgrade back if one project is corrupt', async () => {
    const name = `r3-rollback-${crypto.randomUUID()}`
    const db = await openDatabase(name, 8, (db) =>
      db.createObjectStore('projects', { keyPath: 'id' }),
    )
    const p = createProject()
    delete p.comparison
    p.schemaVersion = 8
    const tx = db.transaction('projects', 'readwrite')
    tx.objectStore('projects').put(p)
    tx.objectStore('projects').put({ id: 'broken', schemaVersion: 8 })
    await promisifyTransaction(tx)
    db.close()
    await expect(openDatabase(name, 9, upgrade)).rejects.toThrow()
    const original = await openDatabase(name, 8, () => {})
    const req = original.transaction('projects').objectStore('projects').get(p.id)
    const restored = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result)
    })
    expect(restored).toEqual(p)
    original.close()
    indexedDB.deleteDatabase(name)
  })
  it('upgrades old module/layout fields and a valid database through the same migration', async () => {
    const p = createProject({ templateId: 'stage-music' })
    delete p.comparison
    p.schemaVersion = 1
    const module = p.sheet.rows[2]!.cells[p.sheet.sides[0].id]!.modules[0]!
    module.type = 'stars'
    module.data = { value: -1, max: 5 }
    Object.assign(p.sheet.layout, { ratio: [2, 1], density: 'normal', backgroundFill: 'solid' })
    const expected = validateProject(p)
    expect(expected.ok).toBe(true)
    if (!expected.ok) return
    expect(expected.value.sheet.layout).not.toHaveProperty('ratio')
    expect(expected.value.sheet.layout.backgroundFill).toBe('page')
    expect(expected.value.sheet.rows[2]!.cells[p.sheet.sides[0].id]!.modules[0]).toMatchObject({
      type: 'score',
      data: { score: null, max: 5 },
    })
    const name = `r3-migration-${crypto.randomUUID()}`
    const db = await openDatabase(name, 1, (db) =>
      db.createObjectStore('projects', { keyPath: 'id' }),
    )
    const tx = db.transaction('projects', 'readwrite')
    tx.objectStore('projects').put(p)
    await promisifyTransaction(tx)
    db.close()
    const upgraded = await openDatabase(name, 9, upgrade)
    const req = upgraded.transaction('projects').objectStore('projects').get(p.id)
    const migrated = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result)
    })
    expect(migrated).toEqual(expected.value)
    upgraded.close()
    indexedDB.deleteDatabase(name)
  })
})
