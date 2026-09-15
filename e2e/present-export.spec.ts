/**
 * M3 验收：展示视图与导出
 *
 * 覆盖三条承诺：
 *   1. 展示视图**绝对只读**（结构上不存在可输入元素）
 *   2. 空模块/隐藏模块在展示视图不出现，整行为空时整行跳过
 *   3. 三种导出都能产出文件，且长图**不是空白**
 */
import { expect, test, type Page } from '@playwright/test'

const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAcxhA/1kF5WvAAAAAElFTkSuQmCC'

/** 2×2 红点 PNG（M3 的用例暂不需要上传媒体，先留作后续扩展） */
void RED_PNG_BASE64

async function createFromTemplate(page: Page, name: RegExp): Promise<void> {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('button', { name: '新建对比' }).click()
  await sidebar.getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/** 进入展示视图（顶栏按钮） */
async function enterPresent(page: Page): Promise<void> {
  await page.getByRole('button', { name: '进入展示视图' }).click()
  await expect(page.locator('.present')).toBeVisible()
}

test.describe('M3 展示视图', () => {
  test('进入展示视图后只读，且没有可输入元素', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await enterPresent(page)

    // 存在展示态画布根节点
    await expect(page.locator('[data-present-root]')).toBeVisible()

    // 核心断言：展示视图内不存在任何可输入/可编辑元素
    const editableCount = await page.evaluate(() => {
      const root = document.querySelector('[data-present-root]')
      if (!root) return -1
      return root.querySelectorAll('input, textarea, select, [contenteditable="true"]').length
    })
    expect(editableCount).toBe(0)

    // 也不应该有"添加模块"之类的编辑入口
    await expect(page.locator('.canvas__add-module')).toHaveCount(0)
  })

  test('Esc 退出展示视图，回到编辑态', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await enterPresent(page)

    await page.keyboard.press('Escape')
    await expect(page.locator('.present')).toBeHidden()
    // 回到编辑态后编辑入口重新出现
    await expect(page.locator('.canvas__add-module').first()).toBeVisible()
  })

  test('缩放快捷键生效', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await enterPresent(page)

    const zoomLabel = page.locator('.present__zoom')
    await expect(zoomLabel).toHaveText('100%')

    await page.keyboard.press('=')
    await expect(zoomLabel).toHaveText('110%')

    await page.keyboard.press('0')
    await expect(zoomLabel).toHaveText('100%')
  })

  test('空模块与隐藏模块在展示视图不出现', async ({ page }) => {
    await page.goto('/')
    // 图片模板：封面/图片/参数表三行，全部是空模块
    await createFromTemplate(page, /图片对比/)

    await enterPresent(page)

    // 全部为空 → 展示视图一行都不渲染
    await expect(page.locator('.canvas__row')).toHaveCount(0)
    // 并给出空状态引导，而不是白屏
    await expect(page.getByText('还没有可展示的内容')).toBeVisible()
  })

  test('有内容的模块出现，被隐藏的模块不出现', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    // 空白模板带一个文字模块：先填内容
    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await cell.locator('.card__editor textarea').first().fill('第一段结论')
    await expect(cell.locator('.card__preview')).toContainText('第一段结论')

    // 再添加一个模块并隐藏它
    await cell.locator('.canvas__add-module').first().click()
    await page.getByRole('dialog', { name: '选择模块类型' }).getByRole('button', { name: '文字' }).click()
    const secondCard = cell.locator('.card').nth(1)
    await secondCard.locator('.card__editor textarea').first().fill('这段不该出现')
    await secondCard.locator('[aria-label="在展示视图隐藏"]').click()

    await enterPresent(page)

    const root = page.locator('[data-present-root]')
    await expect(root).toContainText('第一段结论')
    await expect(root).not.toContainText('这段不该出现')
  })
})

test.describe('M3 导出', () => {
  test('导出 .duet 工程文件', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    await page.getByRole('button', { name: '导出' }).click()
    const dialog = page.getByRole('dialog', { name: '导出' })
    await expect(dialog).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: /工程文件/ }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.duet$/)
    // 文件内容应是带 $format 标记的 JSON
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    expect(parsed.$format).toBe('duet-project')
    expect(Array.isArray(parsed.projects)).toBe(true)
  })

  test('导出长图 PNG（并确认不是空白图）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    // 填一段文字，保证图上一定有内容
    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await cell.locator('.card__editor textarea').first().fill('长图导出测试内容')
    await expect(cell.locator('.card__preview')).toContainText('长图导出测试内容')

    await page.getByRole('button', { name: '导出' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: /长图/ })
      .click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.png$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const png = Buffer.concat(chunks)

    // PNG 魔数
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    // 体积下限：全黑或全透明的空白图会被压得极小；有文字与背景时应该明显更大
    expect(png.byteLength).toBeGreaterThan(5000)
  })

  test('导出只读 HTML（含内容且不含编辑器）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await cell.locator('.card__editor textarea').first().fill('只读页内容标记')

    await page.getByRole('button', { name: '导出' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: /只读网页/ })
      .click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.html$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const html = Buffer.concat(chunks).toString('utf8')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('只读页内容标记')
    // 只读页不应包含编辑器痕迹（注意别误判 <style> 里的 CSS 规则名）
    expect(html).not.toContain('card__editor')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('<input')
    // 应内联样式（否则打开后是裸 HTML）
    expect(html).toContain('--bg-base')
  })

  test('导出后视图态被还原（不会把用户留在展示视图）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await cell.locator('.card__editor textarea').first().fill('x')

    await page.getByRole('button', { name: '导出' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: /长图/ })
      .click()
    await downloadPromise

    // 对话框关闭后应回到编辑视图
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: '关闭' })
      .click()
    await expect(page.locator('.present')).toBeHidden()
    await expect(page.locator('.canvas__add-module').first()).toBeVisible()
  })

  test('.duet 往返：导出后清空再导入，内容仍在', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await cell.locator('.card__editor textarea').first().fill('往返内容标记')
    await expect(page.locator('.topbar__save--saved')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: '导出' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('dialog', { name: '导出' })
      .getByRole('button', { name: /工程文件/ })
      .click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const fileText = Buffer.concat(chunks).toString('utf8')

    // 清空所有数据
    await page.getByRole('dialog', { name: '导出' }).getByRole('button', { name: '关闭' }).click()
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '数据与存储', exact: true }).click()
    await page.getByRole('button', { name: '清空所有数据' }).click()
    const confirmDialog = page.getByRole('alertdialog')
    await confirmDialog.locator('input[type="text"]').fill('DELETE')
    await confirmDialog.getByRole('button', { name: '清空所有数据' }).click()
    await expect(page.getByRole('heading', { name: '从一次对比开始' })).toBeVisible()

    // 导入刚导出的文件
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'roundtrip.duet',
      mimeType: 'application/json',
      buffer: Buffer.from(fileText, 'utf8'),
    })

    // 侧栏出现导入的项目，打开后内容仍在
    const sidebar = page.getByRole('complementary')
    await expect(sidebar.getByRole('button', { name: /空白对比/ }).first()).toBeVisible()
    await sidebar.getByRole('button', { name: /空白对比/ }).first().click()
    await expect(page.locator('.card__preview').first()).toContainText('往返内容标记')
  })
})
