import type { Cell, Project } from '@/types/project'
import type {
  ComparisonContent,
  ContentSelection,
  PresentationScene,
  SceneLayout,
} from '@/types/presentation'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { getModule } from '@/modules/registry'

const empty = (): Cell => ({ modules: [], hidden: false })

/** Mutate a detached command draft. Scene identity and content identity are deliberately separate. */
export function createScene(
  content: ComparisonContent,
  caseId: string,
  kind: 'paired' | 'full',
  layout: SceneLayout = 'general',
): PresentationScene {
  const item = content.cases.find((c) => c.id === caseId)!
  const section = {
    id: uuid(),
    kind,
    label: layout === 'listening' ? '作品试听' : kind === 'full' ? '共同内容' : '新场景',
    collapsed: false,
    ...(kind === 'full'
      ? { sharedCells: Object.fromEntries(Object.keys(item.entries).map((id) => [id, empty()])) }
      : {}),
  }
  item.sections.push(section)
  for (const entry of Object.values(item.entries))
    for (const sample of entry.samples) {
      if (kind !== 'paired') continue
      const cell = empty()
      if (layout === 'listening') {
        const definition = getModule('audio')!
        cell.modules.push({
          id: uuid(),
          type: 'audio',
          title: '',
          hidden: false,
          props: { ...definition.defaultProps },
          data: definition.schema.create(),
        })
      }
      sample.contentBySection[section.id] = cell
    }
  const scene: PresentationScene = {
    id: uuid(),
    title: section.label,
    caseId,
    sectionId: section.id,
    layout,
    hidden: false,
    samples: {},
    steps: [],
  }
  content.scenes.push(scene)
  return scene
}

export function duplicateScene(
  content: ComparisonContent,
  sceneId: string,
  linked = false,
): PresentationScene {
  const at = content.scenes.findIndex((s) => s.id === sceneId)
  const original = content.scenes[at]!
  const scene = deepClone(original)
  scene.id = uuid()
  scene.title += linked ? ' 引用' : ' 副本'
  scene.steps.forEach((step) => {
    step.id = uuid()
  })
  if (!linked) {
    const item = content.cases.find((c) => c.id === scene.caseId)!
    const source = item.sections.find((s) => s.id === scene.sectionId)!
    const section = deepClone(source)
    section.id = uuid()
    section.label = scene.title
    const copyCell = (cell: Cell): Cell => {
      const copy = deepClone(cell)
      copy.modules.forEach((m) => {
        m.id = uuid()
      })
      return copy
    }
    if (section.sharedCells)
      section.sharedCells = Object.fromEntries(
        Object.entries(section.sharedCells).map(([id, cell]) => [id, copyCell(cell)]),
      )
    item.sections.splice(item.sections.indexOf(source) + 1, 0, section)
    // Copy every work, including hidden/inactive works, so switching works never reuses the original page.
    for (const entry of Object.values(item.entries))
      for (const sample of entry.samples) {
        const cell = sample.contentBySection[source.id]
        if (cell) sample.contentBySection[section.id] = copyCell(cell)
      }
    scene.sectionId = section.id
  }
  content.scenes.splice(at + 1, 0, scene)
  return scene
}

export function removeScene(content: ComparisonContent, id: string, removeContent = false): void {
  const scene = content.scenes.find((s) => s.id === id)
  if (!scene) return
  content.scenes = content.scenes.filter((s) => s.id !== id)
  if (
    !removeContent ||
    content.scenes.some((s) => s.caseId === scene.caseId && s.sectionId === scene.sectionId)
  )
    return
  const item = content.cases.find((c) => c.id === scene.caseId)!
  item.sections = item.sections.filter((s) => s.id !== scene.sectionId)
  for (const entry of Object.values(item.entries))
    for (const sample of entry.samples) delete sample.contentBySection[scene.sectionId]
}

export function moveScene(content: ComparisonContent, id: string, offset: number): void {
  const at = content.scenes.findIndex((s) => s.id === id)
  if (at < 0) return
  const [scene] = content.scenes.splice(at, 1)
  content.scenes.splice(Math.max(0, Math.min(content.scenes.length, at + offset)), 0, scene!)
}

export function moduleDestinations(project: Project, selection: ContentSelection, type: string) {
  const item = project.comparison!.cases.find((c) => c.id === selection.caseId)!
  const scope = getModule(type)?.scope ?? 'side'
  return item.sections.flatMap((section) => {
    if (
      (section.kind === 'full' && scope === 'side') ||
      (section.kind === 'paired' && scope === 'common')
    )
      return []
    // Identity rows are a legacy compatibility detail, not a free-form content target.
    const cells =
      section.sharedCells ??
      Object.fromEntries(
        Object.entries(item.entries).map(([id, entry]) => [
          id,
          entry.samples.find((s) => s.id === selection.samples[id])?.contentBySection[section.id],
        ]),
      )
    const modules = Object.values(cells).flatMap((cell) => cell?.modules ?? [])
    if (modules.length && modules.every((m) => m.type === 'title')) return []
    return project.sheet.sides
      .filter((p, n) =>
        section.kind === 'full'
          ? n === 0
          : item.entries[p.id]?.samples.some((s) => s.id === selection.samples[p.id]),
      )
      .map((p) => ({
        rowId: section.id,
        sideId: p.id,
        label: `${section.label || '未命名内容'} · ${section.kind === 'full' ? '共同内容' : (p.catalogueLabel ?? p.labelOverride ?? p.id)}`,
      }))
  })
}
