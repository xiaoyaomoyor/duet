import { describe, expect, it } from 'vitest'
import {
  createProject,
  duplicateProject,
  parseSingleProject,
  serializeProjects,
} from './projectService'
import { legacyRestrictions } from './workspace'
import { applyCommandResult } from './commands'
import { validateProject } from '@/types/validate'
import { copySample, addCase } from './comparisonEditing'
import { openDatabase, putOne, getOne } from '@/db/core'
import { upgrade, STORE } from '@/db/schema'
import { SCHEMA_VERSION, type Project } from '@/types/project'

function historical(modern = false) {
  const p = createProject({ templateId: 'music', workspace: modern ? 'modern' : 'legacy' })
  p.schemaVersion = 11
  delete p.workspace
  p.appearance = { theme: 'paper', palette: 'blue' }
  return p
}

describe('W1 workspace identity and non-destructive switching', () => {
  it.each([
    'music',
    'image',
    'video',
    'generic',
    'blank',
    'stage-music',
    'stage-image',
    'stage-video',
    'stage-generic',
    'stage-blank',
    'unknown',
  ])('new %s stages default to modern', (templateId) => {
    const p = createProject({ templateId })
    expect(p.workspace).toBe('modern')
    expect(validateProject(p).ok).toBe(true)
  })
  it('separates workspace choice from appearance and view mode', () => {
    const p = createProject({ workspace: 'legacy', templateId: 'music' })
    const themed = applyCommandResult(p, { t: 'appearance/set', appearance: { theme: 'paper' } })
    expect(themed.ok && themed.value.workspace).toBe('legacy')
    const modern = createProject()
    modern.sheet.layout.presentation = { enabled: false, theme: 'paper' }
    modern.ui.mode = 'present'
    expect(validateProject(modern)).toMatchObject({
      ok: true,
      value: { workspace: 'modern', ui: { mode: 'present' } },
    })
  })
  it.each([false, true])(
    'migrates v11 preserving workspace, content and recoverable appearance (modern=%s)',
    (modern) => {
      const p = historical(modern),
        before = structuredClone(p)
      const result = validateProject(p)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.workspace).toBe(modern ? 'modern' : 'legacy')
      expect(result.value.sheet).toEqual(before.sheet)
      expect(result.value.comparison).toEqual(before.comparison)
      expect(result.value.migrationSnapshot).toEqual({
        schemaVersion: 11,
        sheet: before.sheet,
        comparison: before.comparison,
        appearance: before.appearance,
      })
      expect(validateProject(result.value)).toEqual(result)
      expect(p).toEqual(before)
    },
  )
  it('keeps the earliest recovery snapshot', () => {
    const p = historical()
    p.migrationSnapshot = { schemaVersion: 8, sheet: structuredClone(p.sheet) }
    expect(validateProject(p)).toMatchObject({
      ok: true,
      value: { migrationSnapshot: p.migrationSnapshot },
    })
  })
  it('switches in place without changing content, IDs, appearance, steps or the old layout', () => {
    const p = createProject({ templateId: 'music', workspace: 'legacy' })
    p.appearance = { palette: 'blue' }
    const scene = p.comparison!.scenes[0]!
    scene.steps.push({ id: 'step', kind: 'focus', participantId: p.sheet.sides[0].id })
    scene.appearance = { theme: 'paper' }
    const before = structuredClone(p)
    const modern = applyCommandResult(p, { t: 'workspace/set', workspace: 'modern' })
    expect(modern.ok).toBe(true)
    if (!modern.ok) return
    expect(modern.value).toEqual({ ...before, workspace: 'modern' })
    expect(applyCommandResult(modern.value, { t: 'workspace/set', workspace: 'legacy' })).toEqual({
      ok: true,
      value: before,
    })
    expect(p).toEqual(before)
  })
  it('retains the selected workspace in duplicates and project-file round trips', () => {
    for (const workspace of ['legacy', 'modern'] as const) {
      const source = createProject({ templateId: 'music', workspace })
      const copy = duplicateProject(source)
      expect(copy.workspace).toBe(workspace)
      expect(copy.id).not.toBe(source.id)
      const imported = parseSingleProject(JSON.stringify(serializeProjects([copy])))
      expect(imported).toEqual({ ok: true, value: copy })
    }
  })
  it.each(['participants', 'cases', 'samples', 'selection'] as const)(
    'rejects incompatible %s without changing data',
    (reason) => {
      let p = createProject({ templateId: 'music' })
      const c = p.comparison!.cases[0]!,
        entry = c.entries[p.sheet.sides[0].id]!
      if (reason === 'participants') {
        const result = applyCommandResult(p, { t: 'participant/add', name: 'C' })
        if (!result.ok) throw new Error(result.error)
        p = result.value
      } else if (reason === 'cases') addCase(p.comparison!, c)
      else if (reason === 'selection') entry.defaultSampleId = null
      else entry.samples.push({ ...copySample(entry.samples[0]!), hidden: true })
      const before = structuredClone(p)
      expect(legacyRestrictions(p)).toContain(reason)
      expect(applyCommandResult(p, { t: 'workspace/set', workspace: 'legacy' }).ok).toBe(false)
      expect(p).toEqual(before)
    },
  )
  it('rejects missing or invalid v12 workspace fields instead of guessing', () => {
    const p = createProject()
    expect(validateProject({ ...p, workspace: 'other' }).ok).toBe(false)
    delete p.workspace
    expect(validateProject(p).ok).toBe(false)
  })
  it('recovers historical multi-work projects into an editor that can reach all their content', () => {
    const p = historical(),
      c = p.comparison!.cases[0]!,
      e = c.entries[p.sheet.sides[0].id]!
    e.samples.push(copySample(e.samples[0]!))
    expect(validateProject(p)).toMatchObject({
      ok: true,
      value: { workspace: 'modern', comparison: p.comparison },
    })
  })
  it('upgrades an actual v11 IndexedDB in the same way as a file import', async () => {
    const name = `workspace-${crypto.randomUUID()}`,
      old = historical()
    const db = await openDatabase(name, 11, upgrade)
    await putOne(db, STORE.projects, old)
    db.close()
    const upgraded = await openDatabase(name, SCHEMA_VERSION, upgrade)
    const stored = await getOne<Project>(upgraded, STORE.projects, old.id)
    expect(validateProject(old)).toEqual({ ok: true, value: stored })
    upgraded.close()
    indexedDB.deleteDatabase(name)
  })
})
