/** R1 纯展示契约。样板使用夹具，R2 通过适配器接入项目，避免绑定旧 sides 索引。 */
export type StageTheme = 'ink' | 'paper'
export type SceneKind = 'brief' | 'duet' | 'observation' | 'comparison' | 'conclusion'
export interface StageParticipant {
  id: string
  label: string
  name: string
  version: string
  tone: 'a' | 'b'
  artwork?: string
  track: string
  description: string
  source?: string
}
export interface StageMetric {
  id: string
  label: string
  unit?: string
  values: Record<string, { value: string; note: string }>
}
export interface StageStory {
  title: string
  subtitle: string
  prompt: string
  participants: StageParticipant[]
  metrics: StageMetric[]
  observations: Array<{ title: string; text: string }>
  conclusion: string
}
