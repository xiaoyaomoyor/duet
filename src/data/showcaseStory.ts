import type { StageStory } from '@/components/stage/types'

export type ShowcaseFixture = 'normal' | 'empty' | 'long'
export function createShowcaseStory(
  t: (key: string) => string,
  fixture: ShowcaseFixture,
): StageStory {
  const label = (key: string): string => t(`showcase.${key}`)
  const base = import.meta.env.BASE_URL
  const empty = fixture === 'empty'
  const long = fixture === 'long'
  return {
    title: label('briefTitle'),
    subtitle: label('example'),
    prompt: label('prompt') + (long ? `\n\n${label('longPrompt')}` : ''),
    participants: [
      {
        id: 'sonora-demo',
        label: 'A',
        name: long ? label('longTool') : label('toolA'),
        version: label('versionA'),
        tone: 'a',
        ...(!empty ? { artwork: `${base}showcase/amber.svg`, source: 'demo:a' } : {}),
        track: long ? label('longTrack') : label('trackA'),
        description: label('descriptionA'),
      },
      {
        id: 'auralis-demo',
        label: 'B',
        name: label('toolB'),
        version: label('versionB'),
        tone: 'b',
        ...(!empty ? { artwork: `${base}showcase/tide.svg`, source: 'demo:b' } : {}),
        track: label('trackB'),
        description: label('descriptionB'),
      },
    ],
    observations: [1, 2, 3].map((n) => ({
      title: label(`observation${n}`),
      text: label(`observation${n}Text`),
    })),
    metrics: [
      {
        id: 'atmosphere',
        label: label('metric1'),
        unit: '/ 10',
        values: {
          'sonora-demo': { value: '8.4', note: label('note1a') },
          'auralis-demo': { value: '8.7', note: label('note1b') },
        },
      },
      {
        id: 'structure',
        label: label('metric2'),
        unit: '/ 10',
        values: {
          'sonora-demo': { value: '8.6', note: label('note2a') },
          'auralis-demo': { value: '8.2', note: label('note2b') },
        },
      },
      {
        id: 'detail',
        label: label('metric3'),
        unit: '/ 10',
        values: {
          'sonora-demo': { value: '8.2', note: label('note3a') },
          'auralis-demo': { value: '8.5', note: label('note3b') },
        },
      },
      {
        id: 'use',
        label: label('metric4'),
        values: {
          'sonora-demo': { value: label('useA'), note: label('note4a') },
          'auralis-demo': { value: label('useB'), note: label('note4b') },
        },
      },
    ],
    conclusion: label('conclusionLine'),
  }
}
