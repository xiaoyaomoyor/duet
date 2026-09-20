import { isPlainObject, validateCell } from './validate'
import type { ComparisonContent } from './presentation'
import type { Project } from './project'
import { err, ok, type Result } from '@/lib/result'
import { validAppearance } from './appearance'

/** Validate inactive samples and references too; no silent loss through a permissive cast. */
export function validateComparison(
  value: unknown,
  project: Project,
): Result<ComparisonContent, string> {
  const fail = () => err('比较内容：结构损坏、重复 ID 或引用不存在')
  if (
    !isPlainObject(value) ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    !Array.isArray(value.scenes) ||
    !Array.isArray(value.combinations)
  )
    return fail()
  const ids = new Set<string>([project.id, project.sheet.id])
  const id = (v: unknown): v is string => {
    if (typeof v !== 'string' || !v || ids.has(v)) return false
    ids.add(v)
    return true
  }
  const participants = project.sheet.sides.map((p) => p.id)
  if (!participants.every(id)) return fail()
  const cells = (v: unknown): boolean => {
    const result = validateCell(v, '作品内容')
    return result.ok && result.value.modules.every((m) => id(m.id))
  }
  for (const c of value.cases) {
    if (
      !isPlainObject(c) ||
      !id(c.id) ||
      typeof c.title !== 'string' ||
      typeof c.conditions !== 'string' ||
      !Array.isArray(c.sections) ||
      !isPlainObject(c.entries)
    )
      return fail()
    const sections = new Set<string>()
    for (const s of c.sections) {
      if (!isPlainObject(s) || !id(s.id) || !['paired', 'full'].includes(String(s.kind)))
        return fail()
      sections.add(s.id)
      if (
        s.kind === 'full' &&
        (!isPlainObject(s.sharedCells) ||
          !Object.entries(s.sharedCells).every(([p, v]) => participants.includes(p) && cells(v)))
      )
        return fail()
    }
    if (Object.keys(c.entries).some((p) => !participants.includes(p))) return fail()
    for (const p of participants) {
      const e = c.entries[p]
      if (!isPlainObject(e) || !Array.isArray(e.samples)) return fail()
      for (const s of e.samples) {
        if (
          !isPlainObject(s) ||
          !id(s.id) ||
          typeof s.title !== 'string' ||
          typeof s.hidden !== 'boolean' ||
          typeof s.conditions !== 'string' ||
          !isPlainObject(s.contentBySection)
        )
          return fail()
        if (
          !Object.entries(s.contentBySection).every(
            ([section, cell]) => sections.has(section) && cells(cell),
          )
        )
          return fail()
      }
      if (
        e.defaultSampleId !== null &&
        !e.samples.some((s: { id: string }) => s.id === e.defaultSampleId)
      )
        return fail()
    }
  }
  const content = value as unknown as ComparisonContent
  const selection = (caseId: string, samples: unknown): boolean => {
    const c = content.cases.find((c) => c.id === caseId)
    return (
      !!c &&
      isPlainObject(samples) &&
      Object.entries(samples).every(
        ([p, s]) =>
          participants.includes(p) && (s === null || c.entries[p]?.samples.some((v) => v.id === s)),
      )
    )
  }
  for (const scene of content.scenes) {
    if (scene?.appearance !== undefined && !validAppearance(scene.appearance)) return fail()
    if (
      !isPlainObject(scene) ||
      !id(scene.id) ||
      typeof scene.title !== 'string' ||
      typeof scene.hidden !== 'boolean' ||
      !selection(scene.caseId, scene.samples) ||
      !content.cases
        .find((c) => c.id === scene.caseId)
        ?.sections.some((s) => s.id === scene.sectionId) ||
      !Array.isArray(scene.steps)
    )
      return fail()
    for (const step of scene.steps) {
      if (
        !isPlainObject(step) ||
        !id(step.id) ||
        !participants.includes(step.participantId) ||
        !['reveal', 'focus', 'sample', 'identity'].includes(step.kind)
      )
        return fail()
      if (
        step.kind === 'sample' &&
        !selection(scene.caseId, { [step.participantId]: step.sampleId })
      )
        return fail()
    }
  }
  for (const combination of content.combinations)
    if (
      !isPlainObject(combination) ||
      !id(combination.id) ||
      typeof combination.title !== 'string' ||
      !selection(combination.caseId, combination.samples)
    )
      return fail()
  return ok(content)
}
