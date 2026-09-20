import type { Cell, Row, Sheet } from './project'
import type { AppearancePatch } from './appearance'

/** Participant identities live in sheet.sides; sheet.rows is the compatibility projection. */
export interface Sample {
  id: string
  title: string
  hidden: boolean
  conditions: string
  contentBySection: Record<string, Cell>
  lyricsNeedReview?: boolean
}
export interface ComparisonCase {
  id: string
  title: string
  conditions: string
  sections: Array<Omit<Row, 'cells'> & { sharedCells?: Record<string, Cell> }>
  entries: Record<string, { defaultSampleId: string | null; samples: Sample[] }>
}
export type PresentationStep =
  | { id: string; kind: 'reveal'; participantId: string }
  | { id: string; kind: 'focus'; participantId: string }
  | { id: string; kind: 'sample'; participantId: string; sampleId: string }
  | { id: string; kind: 'identity'; participantId: string }
export type SceneLayout = 'general' | 'listening'
export interface PresentationScene {
  layout?: SceneLayout
  appearance?: AppearancePatch
  id: string
  title: string
  caseId: string
  sectionId: string
  hidden: boolean
  samples: Record<string, string | null>
  steps: PresentationStep[]
}
export interface ComparisonCombination {
  id: string
  title: string
  caseId: string
  samples: Record<string, string | null>
}
export interface ComparisonContent {
  cases: ComparisonCase[]
  scenes: PresentationScene[]
  combinations: ComparisonCombination[]
}
export interface ContentSelection {
  caseId: string
  samples: Record<string, string | null>
}
export interface PresentationRuntime extends ContentSelection {
  sceneId: string
  stepIndex: number
  focusIds: string[]
  revealedIdentities: string[]
  concealedIds: string[]
  transportState: 'paused' | 'playing'
}
export interface MigrationSnapshot {
  workspace?: 'modern' | 'legacy'
  appearance?: AppearancePatch
  schemaVersion: number
  sheet: Sheet
  comparison?: ComparisonContent
}

export type ComparisonView = 'overview' | 'pair' | 'single'
