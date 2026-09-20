import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { importFixture, studioFixture } from './fixtures/studio'
import { multiFixture } from './fixtures/multi'
import type { Project } from '../src/types/project'

async function savedProject(page: Page): Promise<Project> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('duet-db')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      return await new Promise<Project>((resolve, reject) => {
        const r = db.transaction('projects').objectStore('projects').getAll()
        r.onsuccess = () => resolve(r.result[0])
        r.onerror = () => reject(r.error)
      })
    } finally {
      db.close()
    }
  })
}
async function switchWorkspace(page: Page, workspace: 'modern' | 'legacy') {
  await page.getByTestId('stage-menu').click()
  await page.getByTestId(`workspace-${workspace}`).click()
  await expect(page.getByRole('dialog', { name: '切换工作区' })).toBeHidden()
}

for (const kind of ['music', 'image', 'video', 'generic', 'blank']) {
  test(`W1 ${kind} creation defaults to the new workspace and survives reload`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.getByTestId(`create-stage-${kind}`).click()
    await expect(page.locator('.studio')).toBeVisible()
    await expect(page.getByTestId('stage-menu')).toHaveText('新版工作区')
    expect((await savedProject(page)).workspace).toBe('modern')
    await page.reload()
    await expect(page.locator('.studio')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('W1 in-place switching retains edits, ID, appearance and history', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByTestId('create-stage-music').click()
  const editor = page.locator('.studio__properties textarea')
  await editor.fill('最后一次输入也要保存')
  await page.getByLabel('项目风格').selectOption('paper')
  await expect(page).toHaveURL(/#\/p\/[^/]+$/)
  const url = page.url()
  await switchWorkspace(page, 'legacy')
  await expect(page.locator('.canvas')).toBeVisible()
  expect(page.url()).toBe(url)
  await expect(page.locator('.canvas')).toContainText('最后一次输入也要保存')
  await page.reload()
  await expect(page.locator('.canvas')).toBeVisible()
  await switchWorkspace(page, 'modern')
  await expect(page.locator('.studio')).toBeVisible()
  await expect(page.locator('[data-project-stage]')).toHaveAttribute('data-design-theme', 'paper')
  await expect(editor).toHaveValue('最后一次输入也要保存')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.canvas')).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.studio')).toBeVisible()
  expect(page.url()).toBe(url)
})

test('W1 historical stages keep the old workspace; exported selection is restored on import', async ({
  page,
}, info) => {
  await importFixture(page, studioFixture(false))
  await expect(page.getByTestId('stage-menu')).toHaveText('旧版工作区')
  await expect(page).toHaveURL(/#\/p\/[^/]+$/)
  const url = page.url()
  await switchWorkspace(page, 'modern')
  expect(page.url()).toBe(url)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /工程文件/ })
    .click()
  const file = info.outputPath('stage.duet')
  await (await downloading).saveAs(file)
  const p = JSON.parse(await readFile(file, 'utf8')).projects[0]
  expect(p.workspace).toBe('modern')
  expect(p.sheet.layout.presentation).toBeUndefined()
  const context = await page.context().browser()!.newContext()
  const imported = await context.newPage()
  await imported.goto(new URL('/', page.url()).href)
  await imported.locator('.gallery input[type=file]').setInputFiles(file)
  await expect(imported.locator('.studio')).toBeVisible()
  await context.close()
})

test('W1 multi-party and multiple works explain why legacy is unavailable without changing data', async ({
  page,
}) => {
  await importFixture(page, multiFixture())
  const before = await savedProject(page)
  await page.getByTestId('stage-menu').click()
  await expect(page.getByTestId('workspace-legacy')).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('包含超过两个对比对象')
  await expect(page.getByRole('dialog')).toContainText('同一对象包含多份作品')
  await page.keyboard.press('Escape')
  expect((await savedProject(page)).comparison).toEqual(before.comparison)
  await expect(page.locator('.studio')).toBeVisible()
})

test('W1 samples share the application shell and design reference lives under About', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('create-stage-music').click()
  await expect(page).toHaveURL(/#\/p\/[^/]+$/)
  const url = page.url()
  await page.locator('.topbar').getByRole('link', { name: '样板间', exact: true }).click()
  await expect(page.locator('.topbar')).toBeVisible()
  await expect(page.getByRole('button', { name: '组件规范', exact: true })).toHaveCount(0)
  await expect(page.locator('.stage-frame')).toBeVisible()
  await page.getByRole('button', { name: '舞台列表', exact: true }).click()
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /音乐评测/ })
    .click()
  await expect(page).toHaveURL(url)
  await expect(page.locator('.studio')).toBeVisible()
  await page.goto('/#/settings/about')
  await page.getByRole('link', { name: '设计规范', exact: true }).click()
  await expect(page.locator('.specimen')).toBeVisible()
  await expect(page.getByText(/舞台外观定制请使用/)).toBeVisible()
})

test('W1 narrow home preserves usable content width and access to every template', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('create-stage-blank')).toBeVisible()
  expect(
    await page.locator('.shell__main').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(300)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  for (const card of await page.locator('.gallery-card').all())
    expect(await card.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(390)
  await page.getByTestId('create-stage-blank').click()
  await expect(page.locator('.studio')).toBeVisible()
  await page.getByTestId('stage-menu').click()
  await expect(page.getByTestId('workspace-legacy')).toBeVisible()
  expect(
    await page.getByRole('dialog').evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(390)
})

test('W1 v11 recovery export preserves previous appearance without the new workspace field', async ({
  page,
}, info) => {
  const p = studioFixture()
  p.schemaVersion = 11
  p.appearance = { theme: 'paper', palette: 'blue' }
  await importFixture(page, p)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /下载升级前的恢复工程/ }).click()
  const file = info.outputPath('recovery.duet')
  await (await downloading).saveAs(file)
  const restored = JSON.parse(await readFile(file, 'utf8'))
  expect(restored.schemaVersion).toBe(11)
  expect(restored.projects[0].workspace).toBeUndefined()
  expect(restored.projects[0].appearance).toEqual(p.appearance)
})
