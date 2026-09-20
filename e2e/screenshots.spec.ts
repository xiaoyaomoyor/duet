/**
 * 真实使用截屏（发布用）
 *
 * 造一份**有真实内容**的对比：两个真实工具、一首真实的诗、两张配图、
 * 两段音频（各自带封面），然后按发布页需要的视角截图。
 *
 * 图片不是网上找的，而是当场用 CSS 画出来再截的——这样仓库里不引入
 * 任何来源不明的素材，而画面又是真的。
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createFromTemplate } from './helpers'

const OUT = 'docs/screenshots'

/** 用 CSS 画两张配图并截图存成 PNG（免去引入外部素材） */
async function renderIllustration(
  page: Page,
  file: string,
  config: { from: string; to: string; accent: string; title: string; sub: string },
): Promise<void> {
  await page.setContent(`
    <html><body style="margin:0">
      <div style="width:960px;height:640px;position:relative;overflow:hidden;
                  background:linear-gradient(140deg, ${config.from}, ${config.to});
                  font-family:'Segoe UI','Microsoft YaHei',sans-serif">
        <div style="position:absolute;left:-120px;top:-140px;width:460px;height:460px;border-radius:50%;
                    background:${config.accent};opacity:.28;filter:blur(6px)"></div>
        <div style="position:absolute;right:-90px;bottom:-160px;width:520px;height:520px;border-radius:50%;
                    background:#ffffff;opacity:.22"></div>
        <div style="position:absolute;left:96px;bottom:120px;color:#fff">
          <div style="font-size:76px;font-weight:700;letter-spacing:8px;line-height:1.1;
                      text-shadow:0 6px 24px rgba(0,0,0,.35)">${config.title}</div>
          <div style="margin-top:18px;font-size:26px;letter-spacing:4px;opacity:.85">${config.sub}</div>
        </div>
        <div style="position:absolute;right:64px;top:56px;font-size:22px;color:#fff;opacity:.7;
                    letter-spacing:6px">DUET · DEMO</div>
      </div>
    </body></html>
  `)
  await page.locator('div').first().screenshot({ path: file })
}

function wav(seconds: number, freq: number): Buffer {
  const rate = 16000
  const samples = rate * seconds
  const b = Buffer.alloc(44 + samples * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + samples * 2, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate
    const env = Math.min(1, t * 2) * Math.min(1, (seconds - t) * 2)
    const v = (Math.sin(t * freq * 2 * Math.PI) * 0.6 + Math.sin(t * freq * 3 * 2 * Math.PI) * 0.3) * env
    b.writeInt16LE(Math.round(v * 9000), 44 + i * 2)
  }
  return b
}

/** 某一行的右格 */
function rightCell(page: Page, rowIndex: number): Locator {
  return page.locator('.canvas__row:not([data-has-title])').nth(rowIndex).locator('.canvas__cell').nth(1)
}
function leftCell(page: Page, rowIndex: number): Locator {
  return page.locator('.canvas__row:not([data-has-title])').nth(rowIndex).locator('.canvas__cell').first()
}

async function openEditor(page: Page, card: Locator): Promise<Locator> {
  await card.hover()
  await card.getByRole('button', { name: '编辑模块' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function closeEditor(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: '完成' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

async function pickTool(page: Page, side: 'left' | 'right', query: string, version: string): Promise<void> {
  const titleCard = page
    .locator('.canvas__row[data-has-title] .card')
    .nth(side === 'left' ? 0 : 1)
  const dialog = await openEditor(page, titleCard)
  await dialog.getByPlaceholder('搜索工具…').fill(query)
  await dialog.locator('.picker__item').first().click()
  const fields = dialog.locator('.section--fields input[type="text"]')
  await fields.nth(1).fill(version)
  await fields.nth(1).blur()
  await closeEditor(page)
}

test('生成发布用截屏', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 1000 })

  // —— 0. 先画两张配图（真图，不是占位） ——
  await renderIllustration(page, 'test-results/shot/a.png', {
    from: '#1e1b4b',
    to: '#7c3aed',
    accent: '#f59e0b',
    title: '空山新雨后',
    sub: 'AI 生成 · DeepSeek',
  })
  await renderIllustration(page, 'test-results/shot/b.png', {
    from: '#0f172a',
    to: '#0e7490',
    accent: '#22d3ee',
    title: '天气晚来秋',
    sub: 'AI 生成 · Gemini',
  })

  // —— 1. 建一份空白对比，把两侧工具设成真实品牌 ——
  await page.goto('/')
  await createFromTemplate(page, /空白对比/)
  await expect(page.locator('.canvas')).toBeVisible()

  await pickTool(page, 'left', 'DeepSeek', 'V3')
  await pickTool(page, 'right', 'Gemini', '2.5 Pro')

  // —— 2. 第一行：回答正文 ——
  const text = { left: '空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。', right: '空山新雨后，天气晚来秋。\n竹喧归浣女，莲动下渔舟。' }
  for (const [side, cell] of [['left', leftCell(page, 0)], ['right', rightCell(page, 0)]] as const) {
    const dialog = await openEditor(page, cell.locator('.card').first())
    await dialog.locator('textarea').first().fill(text[side])
    await closeEditor(page)
  }

  // 把第一行的模块标题改成「回答」
  for (const side of ['left', 'right'] as const) {
    const cell = side === 'left' ? leftCell(page, 0) : rightCell(page, 0)
    const dialog = await openEditor(page, cell.locator('.card').first())
    const title = dialog.locator('.dialog__title-input')
    await title.fill('回答')
    await title.press('Enter')
    await closeEditor(page)
  }

  // —— 3. 加一行配图 ——
  await page.locator('.canvas__add-row').click()
  await page.waitForTimeout(300)
  for (const [side, file] of [['left', 'a.png'], ['right', 'b.png']] as const) {
    const cell = side === 'left' ? leftCell(page, 1) : rightCell(page, 1)
    await cell.locator('.canvas__add-module').click()
    await page.getByRole('dialog', { name: '选择模块类型' }).getByRole('button', { name: /^图片\s/ }).click()
    const dialog = await openEditor(page, cell.locator('.card').last())
    await dialog.locator('input[type="file"]').first().setInputFiles(`test-results/shot/${file}`)
    await expect(dialog.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 })
    const title = dialog.locator('.dialog__title-input')
    await title.fill('配图')
    await title.press('Enter')
    await closeEditor(page)
  }

  // —— 4. 加一行朗读（音频 + 封面） ——
  await page.locator('.canvas__add-row').click()
  await page.waitForTimeout(300)
  for (const [side, freq, cover] of [
    ['left', 220, 'a.png'],
    ['right', 330, 'b.png'],
  ] as const) {
    const cell = side === 'left' ? leftCell(page, 2) : rightCell(page, 2)
    await cell.locator('.canvas__add-module').click()
    await page.getByRole('dialog', { name: '选择模块类型' }).getByRole('button', { name: '音频' }).click()
    const dialog = await openEditor(page, cell.locator('.card').last())
    await dialog.locator('input[type="file"]').nth(0).setInputFiles({
      name: side === 'left' ? '空山新雨后.mp3' : '天气晚来秋.mp3',
      mimeType: 'audio/wav',
      buffer: wav(12, freq),
    })
    await expect(dialog.locator('audio').first()).toBeAttached({ timeout: 15_000 })
    // 用新加的「上传封面」给它配一张图
    await dialog.locator('input[type="file"]').nth(1).setInputFiles(`test-results/shot/${cover}`)
    await page.waitForTimeout(800)
    const title = dialog.locator('.dialog__title-input')
    await title.fill('朗读')
    await title.press('Enter')
    await closeEditor(page)
  }

  // —— 5. 项目改名 + 等提示条散掉 ——
  await page.locator('.compare-toolbar__save--saved').waitFor({ timeout: 10_000 })
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /空白对比/ })
    .first()
    .click({ button: 'right' })
  await page.getByRole('button', { name: '重命名' }).click()
  const rename = page.getByRole('complementary').locator('input.sidebar__rename')
  await rename.fill('秋日五言绝句 · DeepSeek vs Gemini')
  await rename.press('Enter')
  // 提示条（toast）会自动消失，别让它入镜
  await page.locator('.toast').first().waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => void 0)
  await page.waitForTimeout(800)

  // 滚到顶部，让「标题」行完整入镜
  await page.locator('.compare__stage').evaluate((el) => el.scrollTo({ top: 0 }))
  await page.waitForTimeout(600)

  // —— 6. 截图 ——
  await page.screenshot({ path: `${OUT}/01-editor.png`, fullPage: false })

  // 对比配置面板
  await page.getByRole('button', { name: '对比配置', exact: true }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/02-inspector.png` })
  await page.getByRole('button', { name: '对比配置', exact: true }).click()

  // 音频模块特写（长条布局）
  await page.locator('.canvas__row:not([data-has-title])').nth(2).screenshot({ path: `${OUT}/03-audio.png` })

  // 演示视图
  await page.getByRole('button', { name: '进入演示视图' }).click()
  await expect(page.locator('.present')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/04-present.png` })
  await page.keyboard.press('Escape')

  // 工具库
  await page.getByRole('link', { name: '设置' }).click()
  await page.getByRole('button', { name: '工具库', exact: true }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/05-tools.png` })
})
