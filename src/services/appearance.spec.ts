import { describe, expect, it } from 'vitest'
import { createProject } from './projectService'
import {
  setAppearance,
  resolveAppearance,
  presetFile,
  parsePreset,
  BUILTIN_APPEARANCES,
} from './appearance'
import { validAppearance } from '@/types/appearance'
import { validateProject } from '@/types/validate'
import { migrateProject } from './projectMigration'
import {
  saveAppearancePreset,
  listAppearancePresets,
  removeAppearancePreset,
} from './appearancePresets'
import { resolveComparison } from './sceneResolver'
describe('R5 appearance inheritance and portable presets', () => {
  it('preserves legacy theme and merges scene overrides without touching content', () => {
    const p = createProject({ templateId: 'stage-music' }),
      scene = p.comparison!.scenes[0]!
    p.sheet.layout.presentation = { enabled: true, theme: 'paper' }
    const before = JSON.stringify(p.comparison)
    const r = setAppearance(p, { palette: 'blue' })
    if (!r.ok) throw Error(r.error)
    expect(resolveAppearance(r.value)).toMatchObject({ theme: 'paper', palette: 'blue' })
    expect(JSON.stringify(r.value.comparison)).toBe(before)
    const next = setAppearance(r.value, { theme: 'ink' }, scene.id)
    if (!next.ok) throw Error(next.error)
    expect(resolveAppearance(next.value, scene.id)).toMatchObject({ theme: 'ink', palette: 'blue' })
    const reset = setAppearance(next.value, null, scene.id)
    if (!reset.ok) throw Error(reset.error)
    expect(resolveAppearance(reset.value, scene.id)).toMatchObject({
      theme: 'paper',
      palette: 'blue',
    })
    expect(p.appearance).toBeUndefined()
  })
  it.each([
    { text: 'secret' },
    { assetId: 'abc' },
    { name: 'Suno' },
    { theme: 'pink' },
    { showBrand: 'false' },
    JSON.parse('{"__proto__":{}}'),
    { toString: 'x' },
  ])('rejects content, resources and unknown choices %j', (bad) => {
    expect(validAppearance(bad)).toBe(false)
    expect(
      parsePreset(
        JSON.stringify({ $format: 'duet-appearance', version: 1, name: 'bad', appearance: bad }),
      ).ok,
    ).toBe(false)
  })
  it('round trips appearance only and rejects oversized input', () => {
    for (const p of BUILTIN_APPEARANCES)
      expect(parsePreset(presetFile(p.name, p.appearance))).toEqual({
        ok: true,
        value: { name: p.name, appearance: p.appearance },
      })
    expect(parsePreset(' '.repeat(16001)).ok).toBe(false)
  })
  it('persists independent copies; deleting library presets leaves project settings intact', async () => {
    const appearance = { theme: 'paper' as const }
    const p = await saveAppearancePreset({ name: '独立预设', appearance })
    appearance.theme = 'ink' as 'paper'
    expect((await listAppearancePresets()).find((v) => v.id === p.id)?.appearance.theme).toBe(
      'paper',
    )
    await removeAppearancePreset(p.id)
    expect((await listAppearancePresets()).some((v) => v.id === p.id)).toBe(false)
    expect(p.appearance.theme).toBe('paper')
  })
  it('migrates v10 once and validates project and scene patches', () => {
    const p = createProject({ templateId: 'stage-music' })
    p.schemaVersion = 10
    const upgraded = migrateProject(p)
    expect(upgraded.schemaVersion).toBe(13)
    expect(upgraded.migrationSnapshot?.schemaVersion).toBe(10)
    expect(migrateProject(upgraded)).toEqual(upgraded)
    expect(validateProject(upgraded).ok).toBe(true)
    Object.assign(upgraded, { appearance: { sourceUrl: 'https://example.com' } })
    expect(validateProject(upgraded).ok).toBe(false)
    delete upgraded.appearance
    Object.assign(upgraded.comparison!.scenes[0]!, { appearance: { toolId: 'private' } })
    expect(validateProject(upgraded).ok).toBe(false)
  })
  it('resolves the selected scene when several scenes share one content section', () => {
    const p = createProject({ templateId: 'stage-music' }),
      first = p.comparison!.scenes[0]!
    p.comparison!.scenes.push({ ...first, id: 'other', appearance: { palette: 'blue' } })
    const c = resolveComparison(
      p,
      () => ({ name: 'Tool' }),
      (k) => k,
      undefined,
      undefined,
      'other',
    )
    expect(c.sections.find((s) => s.id === first.sectionId)?.appearance.palette).toBe('blue')
  })
})
