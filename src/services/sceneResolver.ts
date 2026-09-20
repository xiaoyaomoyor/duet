import { resolveAppearance } from './appearance'
import type { Appearance } from '@/types/appearance'
import type { ModuleInstance, ModuleRef, Project, ToolRef } from '@/types/project'
import { getModule } from '@/modules/registry'
import { isPresentable } from '@/modules/visibility'
import type { StageParticipant, StageMetric } from '@/components/stage/types'
import type { ContentSelection, PresentationRuntime } from '@/types/presentation'
import { projectSelection, defaultSelection } from './comparisonContent'

export interface ResolvedContent {
  module: ModuleInstance
  ref: ModuleRef
  trackId: string
  visible: boolean
  known: boolean
  clockId: string
}
export interface ResolvedEntry {
  participantId: string
  sampleId: string
  sampleTitle: string
  missingSample: boolean
  conditions: string
  contents: ResolvedContent[]
  hidden: boolean
}
export interface ResolvedSection {
  appearance: Appearance
  id: string
  title: string
  shared: boolean
  entries: ResolvedEntry[]
  contents: ResolvedContent[]
  metrics: StageMetric[]
  visible: boolean
  identity: boolean
}
export interface ResolvedComparison {
  id: string
  title: string
  caseId: string
  caseTitle: string
  conditions: string
  theme: 'ink' | 'paper'
  participants: StageParticipant[]
  sections: ResolvedSection[]
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/** Pure v8 adapter. Only this boundary knows sides/cells; no copies of project data are persisted. */
export function resolveComparison(
  project: Project,
  resolveTool: (ref: ToolRef) => { name: string },
  t: (key: string) => string,
  selection?: ContentSelection,
  runtime?: PresentationRuntime,
  appearanceSceneId?: string,
): ResolvedComparison {
  const selected =
    selection ?? (project.comparison ? defaultSelection(project.comparison) : undefined)
  project = projectSelection(project, selected)
  const testCase = project.comparison?.cases.find((c) => c.id === selected?.caseId)
  const participants = project.sheet.sides.map((side, index): StageParticipant => ({
    id: side.id,
    label: side.catalogueLabel ?? String.fromCharCode(65 + index),
    tone: (side.catalogueLabel ?? String.fromCharCode(65 + index)).charCodeAt(0) % 2 ? 'a' : 'b',
    name:
      side.showName === false
        ? ''
        : side.anonymizeName && !runtime?.revealedIdentities.includes(side.id)
          ? `${t('studio.anonymous')} ${side.catalogueLabel ?? String.fromCharCode(65 + index)}`
          : (side.labelOverride ?? resolveTool(side.toolRef).name),
    version:
      side.showVersion === false
        ? ''
        : side.anonymizeVersion && !runtime?.revealedIdentities.includes(side.id)
          ? '•••'
          : (side.modelVersion ?? ''),
    description: side.showNote === false ? '' : (side.note ?? ''),
    track: '',
  }))
  const sections = project.sheet.rows.map((row): ResolvedSection => {
    const entries = participants.map((p): ResolvedEntry => {
      const cell = row.cells[p.id]
      const sample = testCase?.entries[p.id]?.samples.find((s) => s.id === selected?.samples[p.id])
      const sampleId = sample?.id ?? `${project.sheet.id}:${p.id}:default`
      const clockId = `${project.id}:${testCase?.id ?? 'default'}:${p.id}:${sampleId}`
      return {
        participantId: p.id,
        sampleId,
        sampleTitle: sample?.title ?? '',
        missingSample: !!testCase && !sample,
        conditions: sample?.conditions ?? '',
        hidden: cell?.hidden === true,
        contents: (cell?.modules ?? []).map((module) => ({
          module,
          ref: { rowId: row.id, sideId: p.id, moduleId: module.id },
          trackId: `${clockId}:${module.id}`,
          clockId,
          visible: !cell?.hidden && isPresentable(module),
          known: !!getModule(module.type),
        })),
      }
    })
    const contents = entries.flatMap((e) => e.contents)
    const identity = contents.length > 0 && contents.every((c) => c.module.type === 'title')
    const active = contents.filter((c) => c.visible && c.module.type !== 'title')
    const metrics = row.kind === 'full' ? [] : resolveMetrics(entries)
    return {
      appearance: resolveAppearance(
        project,
        project.comparison?.scenes.find(
          (s) =>
            s.id === (appearanceSceneId ?? runtime?.sceneId) &&
            s.sectionId === row.id &&
            s.caseId === testCase?.id,
        )?.id ??
          project.comparison?.scenes.find(
            (s) => s.sectionId === row.id && s.caseId === testCase?.id,
          )?.id,
      ),
      id: row.id,
      title:
        row.label?.trim() ||
        contents.find((c) => c.module.title.trim())?.module.title ||
        t('studio.emptySection'),
      shared: row.kind === 'full',
      entries,
      contents,
      metrics,
      identity,
      visible: !identity && active.length > 0,
    }
  })
  return {
    id: project.id,
    title: project.title,
    caseId: testCase?.id ?? `${project.sheet.id}:default`,
    caseTitle: testCase?.title ?? '',
    conditions: testCase?.conditions ?? '',
    theme: resolveAppearance(project).theme,
    participants,
    sections,
  }
}

/** Union by dimension label and occurrence, never by the position in the other participant's table. */
function resolveMetrics(entries: ResolvedEntry[]): StageMetric[] {
  const visible = entries.flatMap((e) => e.contents.filter((c) => c.visible))
  if (
    !visible.length ||
    visible.some(
      (c) =>
        !['keyValue', 'score'].includes(c.module.type) ||
        (c.module.type === 'score' && object(c.module.data).showNumber === false),
    )
  )
    return []
  const metrics = new Map<string, StageMetric>()
  for (const entry of entries) {
    const occurrences = new Map<string, number>()
    for (const content of entry.contents.filter((c) => c.visible)) {
      const data = object(content.module.data)
      const maximum = Math.max(
        1,
        Math.round(typeof data.max === 'number' && Number.isFinite(data.max) ? data.max : 10),
      )
      const rows =
        content.module.type === 'keyValue'
          ? Array.isArray(data.rows)
            ? data.rows
                .map(object)
                .filter((r) => String(r.key ?? '').trim() || String(r.value ?? '').trim())
                .map((r) => ({
                  label: String(r.key ?? ''),
                  value: String(r.value ?? ''),
                  unit: '',
                }))
            : []
          : [
              {
                label: String(data.label || content.module.title),
                value:
                  typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0
                    ? String(Math.min(maximum, data.score))
                    : '',
                unit: `/ ${maximum}`,
              },
            ]
      for (const row of rows) {
        const dimension = `${row.label.trim()}\u0000${row.unit}`
        const count = occurrences.get(dimension) ?? 0
        occurrences.set(dimension, count + 1)
        const id = `${dimension}\u0000${count}`
        const metric = metrics.get(id) ?? {
          id,
          label: row.label || '—',
          ...(row.unit ? { unit: row.unit } : {}),
          values: {},
        }
        metric.values[entry.participantId] = { value: row.value || '—', note: '' }
        metrics.set(id, metric)
      }
    }
  }
  return [...metrics.values()]
}
