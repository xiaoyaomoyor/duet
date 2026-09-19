import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { Project, ModuleInstance, Row } from '../src/types/project'

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
test('R2 create, edit, undo, theme persistence and compatibility view', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByRole('button', { name: /音乐评测/ }).click()
  const editor = page.locator('.studio__properties textarea')
  await editor.fill('新的共同命题')
  await expect(page.locator('.project-scene:visible')).toContainText('新的共同命题')
  await page.locator('.studio__bar button[aria-label="撤销"]').click()
  await expect(editor).toHaveValue('')
  await page.locator('.studio__bar button[aria-label="重做"]').click()
  await expect(editor).toHaveValue('新的共同命题')
  await page.getByLabel('项目风格').selectOption('paper')
  await expect(page.locator('[data-present-root]')).toHaveAttribute('data-design-theme', 'paper')
  await expect(page.locator('.studio__project small')).toHaveText('已保存')
  await page.reload()
  await expect(page.locator('[data-present-root]')).toHaveAttribute('data-design-theme', 'paper')
  await page.getByRole('button', { name: '兼容画布', exact: true }).click()
  await expect(page.locator('.canvas')).toBeVisible()
  await page.getByRole('button', { name: '回到舞台' }).click()
  await expect(page.locator('.studio')).toBeVisible()
})
test('R2 playback is exclusive, stable across presentation, stopped on navigation; keyboard skips empty/hidden scenes', async ({
  page,
}) => {
  await importFixture(page)
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  const a = page.locator('audio').nth(0),
    b = page.locator('audio').nth(1)
  await a.evaluate((el) => {
    el.dataset.testStable = 'same'
  })
  await page.getByRole('button', { name: '播放 Amber after rain' }).click()
  await expect.poll(() => a.evaluate((el) => el.paused)).toBe(false)
  await page.getByRole('button', { name: '播放 A quieter tide' }).click()
  await expect.poll(() => a.evaluate((el) => el.paused)).toBe(true)
  await expect.poll(() => b.evaluate((el) => el.paused)).toBe(false)
  await page.getByRole('button', { name: '开始演示' }).click()
  await expect(a).toHaveAttribute('data-test-stable', 'same')
  await expect.poll(() => b.evaluate((el) => el.paused)).toBe(true)
  await page.locator('.stage-frame__title:visible').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.project-scene:visible')).toHaveAttribute('data-scene-id', 'notes')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.stage-table:visible')).toContainText('48 s')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.project-scene:visible')).toHaveAttribute(
    'data-scene-id',
    'conclusion',
  )
  await expect(page.locator('.studio__properties')).toHaveCount(0)
  await page.getByRole('button', { name: '干净画面', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.studio')).not.toHaveClass(/studio--clean/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.studio')).not.toHaveClass(/studio--present/)
})
test('R2 HTML exports the entire report and plays offline; project file round-trip preserves stage theme', async ({
  page,
  context,
}, info) => {
  await importFixture(page)
  await page.getByLabel('项目风格').selectOption('paper')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  let downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /只读网页/ })
    .click()
  const htmlFile = info.outputPath('report.html')
  await (await downloading).saveAs(htmlFile)
  const html = await readFile(htmlFile, 'utf8')
  expect(html).not.toContain('PRIVATE-NOTE')
  expect(html).not.toContain('未填写区段')
  const offline = await context.newPage()
  await context.setOffline(true)
  await offline.goto(pathToFileURL(htmlFile).href)
  await expect(offline.locator('.project-scene')).toHaveCount(5)
  await expect(offline.locator('[data-present-root]')).toHaveAttribute('data-design-theme', 'paper')
  await offline
    .locator('audio')
    .first()
    .evaluate((el) => el.play())
  await expect
    .poll(() =>
      offline
        .locator('audio')
        .first()
        .evaluate((el) => el.currentTime),
    )
    .toBeGreaterThan(0)
  await offline.close()
  await context.setOffline(false)
  downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /工程文件/ })
    .click()
  const file = info.outputPath('review.duet')
  await (await downloading).saveAs(file)
  expect(JSON.parse(await readFile(file, 'utf8')).projects[0].sheet.layout.presentation).toEqual({
    enabled: true,
    theme: 'paper',
  })
  const fresh = await context.browser()!.newContext()
  const imported = await fresh.newPage()
  await imported.goto(new URL('/', page.url()).href)
  await imported.locator('.gallery input[type=file]').setInputFiles(file)
  await expect(imported.locator('[data-present-root]')).toHaveAttribute(
    'data-design-theme',
    'paper',
  )
  await fresh.close()
})
test('R2 stage upgrade duplicates the legacy project and leaves its original layout intact', async ({
  page,
}) => {
  await importFixture(page, studioFixture(false))
  const original = page.url()
  await page.getByRole('button', { name: '另存舞台副本' }).click()
  await expect(page.locator('.studio')).toBeVisible()
  expect(page.url()).not.toBe(original)
  await page.goto(original)
  await expect(page.locator('.canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: '另存舞台副本' })).toBeVisible()
})

test('R2 PNG respects scene/report scope and restores reading view after exporting', async ({
  page,
}, info) => {
  await importFixture(page)
  await page.getByRole('button', { name: '阅读报告', exact: true }).click()
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('导出完整阅读报告').uncheck()
  let downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /长图/ }).click()
  const one = info.outputPath('scene.png')
  await (await downloading).saveAs(one)
  const scene = await readFile(one)
  expect(scene.subarray(1, 4).toString()).toBe('PNG')
  const edges = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const inkIn = (x: number, y: number, w: number, h: number) => {
      const pixels = ctx.getImageData(
        Math.floor(x * image.width),
        Math.floor(y * image.height),
        Math.floor(w * image.width),
        Math.floor(h * image.height),
      ).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! > 70 && pixels[i + 1]! > 70 && pixels[i + 2]! > 70) count++
      return count
    }
    return {
      left: inkIn(0.025, 0.025, 0.11, 0.08),
      right: inkIn(0.9, 0.94, 0.085, 0.05),
      corner: [...ctx.getImageData(1, 1, 1, 1).data],
    }
  }, scene.toString('base64'))
  expect(edges.corner).toEqual([16, 20, 20, 255])
  expect(edges.left).toBeGreaterThan(20)
  expect(edges.right).toBeGreaterThan(10)
  expect(scene.readUInt32BE(16) / scene.readUInt32BE(20)).toBeCloseTo(16 / 9, 1)
  await dialog.getByLabel('导出完整阅读报告').check()
  downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /长图/ }).click()
  const all = info.outputPath('report.png')
  await (await downloading).saveAs(all)
  const report = await readFile(all)
  expect(report.readUInt32BE(20)).toBeGreaterThan(report.readUInt32BE(16) * 2)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.locator('.studio__canvas')).toHaveClass(/reading/)
  await expect(page.locator('.studio')).not.toHaveClass(/studio--present/)
})

test('R2 images keep their full aspect; long text expands and remains readable on mobile', async ({
  page,
}, info) => {
  const p = studioFixture()
  const image =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#d9bd91"/></svg>',
    ).toString('base64')
  for (const cell of Object.values(p.sheet.rows[2]!.cells)) {
    const m = cell.modules[0]!
    m.type = 'image'
    m.data = { sourceUrl: image, name: '竖幅作品' }
    m.props = { fit: 'contain', ratio: '16/9' }
  }
  p.sheet.rows[3]!.cells.a!.modules[0]!.data = {
    text: Array.from(
      { length: 40 },
      (_, n) => `第 ${n + 1} 行：长内容应完整显示，不挤成小字。`,
    ).join('\n'),
  }
  await importFixture(page, p)
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  await expect(page.locator('.project-scene:visible img').first()).toHaveCSS(
    'object-fit',
    'contain',
  )
  await page.locator('.studio__outline button').filter({ hasText: '观察记录' }).click()
  await expect(page.locator('.project-scene:visible .stage-frame')).toHaveClass(/reading/)
  const last = page.locator('.project-scene:visible .text')
  await expect(last.first()).toContainText('第 40 行')
  await page.getByRole('button', { name: '开始演示' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.locator('[data-present-root]').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1)
  await expect(last.first()).toHaveCSS('font-size', '16px')
  await page.screenshot({ path: info.outputPath('mobile-reading.png'), fullPage: true })
})
