import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { studioFixture, importFixture } from './fixtures/studio'
import type { Project } from '../src/types/project'
import type { ComparisonCase } from '../src/types/presentation'

function fixture(): Project {
  const p = studioFixture()
  p.schemaVersion = 9
  p.sheet.sides[0].anonymizeName = true
  p.sheet.sides[0].toolRef = { kind: 'inline', name: 'PRIVATE-ALPHA' }
  const c: ComparisonCase = {
    id: 'case-one',
    title: '雨后街角',
    conditions: '同一提示词 · 无后期处理',
    sections: p.sheet.rows.map(({ cells, ...r }) => ({
      ...r,
      ...(r.kind === 'full' ? { sharedCells: structuredClone(cells) } : {}),
    })),
    entries: {},
  }
  for (const pId of ['a', 'b'])
    c.entries[pId] = {
      defaultSampleId: `${pId}-one`,
      samples: [
        {
          id: `${pId}-one`,
          title: pId === 'a' ? 'Amber / 初版' : 'Tide / 初版',
          conditions: '',
          hidden: false,
          contentBySection: Object.fromEntries(
            p.sheet.rows
              .filter((r) => r.kind === 'paired')
              .map((r) => [r.id, structuredClone(r.cells[pId]!)]),
          ),
        },
      ],
    }
  const alternate = structuredClone(c.entries.a!.samples[0]!)
  alternate.id = 'a-two'
  alternate.title = 'Amber / 第二次生成'
  for (const cell of Object.values(alternate.contentBySection))
    for (const m of cell.modules) m.id += '-two'
  alternate.contentBySection.listen!.modules[0]!.data = {
    ...(alternate.contentBySection.listen!.modules[0]!.data as object),
    name: 'Second take.wav',
  }
  alternate.contentBySection.notes!.modules[0]!.data = { text: '第二次生成的观察：人声更克制。' }
  c.entries.a!.samples.push(alternate)
  const other = structuredClone(c)
  other.id = 'case-two'
  other.title = '深夜电台'
  for (const s of other.sections) {
    s.id += '-night'
    for (const cell of Object.values(s.sharedCells ?? {}))
      for (const m of cell.modules) m.id += '-night'
  }
  for (const entry of Object.values(other.entries)) {
    for (const sample of entry.samples) {
      sample.id += '-night'
      sample.contentBySection = Object.fromEntries(
        Object.entries(sample.contentBySection).map(([id, cell]) => {
          for (const m of cell.modules) m.id += '-night'
          return [id + '-night', cell]
        }),
      )
    }
    entry.defaultSampleId = entry.samples[0]?.id ?? null
  }
  other.entries.b = { defaultSampleId: null, samples: [] }
  p.comparison = {
    cases: [c, other],
    combinations: [],
    scenes: [
      {
        id: 'listen-scene',
        caseId: c.id,
        sectionId: 'listen',
        title: '第一轮 · 盲听',
        hidden: false,
        samples: {},
        steps: [
          { id: 'focus-a', kind: 'focus', participantId: 'a' },
          { id: 'take-two', kind: 'sample', participantId: 'a', sampleId: 'a-two' },
          { id: 'reveal-b', kind: 'reveal', participantId: 'b' },
          { id: 'identity-a', kind: 'identity', participantId: 'a' },
        ],
      },
      {
        id: 'notes-scene',
        caseId: c.id,
        sectionId: 'notes',
        title: '观察记录',
        hidden: false,
        samples: {},
        steps: [],
      },
      {
        id: 'night-scene',
        caseId: other.id,
        sectionId: 'listen-night',
        title: '第二题 · 试听',
        hidden: false,
        samples: {},
        steps: [],
      },
    ],
  }
  return p
}

test('R3 sample/case switches are atomic, stop audio and preserve independent choices', async ({
  page,
}) => {
  await importFixture(page, fixture())
  await page
    .locator('.studio__outline button')
    .filter({ hasText: /盲听|第二题 · 试听/ })
    .click()
  const old = page.locator('audio[data-track-id*="a-one:"]').first()
  await old.evaluate((a: HTMLAudioElement) => a.play())
  await expect.poll(() => old.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0)
  await page.getByLabel('A 作品', { exact: true }).selectOption('a-two')
  await expect(page.locator('.project-scene:visible')).toContainText('Second take')
  await expect(page.locator('audio[data-track-id*="a-one:"]')).toHaveCount(0)
  expect(
    await page
      .locator('audio')
      .evaluateAll((nodes) => nodes.every((a) => (a as HTMLAudioElement).paused)),
  ).toBe(true)
  await page.locator('.studio__outline button').filter({ hasText: '观察记录' }).click()
  await expect(page.locator('.project-scene:visible')).toContainText('第二次生成的观察')
  await expect(page.locator('.project-scene:visible')).toContainText('声场更宽')
  await page.locator('.studio__selection select').first().selectOption('case-two')
  await page
    .locator('.studio__outline button')
    .filter({ hasText: /盲听|第二题 · 试听/ })
    .click()
  await expect(page.locator('.project-scene:visible')).toContainText('本题未提供样本')
  await expect(page.locator('audio[data-track-id*=":b:"]')).toHaveCount(0)
  await page.locator('.studio__selection select').first().selectOption('case-one')
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveValue('a-one')
})

test('R3 next/back/restart rebuild steps without changing project content', async ({ page }) => {
  await importFixture(page, fixture())
  await page
    .locator('.studio__outline button')
    .filter({ hasText: /盲听|第二题 · 试听/ })
    .click()
  await page.getByRole('button', { name: '开始演示' }).click()
  await page.locator('.stage-frame__brand:visible').click()
  const b = page.locator('.project-scene:visible [data-side-id=b]')
  await expect(b).toHaveCSS('visibility', 'hidden')
  await page.keyboard.press('ArrowRight')
  await expect(b).toHaveClass(/dim/)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveValue('a-two')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveValue('a-one')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(b).toHaveCSS('visibility', 'visible')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.project-scene:visible')).toContainText('PRIVATE-ALPHA')
  await page.keyboard.press('Home')
  await expect(page.locator('.project-scene:visible')).not.toContainText('PRIVATE-ALPHA')
  await page.keyboard.press('?')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.studio__paging')).toContainText('0 / 4 步')
  await page.keyboard.press('Escape')
  await expect(page.locator('.studio__help')).toHaveCount(0)
  await page.keyboard.press('End')
  await expect(page.locator('.project-scene:visible')).toContainText('本题未提供样本')
  await page.getByRole('button', { name: '重新开始', exact: true }).click()
  await expect(page.locator('.studio__paging')).toContainText('0 / 4 步')
  await page.getByRole('button', { name: '返回编辑', exact: true }).click()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('R3 collection editing, undo, saved combination and reload preserve inactive samples', async ({
  page,
}) => {
  await importFixture(page, fixture())
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '作品库' })
  await panel.getByRole('button', { name: 'Amber / 第二次生成 作品', exact: true }).click()
  await panel.getByLabel('作品名称', { exact: true }).fill('第二次生成 · 编辑后')
  await panel.getByLabel('作品名称', { exact: true }).press('Tab')
  await panel.getByRole('button', { name: '保存当前对比组合' }).click()
  await panel.getByRole('button', { name: '删除作品…', exact: true }).click()
  await panel.getByRole('button', { name: '删除作品并移除引用' }).click()
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await panel.getByRole('button', { name: '组合 1', exact: true }).click()
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveValue('a-two')
  await panel.getByRole('button', { name: '设为默认', exact: true }).click()
  await expect(page.locator('.studio__project')).toContainText('已保存')
  await page.reload()
  await expect(page.getByLabel('A 作品', { exact: true })).toHaveValue('a-two')
  await expect(page.getByLabel('A 作品', { exact: true })).toContainText('第二次生成 · 编辑后')
})

test('R3 exported player works offline with sample selection and no anonymous identity payload', async ({
  page,
  context,
}, info) => {
  await importFixture(page, fixture())
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /只读网页/ })
    .click()
  const file = info.outputPath('presentation.html')
  await (await download).saveAs(file)
  const html = await readFile(file, 'utf8')
  expect(html).not.toContain('PRIVATE-ALPHA')
  expect(html.match(/data:audio\/wav;base64/g)).toHaveLength(1)
  expect(html).not.toContain('PRIVATE-NOTE')
  const offline = await context.newPage()
  await context.setOffline(true)
  const errors: string[] = []
  offline.on('pageerror', (e) => errors.push(e.message))
  await offline.goto(pathToFileURL(file).href)
  await expect(offline.locator('[data-export-frame]:visible')).toHaveCount(1)
  await offline.getByLabel('A 作品', { exact: true }).selectOption('a-two')
  await expect(offline.locator('[data-export-frame]:visible')).toContainText('Second take')
  await offline
    .locator('[data-export-frame]:visible audio')
    .first()
    .evaluate((a: HTMLAudioElement) => a.play())
  await expect
    .poll(() =>
      offline
        .locator('[data-export-frame]:visible audio')
        .first()
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0)
  await offline.getByRole('button', { name: '下一步', exact: true }).click()
  expect(
    await offline
      .locator('audio')
      .evaluateAll((nodes) => nodes.every((a) => (a as HTMLAudioElement).paused)),
  ).toBe(true)
  await offline.getByRole('button', { name: '重新开始', exact: true }).click()
  await expect(offline.getByLabel('A 作品', { exact: true })).toHaveValue('a-one')
  expect(errors).toEqual([])
})

test('R3 batch image import, case removal undo and scene editing retain usable references', async ({
  page,
}) => {
  await importFixture(page, fixture())
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '作品库' })
  await panel.locator('input[type=file]').setInputFiles([
    {
      name: 'portrait.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#d9bd91"/></svg>',
      ),
    },
    {
      name: 'landscape.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#9bc6bc"/></svg>',
      ),
    },
  ])
  await panel.getByRole('button', { name: 'portrait 作品', exact: true }).click()
  await expect(panel.locator('.sample-artwork img')).toHaveCount(2)
  await panel.getByRole('button', { name: '新建测试题', exact: true }).click()
  await expect(page.locator('.studio__selection select').first()).toContainText('新测试题')
  await panel.getByRole('button', { name: '删除本题…', exact: true }).click()
  await panel.getByRole('button', { name: '删除测试题及引用', exact: true }).click()
  await expect(page.locator('.studio__selection select').first()).not.toContainText('新测试题')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.studio__selection select').first()).toContainText('新测试题')
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.studio__selection select').first().selectOption('case-one')
  await page.locator('.studio__outline button').filter({ hasText: '第一轮 · 盲听' }).click()
  if (!(await page.locator('.studio__properties').isVisible()))
    await page.getByRole('button', { name: '内容与属性', exact: true }).click()
  await page.getByRole('button', { name: '复制场景', exact: true }).click()
  await page.getByLabel('场景标题', { exact: true }).fill('新讲法')
  await page.getByLabel('场景标题', { exact: true }).press('Tab')
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await panel.getByRole('button', { name: '当前页步骤', exact: true }).click()
  await panel.getByRole('button', { name: '＋当前作品', exact: true }).click()
  await expect(panel.locator('.collection__steps li')).toHaveCount(5)
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  await page.getByLabel('演示场景', { exact: true }).selectOption({ label: '2 · 新讲法' })
  await expect(page.locator('.project-scene:visible h1')).toHaveText('新讲法')
})

test('R3 migration snapshot remains downloadable in the original schema', async ({
  page,
}, info) => {
  await importFixture(page, studioFixture())
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载升级前的恢复工程（v8）', exact: true }).click()
  const file = info.outputPath('before-migration.duet')
  await (await download).saveAs(file)
  const envelope = JSON.parse(await readFile(file, 'utf8'))
  expect(envelope.schemaVersion).toBe(8)
  expect(envelope.projects[0].schemaVersion).toBe(8)
  expect(envelope.projects[0].comparison).toBeUndefined()
  expect(envelope.projects[0].sheet).toEqual(studioFixture().sheet)
})
