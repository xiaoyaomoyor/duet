import type { ComparisonCase, ComparisonContent, Sample } from '@/types/presentation'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { getModule } from '@/modules/registry'

export function copySample(source: Sample, blank = false): Sample {
  const sample = deepClone(source)
  sample.id = uuid()
  sample.title = blank ? '新作品' : `${source.title} 副本`
  sample.hidden = false
  if (blank) sample.conditions = ''
  delete sample.lyricsNeedReview
  for (const cell of Object.values(sample.contentBySection))
    for (const m of cell.modules) {
      m.id = uuid()
      if (blank) m.data = getModule(m.type)?.schema.create() ?? {}
    }
  return sample
}

export function addCase(content: ComparisonContent, source: ComparisonCase): ComparisonCase {
  const item = deepClone(source)
  item.id = uuid()
  item.title = '新测试题'
  item.conditions = ''
  const sectionIds = new Map(item.sections.map((s) => [s.id, uuid()]))
  for (const section of item.sections) {
    section.id = sectionIds.get(section.id)!
    for (const cell of Object.values(section.sharedCells ?? {}))
      for (const m of cell.modules) {
        m.id = uuid()
        m.data = getModule(m.type)?.schema.create() ?? {}
      }
  }
  for (const entry of Object.values(item.entries)) {
    const sourceSample = entry.samples[0]
    const sample = sourceSample
      ? copySample(sourceSample, true)
      : { id: uuid(), title: '新作品', conditions: '', hidden: false, contentBySection: {} }
    sample.contentBySection = Object.fromEntries(
      Object.entries(sample.contentBySection).map(([s, cell]) => [sectionIds.get(s)!, cell]),
    )
    entry.samples = [sample]
    entry.defaultSampleId = sample.id
  }
  content.cases.push(item)
  for (const scene of content.scenes.filter((s) => s.caseId === source.id))
    content.scenes.push({
      ...deepClone(scene),
      id: uuid(),
      caseId: item.id,
      sectionId: sectionIds.get(scene.sectionId)!,
      samples: {},
      steps: [],
    })
  return item
}

/** Explicitly remove references; caller offers this as a named, undoable action. */
export function deleteSample(
  content: ComparisonContent,
  caseId: string,
  participantId: string,
  sampleId: string,
): void {
  const entry = content.cases.find((c) => c.id === caseId)?.entries[participantId]
  if (!entry) return
  entry.samples = entry.samples.filter((s) => s.id !== sampleId)
  if (entry.defaultSampleId === sampleId) entry.defaultSampleId = null
  for (const s of [...content.scenes, ...content.combinations].filter((s) => s.caseId === caseId))
    if (s.samples[participantId] === sampleId) s.samples[participantId] = null
  for (const s of content.scenes)
    s.steps = s.steps.filter((step) => step.kind !== 'sample' || step.sampleId !== sampleId)
}
