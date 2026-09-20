import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function wave(frequency: number) {
  const rate = 16000,
    samples = rate * 12,
    buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF')
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let n = 0; n < samples; n++)
    buffer.writeInt16LE(
      Math.round(Math.sin((n * frequency * Math.PI * 2) / rate) * 1200),
      44 + n * 2,
    )
  return buffer
}
function cover(color: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#152b32"/></linearGradient></defs><path fill="url(#g)" d="M0 0h960v600H0z"/><circle cx="680" cy="170" r="90" fill="#f6e8c0" opacity=".8"/><path d="M0 420L240 190 470 440 760 300 960 470V600H0Z" fill="#213b3d"/><path d="M0 500L360 410 700 490 960 430V600H0Z" fill="#102a32"/></svg>`,
  )
}
async function blank(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByTestId('create-stage-blank').click()
  await page
    .getByRole('navigation', { name: '场景列表' })
    .getByRole('button', { name: '添加场景', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: '添加场景' })
    .getByRole('button', { name: /并置试听/ })
    .click()
  await expect(page.locator('.project-scene')).toHaveAttribute('data-layout', 'listening')
}
async function uploadAudio(page: Page, n: number) {
  const participant = page.locator('.project-scene__participant').nth(n)
  await participant.locator('.project-scene__module').hover()
  await participant.getByRole('button', { name: '编辑音频', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type=file][accept="audio/*"]').setInputFiles({
    name: n ? '海岸晚风.wav' : '雨后街角.wav',
    mimeType: 'audio/wav',
    buffer: wave(n ? 330 : 220),
  })
  await dialog.locator('input[type=file][accept="image/*"]').setInputFiles({
    name: `cover-${n}.svg`,
    mimeType: 'image/svg+xml',
    buffer: cover(n ? '#95bab2' : '#c19b67'),
  })
  await expect(participant.locator('.stage-media__art img')).toBeVisible()
  await dialog.getByRole('button', { name: '完成', exact: true }).click()
}
async function addModule(page: Page, side: 'A' | 'B', name: string) {
  await page.getByRole('button', { name: `为 ${side} 添加模块`, exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(name) })
    .click()
}

test('W2 creates a real music review from blank through UI, preserves independent copies, presents and reimports', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await blank(page)
  await page.getByLabel('舞台名称', { exact: true }).fill('雨后与海岸 · 音乐生成比较')
  await page.getByLabel('舞台名称', { exact: true }).press('Tab')
  await expect(page.locator('.stage-frame__series')).toHaveText('雨后与海岸 · 音乐生成比较')
  await page.getByRole('button', { name: '对象资料', exact: true }).click()
  for (const [side, name] of [
    ['A', '工具 A / 雨后'],
    ['B', '工具 B / 海岸'],
  ]) {
    await page.getByLabel(`对象 ${side} 名称`, { exact: true }).fill(name!)
    await page.getByLabel(`对象 ${side} 名称`, { exact: true }).press('Tab')
  }
  await page.locator('.collection').getByRole('button', { name: '关闭', exact: true }).click()
  await uploadAudio(page, 0)
  await uploadAudio(page, 1)
  await page.screenshot({ path: info.outputPath('w2-editor.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '播放 雨后街角', exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('.project-audio audio')
        .first()
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: '播放 海岸晚风', exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('.project-audio audio')
        .first()
        .evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(true)

  await addModule(page, 'A', '歌词')
  await page.getByRole('button', { name: '扩展编辑', exact: true }).first().click()
  const lyrics = page.getByRole('dialog')
  await lyrics.locator('textarea').first().fill('[00:00.00]雨落在街角\n[00:03.00]灯光越过海岸')
  await lyrics.locator('textarea').first().press('Tab')
  const contrast = await lyrics
    .locator('textarea')
    .first()
    .evaluate((el) => {
      const css = getComputedStyle(el)
      const luminance = (value: string) => {
        const channels = value
          .match(/[0-9.]+/g)!
          .slice(0, 3)
          .map((v) => {
            const c = Number(v) / 255
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
          })
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      }
      const a = luminance(css.color),
        b = luminance(css.backgroundColor)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: info.outputPath('w2-editor-dialog.png'), animations: 'disabled' })
  await lyrics.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('.project-scene')).toContainText('雨落在街角')
  await addModule(page, 'B', '文字')
  await page.locator('.studio__fields textarea').fill('海岸版本的层次更清晰，尾音留白更长。')
  await addModule(page, 'B', '评分')
  await page.locator('.studio__fields input[type=number]').first().fill('8')
  await page.locator('.studio__fields input[type=number]').first().press('Tab')
  await page.getByRole('button', { name: '上移模块', exact: true }).click()
  expect(
    await page
      .locator('.project-scene__participant')
      .nth(1)
      .locator('[data-module-type]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-module-type'))),
  ).toEqual(['audio', 'score', 'text'])

  await page.getByRole('button', { name: '复制场景', exact: true }).click()
  await page.getByLabel('场景标题', { exact: true }).fill('第二页 · 观察与评分')
  await page.getByLabel('场景标题', { exact: true }).press('Tab')
  await page.locator('.studio__module-select').filter({ hasText: '文字' }).click()
  await page.locator('.studio__fields textarea').fill('独立副本中的观察，不应改变原页。')
  await page.locator('.scene-nav__item').first().click()
  await expect(page.locator('.project-scene')).toContainText('海岸版本的层次更清晰')
  await expect(page.locator('.project-scene')).not.toContainText('独立副本中的观察')
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  await expect(page.locator('.project-scene__edit')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('w2-presentation.png'), animations: 'disabled' })
  await page.locator('.stage-frame__title').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.stage-frame__title h1')).toHaveText('第二页 · 观察与评分')
  await page.keyboard.press('Escape')
  await expect(page.locator('.scene-nav__item[aria-current]')).toContainText('作品试听')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /工程文件/ })
    .click()
  const path = info.outputPath('music-review.duet')
  await (await downloading).saveAs(path)
  const project = JSON.parse(await readFile(path, 'utf8')).projects[0]
  expect(project.title).toBe('雨后与海岸 · 音乐生成比较')
  expect(project.comparison.scenes).toHaveLength(2)
  expect(project.comparison.scenes[0].sectionId).not.toBe(project.comparison.scenes[1].sectionId)
  expect(project.comparison.scenes[0].layout).toBe('listening')
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '开始演示', exact: true }).click()
  const mobileArt = await page.locator('.stage-media__art').first().boundingBox()
  expect(mobileArt!.width / mobileArt!.height).toBeCloseTo(16 / 10, 1)
  const context = await browser.newContext()
  try {
    const restored = await context.newPage()
    await restored.goto(new URL('/', page.url()).href)
    await restored.locator('.gallery input[type=file]').setInputFiles(path)
    await expect(restored.locator('.scene-nav__item')).toHaveCount(2)
    await restored.getByRole('button', { name: '播放 雨后街角', exact: true }).click()
    await expect
      .poll(() =>
        restored
          .locator('.project-audio audio')
          .first()
          .evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0)
    await restored.reload()
    await expect(restored.locator('.project-scene')).toContainText('海岸版本的层次更清晰')
  } finally {
    await context.close()
  }
  expect(errors).toEqual([])
})

test('W2 module move, linked source and deletion retain data with undo', async ({ page }) => {
  await blank(page)
  await addModule(page, 'A', '文字')
  await page.locator('.studio__fields textarea').fill('可以移动的观察')
  await page.getByRole('button', { name: '复制模块', exact: true }).click()
  await expect(page.locator('.project-scene')).toContainText('可以移动的观察')
  await page.getByRole('button', { name: '移动到…', exact: true }).click()
  await page.getByRole('dialog').getByLabel('目标位置').selectOption({ index: 1 })
  await page.getByRole('dialog').getByRole('button', { name: '移动模块', exact: true }).click()
  await expect(page.locator('.project-scene__participant').nth(1)).toContainText('可以移动的观察')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.project-scene__participant').nth(1)).not.toContainText(
    '可以移动的观察',
  )
  await page.getByRole('button', { name: '引用已有内容', exact: true }).click()
  await page.getByLabel('内容来源').selectOption({ index: 1 })
  await page.getByRole('button', { name: '建立引用场景', exact: true }).click()
  await expect(page.locator('.scene-nav__item')).toHaveCount(2)
  await expect(page.locator('.studio__source-note')).toContainText('共同引用')
  await page.getByRole('button', { name: '删除场景', exact: true }).click()
  await expect(page.getByRole('dialog').locator('input[type=checkbox]')).toBeDisabled()
  await page.getByRole('button', { name: '确认删除场景', exact: true }).click()
  await expect(page.locator('.scene-nav__item')).toHaveCount(1)
  await expect(page.locator('.project-scene')).toContainText('可以移动的观察')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.scene-nav__item')).toHaveCount(2)
})

test('W2 compact editor keeps scene, library and dialog operations reachable in both palettes', async ({
  page,
}) => {
  await blank(page)
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  const library = page.getByRole('complementary', { name: '作品库' })
  await library.getByRole('button', { name: '新建测试题', exact: true }).click()
  await expect(page.locator('.scene-nav__item[aria-current]')).toHaveCount(1)
  await library.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByLabel('项目风格', { exact: true }).selectOption('paper')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '关闭属性', exact: true }).click()
  await addModule(page, 'A', '文字')
  await expect(page.locator('.studio__properties')).toBeVisible()
  await page.locator('.studio__fields textarea').fill('手机也能补充观察。')
  await page.getByRole('button', { name: '扩展编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('textarea')).toHaveValue('手机也能补充观察。')
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await expect(dialog.locator('.studio-dialog')).toHaveCSS('color', 'rgb(34, 44, 44)')
  await dialog.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '关闭属性', exact: true }).click()
  await expect(page.locator('.project-scene')).toContainText('手机也能补充观察。')
  await page
    .getByRole('navigation', { name: '场景列表' })
    .getByRole('button', { name: '添加场景', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: '添加场景' })).toBeVisible()
})
