import { expect, type Page } from '@playwright/test'
import type { Project, ModuleInstance, Row } from '../../src/types/project'

function wav() {
  const size = 8000 * 12 * 2,
    b = Buffer.alloc(44 + size)
  b.write('RIFF')
  b.writeUInt32LE(36 + size, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(8000, 24)
  b.writeUInt32LE(16000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(size, 40)
  return b
}
export function studioFixture(stage = true): Project {
  let n = 0
  const m = (type: string, data: unknown, props: Record<string, unknown> = {}): ModuleInstance => ({
    id: `m${++n}`,
    type,
    title: '',
    hidden: false,
    data,
    props,
  })
  const row = (id: string, label: string, a: ModuleInstance, b?: ModuleInstance): Row => ({
    id,
    label,
    kind: b ? 'paired' : 'full',
    collapsed: false,
    cells: { a: { hidden: false, modules: [a] }, b: { hidden: false, modules: b ? [b] : [] } },
  })
  const sound = `data:audio/wav;base64,${wav().toString('base64')}`
  return {
    id: 'r2-fixture',
    schemaVersion: 8,
    title: '同一道题，两种回声',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    pinned: false,
    ui: { mode: 'edit', toolbarCollapsed: false, sidebarCollapsed: false, zoom: 1 },
    sheet: {
      id: 'sheet',
      sides: [
        {
          id: 'a',
          toolRef: { kind: 'inline', name: 'Suno' },
          accent: '#d9bd91',
          modelVersion: 'v5',
          note: '细节与叙事',
        },
        {
          id: 'b',
          toolRef: { kind: 'inline', name: 'Udio' },
          accent: '#9bc6bc',
          modelVersion: 'v1.5',
          note: '空间与层次',
        },
      ],
      layout: {
        gutter: 32,
        showAxis: true,
        background: 'solid',
        maxWidth: 1440,
        ...(stage ? { presentation: { enabled: true, theme: 'ink' as const } } : {}),
      },
      rows: [
        row('identity', '对象资料', m('title', {}), m('title', {})),
        row(
          'prompt',
          '共同命题',
          m(
            'text',
            { text: '让城市慢下来。\n用一段温暖的旋律，记录雨后街角的光。', align: 'left' },
            { size: 'large' },
          ),
        ),
        row(
          'listen',
          '作品试听',
          m('audio', { name: 'Amber after rain.wav', sourceUrl: sound }),
          m('audio', { name: 'A quieter tide.wav', sourceUrl: sound }),
        ),
        row(
          'notes',
          '观察记录',
          m('text', { text: '人声靠近，细节清晰。\n旋律从克制的铺陈自然进入副歌。' }),
          m('text', { text: '声场更宽，层次逐渐展开。\n留白让情绪有了呼吸的空间。' }),
        ),
        row(
          'metrics',
          '维度比较',
          m('keyValue', {
            rows: [
              { key: '人声表现', value: '温暖 · 清晰' },
              { key: '编曲层次', value: '克制 · 紧凑' },
              { key: '生成耗时', value: '48 s' },
              { key: '重试次数', value: '0' },
            ],
          }),
          m('keyValue', {
            rows: [
              { key: '生成耗时', value: '62 s' },
              { key: '人声表现', value: '自然 · 松弛' },
              { key: '编曲层次', value: '丰富 · 舒展' },
              { key: '重试次数', value: '1' },
            ],
          }),
        ),
        row(
          'conclusion',
          '结论',
          m(
            'text',
            { text: '没有唯一的赢家。\n选择，取决于你想讲述的故事。', align: 'left' },
            { size: 'large' },
          ),
        ),
        row('empty', '未填写区段', m('text', {})),
        row('hidden', '私密观察', { ...m('text', { text: 'PRIVATE-NOTE' }), hidden: true }),
      ],
    },
  }
}
export async function importFixture(page: Page, project = studioFixture()) {
  await page.goto('/')
  await page.locator('.gallery input[type=file]').setInputFiles({
    name: 'review.duet',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        $format: 'duet-project',
        schemaVersion: 8,
        projects: [project],
        assets: [],
        tools: [],
        integrity: { missingAssets: [] },
      }),
    ),
  })
  await expect(
    page.locator(project.sheet.layout.presentation?.enabled ? '.studio' : '.canvas'),
  ).toBeVisible()
  await expect(page).toHaveURL(/#\/p\/[^/]+$/)
}
