import type { Project, WorkspaceKind } from '@/types/project'
import { err, ok, type Result } from '@/lib/result'
import { projectSelection } from './comparisonContent'

export type LegacyRestriction = 'participants' | 'cases' | 'samples' | 'selection'

/** Hidden works count too: a switch must never conceal content the old editor cannot reach. */
export function legacyRestrictions(project: Project): LegacyRestriction[] {
  const reasons: LegacyRestriction[] = []
  if (project.sheet.sides.length !== 2) reasons.push('participants')
  const cases = project.comparison?.cases ?? []
  if (cases.length > 1) reasons.push('cases')
  if (cases.some((c) => Object.values(c.entries).some((e) => e.samples.length > 1)))
    reasons.push('samples')
  if (
    cases.some((c) =>
      project.sheet.sides.some((side) => {
        const entry = c.entries[side.id]
        return !entry?.samples.some((s) => s.id === entry.defaultSampleId)
      }),
    )
  )
    reasons.push('selection')
  return reasons
}

export function changeWorkspace(
  project: Project,
  workspace: WorkspaceKind,
): Result<Project, string> {
  if (workspace !== 'modern' && workspace !== 'legacy') return err('工作区类型无效')
  if (workspace === 'legacy' && legacyRestrictions(project).length)
    return err(
      '旧版工作区仅支持双对象、单测试题、每个对象至多一份作品。全部内容仍保留在新版工作区。',
    )
  // Resolve the default selection before entering the old editor; keep the complete comparison.
  return ok(projectSelection({ ...project, workspace, ui: { ...project.ui, mode: 'edit' } }))
}
