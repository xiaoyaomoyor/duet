import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  addModule,
  addedCard,
  closeDialog,
  createFromTemplate,
  importMedia,
  moduleCard,
  openModuleEditor,
} from './helpers'

function wav(): Buffer {
  const size = 8000 * 6 * 2
  const header = Buffer.alloc(44)
  header.write('RIFF')
  header.writeUInt32LE(36 + size, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(16000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(size, 40)
  return Buffer.concat([header, Buffer.alloc(size)])
}
const sample = { name: 'R0-sample.wav', mimeType: 'audio/wav', buffer: wav() }

for (const layout of ['长条（封面在左）', '正方形（封面作背景）']) {
  test(`R0 音频：${layout}封面开关不影响播放，关闭播放条仍有效`, async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    const card = moduleCard(page, 1, 0)
    await importMedia(page, card, sample)
    for (const cover of [false, true]) {
      const dialog = await openModuleEditor(page, card)
      await dialog.getByRole('combobox', { name: /^布局/ }).selectOption({ label: layout })
      await dialog.getByLabel(/显示封面/).setChecked(cover)
      await closeDialog(page)
      await expect(card.getByRole('button', { name: '播放', exact: true })).toHaveCount(1)
      await card.getByRole('button', { name: '播放', exact: true }).click()
      await expect(card.locator('.audio')).toHaveClass(/audio--playing/)
      await card.getByRole('button', { name: '暂停', exact: true }).click()
      await expect(card.locator('.audio')).not.toHaveClass(/audio--playing/)
    }
    const dialog = await openModuleEditor(page, card)
    await dialog.getByLabel(/显示播放条/).uncheck()
    await closeDialog(page)
    await expect(card.getByRole('button', { name: '播放', exact: true })).toHaveCount(0)
    await expect(card.locator('.player')).toHaveCount(0)
  })
}

test('R0 弹窗：嵌套焦点循环、Escape 只关顶层、关闭后恢复入口', async ({ page }) => {
  await page.goto('/')
  await createFromTemplate(page, /音乐对比/)
  const card = moduleCard(page, 1, 0)
  const dialog = await openModuleEditor(page, card)
  await expect(dialog.locator('.dialog__title-input')).toBeFocused()
  const launcher = dialog.getByRole('button', { name: '从外链导入' }).first()
  await launcher.click()
  const prompt = page.locator('.prompt[role="dialog"]')
  await expect(prompt.locator('.prompt__input')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await prompt.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab')
  expect(await prompt.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await expect(page.locator('#app')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(prompt).toHaveCount(0)
  await expect(page.locator('.editor-dialog')).toBeVisible()
  await expect(launcher).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.editor-dialog')).toHaveCount(0)
  await expect(card.getByRole('button', { name: '编辑模块' })).toBeFocused()
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '')
})

test('R0 字段：评分输入有可访问标签和翻译后的提示', async ({ page }) => {
  await page.goto('/')
  await createFromTemplate(page, /空白对比/)
  await addModule(page, 0, '评分')
  const dialog = await openModuleEditor(page, addedCard(page))
  await expect(dialog.getByRole('textbox', { name: '维度名称' })).toHaveAttribute(
    'placeholder',
    '如「音质」「画面」',
  )
  await dialog.getByRole('spinbutton', { name: '分数', exact: true }).fill('8')
  await expect(dialog.getByRole('spinbutton', { name: '满分', exact: true })).toHaveValue('10')
})

for (const [theme, label] of [
  ['light', '亮'],
  ['dark', '暗'],
  ['violet-dark', '紫夜'],
]) {
  test(`R0 HTML：${theme} 文件离线重开保留双栏、匿名和音频播放`, async ({
    page,
    context,
  }, testInfo) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('radio', { name: label, exact: true }).click()
    await createFromTemplate(page, /音乐对比/)
    await importMedia(page, moduleCard(page, 1, 0), sample)
    const titleCard = page.locator('.canvas__row[data-has-title] .card').first()
    const dialog = await openModuleEditor(page, titleCard)
    const fields = dialog.locator('.section--fields input[type="text"]')
    await fields.nth(0).fill('PRIVATE-TOOL-R0')
    await fields.nth(1).fill('PRIVATE-VERSION-R0')
    await dialog.getByLabel('遮住工具名称', { exact: true }).check()
    await dialog.getByLabel('遮住版本号', { exact: true }).check()
    await dialog.getByLabel(/遮住 LOGO/).check()
    await closeDialog(page)
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: /只读网页/ })
      .click()
    const download = await downloading
    const file = testInfo.outputPath(`export-${theme}.html`)
    await download.saveAs(file)
    const html = await readFile(file, 'utf8')
    expect(html).not.toContain('PRIVATE-TOOL-R0')
    expect(html).not.toContain('PRIVATE-VERSION-R0')
    const exported = await context.newPage()
    await context.setOffline(true)
    await exported.goto(pathToFileURL(file).href)
    await expect(exported.locator('html')).toHaveAttribute('data-theme', theme!)
    await expect(exported.locator('.row__cells').first()).toHaveCSS('display', 'grid')
    await expect(exported.locator('[data-export-mask="text"]').first()).toBeVisible()
    const audio = exported.locator('audio').first()
    await expect(audio).toBeVisible()
    await expect(audio).toHaveAttribute('controls', '')
    await expect(audio).toHaveAttribute('src', /^data:audio/)
    await audio.evaluate(async (node: HTMLAudioElement) => {
      await node.play()
    })
    await expect
      .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
      .toBeGreaterThan(0)
    await audio.evaluate((node: HTMLAudioElement) => node.pause())
    await exported.screenshot({ path: testInfo.outputPath(`export-${theme}.png`), fullPage: true })
    await context.setOffline(false)
  })
}
