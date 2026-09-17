import { expect, test, type Page } from '@playwright/test'
import { createShowcaseAudio } from '../src/services/showcaseAudio'
import { createFromTemplate } from './helpers'

const kinds = ['命题', '成对试听', '媒体与观察', '维度比较', '结论']
async function open(page: Page): Promise<void> {
  await page.goto('/#/showcase')
  await expect(page.locator('.stage-frame')).toBeVisible()
}
async function chooseScene(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: '场景目录' })
    .getByRole('button', { name: new RegExp(name) })
    .click()
  await expect(page.locator('.stage-frame__title p')).toContainText(name)
}

for (const width of [1920, 1280]) {
  for (const theme of ['墨色', '纸白']) {
    test(`R1 五场景逐屏验收 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: (width * 9) / 16 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page)
      await page.getByRole('button', { name: theme, exact: true }).click()
      for (const [index, kind] of kinds.entries()) {
        await chooseScene(page, kind)
        const previewGap = await page.locator('.stage-frame').evaluate((el) => {
          const footer = el.querySelector('.stage-frame__foot')!.getBoundingClientRect()
          const nodes = Array.from(el.querySelectorAll('.stage-frame__content *')).filter(
            (n) => n.getClientRects().length,
          )
          return footer.top - Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom))
        })
        expect(previewGap).toBeGreaterThan(4)
        await page.getByRole('button', { name: '干净画面', exact: true }).click()
        await expect(page.locator('.showcase')).toHaveClass(/showcase--clean/)
        await page.mouse.move(0, 0)
        const frame = page.locator('.stage-frame')
        // 检查内容实际边界，不能仅凭根容器的 scrollHeight 忽略内容与页脚相叠。
        const boxes = await frame.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const content = el.querySelector('.stage-frame__content')!
          const footer = el.querySelector('.stage-frame__foot')!.getBoundingClientRect()
          const descendants = Array.from(content.querySelectorAll('*')).filter(
            (n) => n.getClientRects().length > 0,
          )
          return {
            width: rect.width,
            height: rect.height,
            right: Math.max(...descendants.map((n) => n.getBoundingClientRect().right)),
            bottom: Math.max(...descendants.map((n) => n.getBoundingClientRect().bottom)),
            footerTop: footer.top,
          }
        })
        expect(boxes.width).toBeCloseTo(width, 0)
        expect(boxes.height).toBeCloseTo((width * 9) / 16, 0)
        expect(boxes.right).toBeLessThanOrEqual(width + 1)
        expect(boxes.bottom).toBeLessThanOrEqual(boxes.footerTop - 8)
        await page.screenshot({ path: info.outputPath(`${index}-${width}-${theme}.png`) })
        await page.keyboard.press('Escape')
        await expect(page.locator('.showcase')).not.toHaveClass(/showcase--clean/)
      }
    })
  }
}

test('R1 真实试听：独听、定位、场景离场暂停、媒体宿主稳定', async ({ page }) => {
  await open(page)
  const audios = page.locator('audio[data-participant]')
  await expect(audios).toHaveCount(2)
  await expect.poll(() => audios.first().evaluate((a: HTMLAudioElement) => a.duration)).toBe(12)
  await page.getByRole('button', { name: '播放 山雾来信', exact: true }).click()
  await expect
    .poll(() => audios.first().evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: '播放 潮汐之间', exact: true }).click()
  expect(await audios.first().evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
  await expect.poll(() => audios.nth(1).evaluate((a: HTMLAudioElement) => a.paused)).toBe(false)
  const seek = page.getByRole('slider', { name: '潮汐之间 · 播放位置' })
  await seek.fill('7')
  await expect
    .poll(() => audios.nth(1).evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(7)
  const host = await audios.nth(1).elementHandle()
  await chooseScene(page, '媒体与观察')
  expect(await host!.evaluate((a: HTMLAudioElement) => a.isConnected && a.paused)).toBe(true)
  await expect(audios).toHaveCount(2)
})

test('R1 空素材与长中文不伪造播放、不裁切内容', async ({ page }) => {
  await open(page)
  await page.getByLabel('样例内容').selectOption('empty')
  await expect(page.getByRole('button', { name: '播放 山雾来信' })).toBeDisabled()
  await expect(page.getByText('尚未添加音频', { exact: true })).toHaveCount(2)
  await expect(page.locator('.stage-media__empty')).toHaveCount(2)
  await page.getByLabel('样例内容').selectOption('long')
  await expect(page.locator('.showcase__reading-note')).toBeVisible()
  await expect(page.locator('.stage-frame')).toHaveClass(/stage-frame--reading/)
  await expect(page.locator('.identity').first()).toContainText('保留完整版本信息')
  await chooseScene(page, '命题')
  await expect(page.locator('.brief-scene__text')).toContainText('无法解释的总分')
})

for (const theme of ['墨色', '纸白']) {
  test(`R1 ${theme} 的 S/M/L 窗口、验证、焦点恢复`, async ({ page }, info) => {
    await open(page)
    await page.getByRole('button', { name: theme, exact: true }).click()
    await page.getByRole('button', { name: '组件规范', exact: true }).click()
    const launcher = page.getByRole('button', { name: /表单窗口 · M/ })
    await launcher.click()
    const dialog = page.getByRole('dialog')
    const input = dialog.getByRole('textbox', { name: '作品名称' })
    await expect(input).toBeFocused()
    await input.fill('')
    await dialog.getByRole('button', { name: '应用到样板' }).click()
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('请填写作品名称')).toBeVisible()
    await input.fill('修改后的试听标题')
    await dialog.getByRole('button', { name: '应用到样板' }).click()
    await expect(launcher).toBeFocused()
    for (const label of ['确认窗口 · S', '扩展编辑器 · L']) {
      const entry = page.getByRole('button', { name: new RegExp(label) })
      await entry.click()
      await page.screenshot({
        path: info.outputPath(`${theme}-${label}.png`),
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
      await expect(entry).toBeFocused()
    }
    await page.getByRole('button', { name: '场景样板', exact: true }).click()
    await expect(page.getByRole('heading', { name: '修改后的试听标题' })).toBeVisible()
  })
}

test('R1 本地音频更换与恢复，损坏文件有真实错误状态', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '更换试听' }).click()
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'local.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from(await createShowcaseAudio('b').arrayBuffer()),
    })
  await expect(page.getByRole('heading', { name: 'local', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '播放 local', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停 local', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '更换试听' }).click()
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') })
  await expect(page.locator('.stage-media').first()).toContainText('播放失败')
  await page.getByRole('button', { name: '更换试听' }).click()
  await page.getByRole('button', { name: '恢复示例音频' }).click()
  await page.getByRole('button', { name: '播放 山雾来信' }).click()
  await expect(page.getByRole('button', { name: '暂停 山雾来信' })).toBeVisible()
})

test('R1 390px 阅读布局与减少动效', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
  await expect(page.locator('.showcase')).toHaveCSS('--d-fast', '0ms')
  await expect(page.getByRole('heading', { name: '山雾来信', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('mobile-reading.png'), fullPage: true })
})

test('R1 从现有项目进入并返回，不改动项目内容', async ({ page }) => {
  await page.goto('/')
  await createFromTemplate(page, /音乐对比/)
  await expect(page.locator('.canvas').getByText('工具 A', { exact: true })).toBeVisible()
  await expect(page.locator('.canvas').getByText('工具 B', { exact: true })).toBeVisible()
  const content = await page.locator('.canvas').innerText()
  await page.getByRole('link', { name: '展示样板', exact: true }).click()
  await expect(page.locator('.showcase__topbar')).toBeVisible()
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+e')
  await page.locator('.showcase__brand').click()
  await expect(page).toHaveURL(/#\/p\/[^/]+$/)
  await expect.poll(() => page.locator('.canvas').innerText()).toBe(content)
})

test('R1 英文五场景保持版式，干净画面的方向键与 Escape 可用', async ({ page }, info) => {
  await page.goto('/#/settings/language')
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('link', { name: 'Design showcase', exact: true }).click()
  await page.getByRole('button', { name: 'Clean view', exact: true }).click()
  await page.locator('.stage-frame__title').click()
  await page.keyboard.press('ArrowLeft')
  for (const index of [1, 2, 3, 4, 5]) {
    await expect(page.locator('.stage-frame__title p')).toContainText(`0${index} /`)
    const overlaps = await page.locator('.stage-frame').evaluate((el) => {
      const footer = el.querySelector('.stage-frame__foot')!.getBoundingClientRect()
      return Array.from(el.querySelectorAll('.stage-frame__content *')).some(
        (n) => n.getClientRects().length && n.getBoundingClientRect().bottom > footer.top,
      )
    })
    expect(overlaps).toBe(false)
    await page.screenshot({ path: info.outputPath(`english-${index}.png`), animations: 'disabled' })
    if (index < 5) await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Clean view', exact: true })).toBeVisible()
})

test('R1 编辑超长文字后自动转为完整阅读布局', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: '组件规范', exact: true }).click()
  await page.getByRole('button', { name: /扩展编辑器 · L/ }).click()
  const title = '给清晨留一点空间，用完整的作品名称和版本信息描述这一次试听。'.repeat(3)
  const note = '观察记录应当完整展示；文字增多时，让内容自然展开。'.repeat(12)
  await page.getByRole('textbox', { name: '作品名称' }).fill(title)
  await page.getByRole('textbox', { name: '观察记录' }).fill(note)
  await page.getByRole('button', { name: '应用到样板' }).click()
  await page.getByRole('button', { name: '场景样板', exact: true }).click()
  await expect(page.locator('.stage-frame')).toHaveClass(/stage-frame--reading/)
  await expect(page.locator('.stage-media').first()).toContainText(note)
  const gap = await page
    .locator('.stage-frame')
    .evaluate(
      (el) =>
        el.querySelector('.stage-frame__foot')!.getBoundingClientRect().top -
        el.querySelector('.duet-scene')!.getBoundingClientRect().bottom,
    )
  expect(gap).toBeGreaterThan(8)
  await page
    .locator('.stage-frame')
    .screenshot({ path: info.outputPath('long-edited.png'), animations: 'disabled' })
})
