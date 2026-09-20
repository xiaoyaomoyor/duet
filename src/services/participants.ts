import type { Project, Sheet } from '@/types/project'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { err, ok, type Result } from '@/lib/result'
import { withComparison, projectSelection } from './comparisonContent'
import type { ParticipantCommand } from '@/types/commands'
export type { ParticipantCommand } from '@/types/commands'

/** One immutable command includes all cases, sample/step references and shared content. */
export function editParticipants(
  project: Project,
  command: ParticipantCommand,
): Result<Project, string> {
  const p = deepClone(withComparison(project))
  const sides = p.sheet.sides,
    content = p.comparison!
  sides.forEach((s, n) => {
    s.catalogueLabel ??= String.fromCharCode(65 + n)
  })
  if (command.t === 'participant/add') {
    if (p.workspace === 'legacy') return err('请先切换到新版工作区，再添加对比对象')
    if (sides.length >= 6) return err('最多支持六个对比对象')
    const label = [...'ABCDEF'].find((l) => !sides.some((s) => s.catalogueLabel === l))!
    const id = uuid()
    sides.push({
      id,
      catalogueLabel: label,
      toolRef: { kind: 'inline', name: command.name.trim() || `工具 ${label}` },
      accent: '#94a3b8',
      accentPreset: label.charCodeAt(0) % 2 ? 'violet' : 'cyan',
    })
    for (const c of content.cases) {
      const sample = {
        id: uuid(),
        title: '作品 01',
        hidden: false,
        conditions: '',
        contentBySection: Object.fromEntries(
          c.sections
            .filter((s) => s.kind === 'paired')
            .map((s) => [
              s.id,
              {
                modules: (c.entries[sides[0].id]?.samples[0]?.contentBySection[s.id]?.modules ?? [])
                  .filter((m) => m.type === 'title')
                  .map((m) => ({ ...deepClone(m), id: uuid() })),
                hidden: false,
              },
            ]),
        ),
      }
      c.entries[id] = { defaultSampleId: sample.id, samples: [sample] }
    }
    p.workspace = 'modern'
  } else if (command.t === 'participant/reorder') {
    if (
      command.ids.length !== sides.length ||
      new Set(command.ids).size !== sides.length ||
      command.ids.some((id) => !sides.some((s) => s.id === id))
    )
      return err('对象排序必须包含全部对象且不能重复')
    p.sheet.sides = command.ids.map((id) => sides.find((s) => s.id === id)!) as Sheet['sides']
  } else {
    if (sides.length <= 2) return err('至少保留两个对比对象')
    if (!sides.some((s) => s.id === command.id)) return err('对象不存在')
    p.sheet.sides = sides.filter((s) => s.id !== command.id) as Sheet['sides']
    const owner = p.sheet.sides[0].id
    for (const c of content.cases) {
      delete c.entries[command.id]
      // Shared sections belong to the case, not the departing participant.
      for (const s of c.sections) {
        const cell = s.sharedCells?.[command.id]
        if (!cell) continue
        const target = s.sharedCells![owner]
        if (!target || !target.modules.length) s.sharedCells![owner] = cell
        else if (target.hidden === cell.hidden) target.modules.push(...cell.modules)
        else {
          target.modules = [
            ...target.modules.map((m) => ({ ...m, hidden: m.hidden || target.hidden })),
            ...cell.modules.map((m) => ({ ...m, hidden: m.hidden || cell.hidden })),
          ]
          target.hidden = false
        }
        delete s.sharedCells![command.id]
      }
    }
    for (const s of [...content.scenes, ...content.combinations]) delete s.samples[command.id]
    for (const s of content.scenes)
      s.steps = s.steps.filter((step) => step.participantId !== command.id)
  }
  return ok(projectSelection(p))
}
