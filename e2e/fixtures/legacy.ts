import { randomUUID } from 'node:crypto'
import type { Project } from '../../src/types/project'

/** Frozen v8 template shapes, independent of today's creation defaults. */
export function legacyTemplate(name: string | RegExp): Project {
  const label = String(name)
  const kind = label.includes('音乐')
    ? 'music'
    : label.includes('图片')
      ? 'image'
      : label.includes('视频')
        ? 'video'
        : 'blank'
  const types = {
    music: ['image', 'audio', 'lyrics', 'progress'],
    image: ['image', 'image', 'keyValue'],
    video: ['image', 'video', 'keyValue'],
    blank: ['text'],
  }[kind]
  const titles: Record<string, string> = {
    title: '标题',
    image: '图片',
    audio: '音频',
    lyrics: '歌词',
    progress: '进度条',
    video: '视频',
    keyValue: '参数表',
    text: '文字',
  }
  const a = randomUUID(),
    b = randomUUID()
  return {
    id: randomUUID(),
    schemaVersion: 8,
    title: { music: '音乐对比', image: '图片对比', video: '视频对比', blank: '空白对比' }[kind],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
    pinned: false,
    ui: { mode: 'edit', toolbarCollapsed: false, sidebarCollapsed: false, zoom: 1 },
    sheet: {
      id: randomUUID(),
      sides: [
        {
          id: a,
          toolRef: { kind: 'inline', name: '工具 A' },
          accent: '#a78bfa',
          accentPreset: 'violet',
        },
        {
          id: b,
          toolRef: { kind: 'inline', name: '工具 B' },
          accent: '#22d3ee',
          accentPreset: 'cyan',
        },
      ],
      layout: { gutter: 32, showAxis: true, background: 'solid', maxWidth: 1440 },
      rows: ['title', ...types].map((type) => ({
        id: randomUUID(),
        kind: 'paired',
        collapsed: false,
        cells: Object.fromEntries(
          [a, b].map((id) => [
            id,
            {
              hidden: false,
              modules: [
                {
                  id: randomUUID(),
                  type,
                  title: titles[type]!,
                  hidden: false,
                  data: {},
                  props:
                    type === 'image'
                      ? { fit: 'cover', ratio: '1/1' }
                      : type === 'audio'
                        ? { showWaveform: true }
                        : {},
                },
              ],
            },
          ]),
        ),
      })),
    },
  }
}
