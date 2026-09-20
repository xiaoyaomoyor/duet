import type { Cell, Project, Row } from '@/types/project'
import { SCHEMA_VERSION } from '@/types/project'
import type { ComparisonContent, ContentSelection, PresentationRuntime } from '@/types/presentation'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'

const empty = (): Cell => ({ modules: [], hidden: false })

/** Idempotent migration. Preserve every cell, including the second cell of shared rows. */
export function withComparison(project: Project): Project {
  if (project.comparison) return project
  const caseId = `${project.sheet.id}:case`
  const entries = Object.fromEntries(
    project.sheet.sides.map((side) => {
      const id = `${project.sheet.id}:${side.id}:sample`
      return [
        side.id,
        {
          defaultSampleId: id,
          samples: [
            {
              id,
              title: '作品 01',
              hidden: false,
              conditions: '',
              contentBySection: Object.fromEntries(
                project.sheet.rows
                  .filter((row) => row.kind === 'paired')
                  .map((row) => [row.id, deepClone(row.cells[side.id] ?? empty())]),
              ),
            },
          ],
        },
      ]
    }),
  )
  return {
    ...project,
    schemaVersion: SCHEMA_VERSION,
    sheet: {
      ...project.sheet,
      sides: project.sheet.sides.map((s, n) => ({
        ...s,
        catalogueLabel: s.catalogueLabel ?? String.fromCharCode(65 + n),
      })) as Project['sheet']['sides'],
    },
    ...(project.schemaVersion < 9
      ? {
          migrationSnapshot: {
            schemaVersion: project.schemaVersion,
            sheet: deepClone(project.sheet),
          },
        }
      : {}),
    comparison: {
      cases: [
        {
          id: caseId,
          title: '测试题 01',
          conditions: '',
          entries,
          sections: project.sheet.rows.map(({ cells, ...row }) => ({
            ...row,
            ...(row.kind === 'full' ? { sharedCells: deepClone(cells) } : {}),
          })),
        },
      ],
      scenes: project.sheet.rows
        .filter(
          (row) =>
            !Object.values(row.cells)
              .flatMap((c) => c.modules)
              .every((m) => m.type === 'title'),
        )
        .map((row) => ({
          id: `${row.id}:scene`,
          title: row.label ?? '',
          caseId,
          sectionId: row.id,
          hidden: false,
          samples: {},
          steps: [],
        })),
      combinations: [],
    },
  }
}

export function defaultSelection(content: ComparisonContent, caseId?: string): ContentSelection {
  const item = content.cases.find((c) => c.id === caseId) ?? content.cases[0]!
  return {
    caseId: item.id,
    samples: Object.fromEntries(
      Object.entries(item.entries).map(([id, entry]) => [id, entry.defaultSampleId]),
    ),
  }
}

/** A transient projection keeps existing module renderers/editors working against a single sample. */
export function projectSelection(project: Project, selection?: ContentSelection): Project {
  const content = project.comparison
  if (!content) return project
  const selected = selection ?? defaultSelection(content)
  const item = content.cases.find((c) => c.id === selected.caseId)
  if (!item) return { ...project, sheet: { ...project.sheet, rows: [] } }
  const rows: Row[] = item.sections.map(({ sharedCells, ...section }) => ({
    ...section,
    cells:
      section.kind === 'full'
        ? (sharedCells ?? {})
        : Object.fromEntries(
            project.sheet.sides.map((p) => {
              const sampleId = Object.hasOwn(selected.samples, p.id)
                ? selected.samples[p.id]
                : item.entries[p.id]?.defaultSampleId
              const sample = item.entries[p.id]?.samples.find((s) => s.id === sampleId)
              return [p.id, sample?.contentBySection[section.id] ?? empty()]
            }),
          ),
  }))
  return { ...project, sheet: { ...project.sheet, rows } }
}

/** Commit projected edits back to the selected samples, never copy other samples' contents. */
export function commitSelection(
  original: Project,
  edited: Project,
  selection: ContentSelection,
): Project {
  const content = deepClone(original.comparison!)
  const item = content.cases.find((c) => c.id === selection.caseId)!
  const previous = new Set(item.sections.map((s) => s.id))
  item.sections = edited.sheet.rows.map(({ cells, ...row }) => ({
    ...row,
    ...(row.kind === 'full' ? { sharedCells: deepClone(cells) } : {}),
  }))
  for (const [participantId, entry] of Object.entries(item.entries)) {
    const sample = entry.samples.find((s) => s.id === selection.samples[participantId])
    if (sample) {
      const beforeAudio = Object.values(sample.contentBySection)
        .flatMap((c) => c.modules)
        .filter((m) => m.type === 'audio')
      const afterAudio = edited.sheet.rows
        .flatMap((r) => r.cells[participantId]?.modules ?? [])
        .filter((m) => m.type === 'audio')
      const source = (data: unknown) => {
        const d = data as { assetId?: string; sourceUrl?: string }
        return d?.assetId || d?.sourceUrl || ''
      }
      if (
        afterAudio.some((m) => {
          const before = beforeAudio.find((b) => b.id === m.id)
          return before && source(before.data) && source(before.data) !== source(m.data)
        }) &&
        Object.values(sample.contentBySection).some((c) =>
          c.modules.some((m) => m.type === 'lyrics'),
        )
      )
        sample.lyricsNeedReview = true
      sample.contentBySection = Object.fromEntries(
        edited.sheet.rows
          .filter((r) => r.kind === 'paired')
          .map((r) => [r.id, deepClone(r.cells[participantId] ?? empty())]),
      )
    }
    for (const other of entry.samples)
      for (const id of Object.keys(other.contentBySection))
        if (!item.sections.some((s) => s.id === id)) delete other.contentBySection[id]
  }
  content.scenes = content.scenes.filter(
    (s) => s.caseId !== item.id || item.sections.some((r) => r.id === s.sectionId),
  )
  for (const row of edited.sheet.rows)
    if (!previous.has(row.id))
      content.scenes.push({
        id: uuid(),
        title: row.label ?? '',
        caseId: item.id,
        sectionId: row.id,
        hidden: false,
        samples: {},
        steps: [],
      })
  return projectSelection({ ...edited, comparison: content })
}

/** Rebuild from defaults + a prefix of steps; backwards never tries to undo DOM effects. */
export function resolveRuntime(
  content: ComparisonContent,
  sceneId: string,
  stepIndex = 0,
): PresentationRuntime {
  const scene = content.scenes.find((s) => s.id === sceneId) ?? content.scenes[0]
  const base = defaultSelection(content, scene?.caseId)
  const state: PresentationRuntime = {
    ...base,
    samples: { ...base.samples, ...scene?.samples },
    sceneId: scene?.id ?? '',
    stepIndex: Math.max(0, Math.min(scene?.steps.length ?? 0, stepIndex)),
    focusIds: [],
    revealedIdentities: [],
    concealedIds: [],
    transportState: 'paused',
  }
  if (!scene) return state
  state.concealedIds = [
    ...new Set(scene.steps.filter((s) => s.kind === 'reveal').map((s) => s.participantId)),
  ]
  for (const step of scene.steps.slice(0, state.stepIndex)) {
    if (step.kind === 'focus') state.focusIds = [step.participantId]
    if (step.kind === 'sample') state.samples[step.participantId] = step.sampleId
    if (step.kind === 'identity') state.revealedIdentities.push(step.participantId)
    if (step.kind === 'reveal')
      state.concealedIds = state.concealedIds.filter((id) => id !== step.participantId)
  }
  const item = content.cases.find((c) => c.id === state.caseId)!
  for (const [p, id] of Object.entries(state.samples))
    if (!item.entries[p]?.samples.some((s) => s.id === id && !s.hidden)) state.samples[p] = null
  return state
}

/** Re-key entities and every reference, while preserving asset/tool IDs and arbitrary user text. */
export function rekeyProject(project: Project): Project {
  const copy = deepClone(project)
  const ids = new Map<string, string>()
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    const obj = value as Record<string, unknown>
    if (typeof obj.id === 'string') ids.set(obj.id, uuid())
    for (const [key, child] of Object.entries(obj))
      if (!['data', 'props', 'toolRef', 'migrationSnapshot'].includes(key)) collect(child)
  }
  collect(copy)
  function rewrite(value: unknown, parent = ''): unknown {
    if (Array.isArray(value))
      return value.map((v) => rewrite(v, typeof v === 'object' ? '' : parent))
    if (!value || typeof value !== 'object')
      return typeof value === 'string' &&
        (parent === 'id' ||
          /Id$/.test(parent) ||
          ['samples', 'focusIds', 'revealedIdentities'].includes(parent))
        ? (ids.get(value) ?? value)
        : value
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        ['cells', 'sharedCells', 'entries', 'contentBySection', 'samples'].includes(parent)
          ? (ids.get(key) ?? key)
          : key,
        ['data', 'props', 'toolRef', 'migrationSnapshot'].includes(key)
          ? child
          : rewrite(child, parent === 'samples' ? parent : key),
      ]),
    )
  }
  return rewrite(copy) as Project
}
