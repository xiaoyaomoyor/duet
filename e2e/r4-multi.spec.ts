import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { multiFixture } from './fixtures/multi'
import { importFixture } from './fixtures/studio'

test('R4 six-way overview, pinned comparison and single view keep sample choices and stop departed media', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await importFixture(page, multiFixture())
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  await expect(page.locator('.project-scene__participant:visible')).toHaveCount(6)
  await expect(page.locator('[data-present-root] audio')).toHaveCount(6)
  await page.getByLabel('F 作品', { exact: true }).selectOption('f-two')
  await page.getByRole('button', { name: '播放 Alternate F', exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('[data-present-root] audio')
        .evaluateAll((els) => els.filter((e) => !e.paused).length),
    )
    .toBe(1)
  await page.getByLabel('固定参照', { exact: true }).selectOption('a')
  await page.locator('[data-present-root]').evaluate(async (root) => {
    const audio = root.querySelector('audio')!
    const video = document.createElement('video')
    video.src = audio.src
    video.hidden = true
    root.append(video)
    await video.play()
    if ([...root.querySelectorAll('audio')].some((a) => !a.paused))
      throw new Error('视频与音频串音')
    video.pause()
    video.remove()
  })
  await page.getByRole('button', { name: '查看 F 详情' }).click()
  await expect(page.locator('.project-scene__participant:visible')).toHaveCount(2)
  await expect(page.locator('[data-present-root] audio')).toHaveCount(2)
  await expect
    .poll(() =>
      page.locator('[data-present-root] audio').evaluateAll((els) => els.every((e) => e.paused)),
    )
    .toBe(true)
  await expect(page.locator('[data-side-id="f"]:visible')).toContainText('第二次生成')
  await page.getByRole('button', { name: '单项', exact: true }).click()
  await expect(page.locator('.project-scene__participant:visible')).toHaveCount(1)
  await page.getByRole('button', { name: '全体总览', exact: true }).click()
  await expect(page.locator('.project-scene__participant:visible')).toHaveCount(6)
  await expect(page.getByLabel('F 作品', { exact: true })).toHaveValue('f-two')
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  await page.locator('.stage-frame__title:visible').click()
  await page.keyboard.press('6')
  await page.keyboard.press('Enter')
  await expect(page.locator('.project-scene__participant:visible')).toHaveAttribute(
    'data-side-id',
    'f',
  )
})

test('R4 object management is undoable, keeps stable labels on reorder and persists six participants', async ({
  page,
}) => {
  await importFixture(page, multiFixture(3))
  await page.getByRole('button', { name: '作品与流程', exact: true }).click()
  await page.getByRole('button', { name: '对比对象', exact: true }).click()
  for (let n = 4; n <= 6; n++) {
    await page.getByLabel('新工具名称', { exact: true }).fill(`工具 ${n}`)
    await page.getByRole('button', { name: '添加对比对象', exact: true }).click()
  }
  const items = page.locator('.participants-manager__item')
  await expect(items).toHaveCount(6)
  await items.last().getByRole('button', { name: '上移', exact: true }).click()
  await expect(items.nth(4).locator('header strong')).toHaveText('F')
  await items.nth(4).getByRole('button', { name: '移除对象', exact: true }).click()
  await page.getByRole('button', { name: '确认移除及清理引用', exact: true }).click()
  await expect(items).toHaveCount(5)
  await page.locator('.studio__bar button[aria-label="撤销"]').click()
  await expect(items).toHaveCount(6)
  await expect(items.nth(4).locator('header strong')).toHaveText('F')
  await expect(page.locator('.studio__project small')).toHaveText('已保存')
  await page.reload()
  await page.getByRole('button', { name: '作品与流程', exact: true }).click()
  await page.getByRole('button', { name: '对比对象', exact: true }).click()
  await expect(page.locator('.participants-manager__item')).toHaveCount(6)
})

test('R4 compact data groups repeat the fixed reference and can return to every participant', async ({
  page,
}) => {
  await importFixture(page, multiFixture())
  await page.getByLabel('固定参照', { exact: true }).selectOption('a')
  await page.locator('.studio__outline button').filter({ hasText: '维度比较' }).click()
  await expect(page.locator('.stage-table-pages')).toBeVisible()
  await expect(page.locator('.stage-table thead [data-compare-id="a"]')).toBeVisible()
  await page.getByRole('button', { name: '下一组', exact: true }).click()
  await expect(page.locator('.stage-table thead [data-compare-id="a"]')).toBeVisible()
  await expect(page.locator('.stage-table-pages')).toContainText('2 /')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  await expect(page.locator('.stage-table thead th')).toHaveCount(7)
})

test('R4 six-way offline export composes independent samples, metrics and viewing modes', async ({
  page,
  context,
}, info) => {
  await importFixture(page, multiFixture())
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /只读网页/ })
    .click()
  const file = info.outputPath('r4.html')
  await (await download).saveAs(file)
  const html = await readFile(file, 'utf8')
  expect(html).not.toContain('PRIVATE-NOTE')
  expect(html.match(/data:audio\/wav;base64/g)).toHaveLength(1)
  const offline = await context.newPage()
  await offline.goto(pathToFileURL(file).href)
  await expect(offline.locator('[data-export-frame]:visible')).toHaveCount(1)
  await offline.getByLabel('C 作品', { exact: true }).selectOption('c-two')
  await offline.getByLabel('F 作品', { exact: true }).selectOption('f-two')
  await expect(offline.locator('[data-compare-id="c"]:visible')).toContainText('第二次生成')
  await expect(offline.locator('[data-compare-id="f"]:visible')).toContainText('第二次生成')
  await offline.getByLabel('固定参照', { exact: true }).selectOption('a')
  await offline.getByLabel('当前对象', { exact: true }).selectOption('f')
  await offline.getByLabel('观看方式', { exact: true }).selectOption('pair')
  await expect(offline.locator('.project-scene__participant:visible')).toHaveCount(2)
  await offline.locator('[data-compare-id="f"] audio').evaluate(async (e) => e.play())
  await expect
    .poll(() => offline.locator('[data-compare-id="f"] audio').evaluate((e) => e.paused))
    .toBe(false)
  await offline.getByRole('button', { name: '下一步', exact: true }).click()
  await offline.getByLabel('演示场景', { exact: true }).selectOption('2')
  await offline.getByLabel('F 作品', { exact: true }).selectOption('f-two')
  await expect(offline.locator('.stage-table')).toContainText('证据 F')
  await offline.getByLabel('观看方式', { exact: true }).selectOption('overview')
  await expect(offline.locator('.stage-table thead th:visible')).toHaveCount(7)
})

for (const count of [3, 4, 5, 6])
  test('R4 ' + count + ' participants fit the theatre at 1080p and 720p', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await importFixture(page, multiFixture(count))
    await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    await page.getByRole('button', { name: '干净画面', exact: true }).click()
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height })
      await expect
        .poll(() => page.locator('[data-present-root]').evaluate((el) => el.clientHeight))
        .toBe(height)
      const boxes = await page.locator('.project-scene__participant:visible').evaluateAll((nodes) =>
        nodes.map((el) => {
          const r = el.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }
        }),
      )
      expect(boxes).toHaveLength(count)
      expect(boxes.every((b) => b.bottom <= height && b.left >= 0 && b.right <= width)).toBe(true)
      expect(
        Math.max(...boxes.map((b) => b.width)) - Math.min(...boxes.map((b) => b.width)),
      ).toBeLessThan(2)
      if (count === 5)
        expect(Math.abs((boxes[3].left + boxes[4].right) / 2 - width / 2)).toBeLessThan(2)
    }
  })

test('R4 image overview retains contain fit and single image viewing on mobile', async ({
  page,
}) => {
  const p = multiFixture(),
    svg = await readFile('public/showcase/amber.svg')
  for (const entry of Object.values(p.comparison!.cases[0]!.entries))
    for (const sample of entry.samples) {
      const m = sample.contentBySection.listen!.modules[0]!
      m.type = 'image'
      m.data = {
        sourceUrl: 'data:image/svg+xml;base64,' + svg.toString('base64'),
        name: '横幅原图',
      }
      m.props = { fit: 'contain', ratio: 'auto' }
    }
  await importFixture(page, p)
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  await expect(page.locator('[data-present-root] .image img')).toHaveCount(6)
  await expect(page.locator('[data-present-root] .image img').first()).toHaveCSS(
    'object-fit',
    'contain',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '查看 F 详情' }).click()
  await expect(page.locator('.project-scene__participant:visible')).toHaveCount(1)
  await expect(page.locator('[data-present-root] .image img')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
