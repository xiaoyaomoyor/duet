import { describe, expect, it } from 'vitest'
import '@/modules'
import { createProject, serializeProjects, parseSingleProject } from './projectService'
import {
  createScene,
  duplicateScene,
  removeScene,
  moveScene,
  moduleDestinations,
} from './sceneEditing'
import { applyCommandResult } from './commands'
import { copySample } from './comparisonEditing'
import { defaultSelection, projectSelection } from './comparisonContent'
import { validateProject } from '@/types/validate'
import type { Cell, Project } from '@/types/project'

function setup() {
  const project = createProject({ templateId: 'stage-blank' })
  const content = project.comparison!,
    item = content.cases[0]!
  const scene = createScene(content, item.id, 'paired', 'listening')
  return { project, content, item, scene }
}
const cells = (project: Project, sectionId: string): Cell[] =>
  Object.values(project.comparison!.cases[0]!.entries).flatMap((e) =>
    e.samples.map((s) => s.contentBySection[sectionId]).filter((c): c is Cell => !!c),
  )

describe('W2 scene content and editing boundaries', () => {
  it('creates a listening scene with independent empty audio slots and a serializable layout', () => {
    const { project, scene } = setup()
    const modules = cells(project, scene.sectionId).flatMap((c) => c.modules)
    expect(modules).toHaveLength(2)
    expect(new Set(modules.map((m) => m.id)).size).toBe(2)
    expect(modules.every((m) => m.type === 'audio')).toBe(true)
    expect(validateProject(project).ok).toBe(true)
    const result = parseSingleProject(JSON.stringify(serializeProjects([project])))
    expect(result.ok && result.value.comparison!.scenes[0]!.layout).toBe('listening')
  })
  it('duplicates every work and shared cell independently while retaining media IDs and scene settings', () => {
    const { project, content, item, scene } = setup()
    const entry = Object.values(item.entries)[0]!
    entry.samples[0]!.contentBySection[scene.sectionId]!.modules[0]!.data = {
      assetId: 'same-file',
      coverAssetId: 'same-cover',
    }
    const inactive = copySample(entry.samples[0]!)
    inactive.hidden = true
    entry.samples.push(inactive)
    scene.appearance = { theme: 'paper' }
    scene.steps.push({ id: 'focus', kind: 'focus', participantId: project.sheet.sides[0].id })
    const copy = duplicateScene(content, scene.id)
    expect(copy.sectionId).not.toBe(scene.sectionId)
    expect(copy.appearance).toEqual(scene.appearance)
    expect(copy.steps[0]!.id).not.toBe(scene.steps[0]!.id)
    const source = cells(project, scene.sectionId),
      cloned = cells(project, copy.sectionId)
    expect(cloned).toHaveLength(3)
    cloned.forEach((cell, n) => {
      expect(cell.modules[0]!.data).toEqual(source[n]!.modules[0]!.data)
      expect(cell.modules[0]!.id).not.toBe(source[n]!.modules[0]!.id)
      cell.modules[0]!.title = 'independent'
      expect(source[n]!.modules[0]!.title).not.toBe('independent')
    })
    const shared = createScene(content, item.id, 'full')
    const section = item.sections.find((s) => s.id === shared.sectionId)!
    section.sharedCells![project.sheet.sides[0].id]!.modules.push({
      id: 'shared-text',
      type: 'text',
      hidden: false,
      title: '',
      props: {},
      data: { text: 'common' },
    })
    const sharedCopy = duplicateScene(content, shared.id)
    const copiedCell = item.sections.find((s) => s.id === sharedCopy.sectionId)!.sharedCells![
      project.sheet.sides[0].id
    ]!
    expect(copiedCell.modules[0]!.id).not.toBe('shared-text')
    expect(validateProject(project).ok).toBe(true)
  })
  it('makes explicit references share content and never removes a still-referenced source', () => {
    const { project, content, item, scene } = setup()
    const linked = duplicateScene(content, scene.id, true)
    expect(linked.sectionId).toBe(scene.sectionId)
    removeScene(content, scene.id, true)
    expect(item.sections.some((s) => s.id === scene.sectionId)).toBe(true)
    expect(cells(project, scene.sectionId)).toHaveLength(2)
    removeScene(content, linked.id)
    expect(cells(project, scene.sectionId)).toHaveLength(2)
    expect(validateProject(project).ok).toBe(true)
  })
  it('deletes an unreferenced source across inactive works only when requested', () => {
    const { project, content, item, scene } = setup()
    Object.values(item.entries)[0]!.samples.push(
      copySample(Object.values(item.entries)[0]!.samples[0]!),
    )
    removeScene(content, scene.id, true)
    expect(cells(project, scene.sectionId)).toHaveLength(0)
    expect(content.scenes).toHaveLength(0)
    expect(validateProject(project).ok).toBe(true)
  })
  it('reorders scenes without rearranging or changing their source contents', () => {
    const { content, item, scene } = setup()
    const second = createScene(content, item.id, 'full')
    const before = structuredClone(item)
    moveScene(content, second.id, -1)
    expect(content.scenes.map((s) => s.id)).toEqual([second.id, scene.id])
    expect(item).toEqual(before)
  })
  it('moves a module from a non-default work without touching defaults and keeps the operation immutable', () => {
    const { project, content, item, scene } = setup()
    const target = createScene(content, item.id, 'paired')
    const p = project.sheet.sides[0].id,
      entry = item.entries[p]!
    const work = copySample(entry.samples[0]!)
    entry.samples.push(work)
    const m = work.contentBySection[scene.sectionId]!.modules[0]!
    m.data = { assetId: 'non-default-file' }
    const selection = {
      ...defaultSelection(content),
      samples: { ...defaultSelection(content).samples, [p]: work.id },
    }
    const before = structuredClone(project)
    const result = applyCommandResult(
      project,
      {
        t: 'module/move',
        from: { rowId: scene.sectionId, sideId: p, moduleId: m.id },
        to: { rowId: target.sectionId, sideId: p },
        toIndex: 0,
      },
      selection,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const moved = result.value.comparison!.cases[0]!.entries[p]!
    expect(moved.samples[0]).toEqual(entry.samples[0])
    expect(moved.samples[1]!.contentBySection[scene.sectionId]!.modules).toHaveLength(0)
    expect(moved.samples[1]!.contentBySection[target.sectionId]!.modules[0]).toEqual(m)
    expect(project).toEqual(before)
    expect(validateProject(result.value).ok).toBe(true)
  })
  it('rejects moving into an absent work before removing the original module', () => {
    const { project, content, scene } = setup()
    const [a, b] = project.sheet.sides
    const selection = defaultSelection(content)
    selection.samples[b.id] = null
    const projected = projectSelection(project, selection)
    const m = projected.sheet.rows.find((r) => r.id === scene.sectionId)!.cells[a.id]!.modules[0]!
    const before = structuredClone(project)
    const result = applyCommandResult(
      project,
      {
        t: 'module/move',
        from: { rowId: scene.sectionId, sideId: a.id, moduleId: m.id },
        to: { rowId: scene.sectionId, sideId: b.id },
        toIndex: 0,
      },
      selection,
    )
    expect(result.ok).toBe(false)
    expect(project).toEqual(before)
    expect(moduleDestinations(project, selection, 'audio').some((d) => d.sideId === b.id)).toBe(
      false,
    )
  })
  it('retains v12 workspace identity in a recovery snapshot and rejects unsupported layouts', () => {
    const { project, scene } = setup()
    project.schemaVersion = 12
    delete scene.layout
    const result = validateProject(project)
    expect(result.ok && result.value.migrationSnapshot?.workspace).toBe('modern')
    Object.assign(scene, { layout: 'unsupported' })
    expect(validateProject(project).ok).toBe(false)
  })
})
