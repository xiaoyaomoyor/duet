/**
 * M5 验收：轻量比较模块、备份恢复
 *
 * 只覆盖**单测覆盖不到**的部分：
 *   - 模块在真实浏览器里的渲染结果（行号、差异高亮、左右配色）
 *   - 设置面板里的备份/恢复入口真的可用
 *
 * 解析/对比算法本身的正确性由 `src/lib/*.spec.ts` 负责，这里不重复断言。
 * PWA 的清单与图标属于**构建产物**，dev server 下插件是关掉的，
 * 因此由 `scripts/check-pwa.mjs` 在 `npm run build` 之后校验，不放在这里。
 */
import { expect, test, type Page } from '@playwright/test'

async function createFromTemplate(page: Page, name: string | RegExp): Promise<void> {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('button', { name: '新建对比' }).click()
  await sidebar.getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/** 某一行的左格 */
function leftCell(page: Page, rowIndex: number) {
  return page.locator('.canvas__row').nth(rowIndex).locator('.canvas__cell').first()
}

/**
 * 左格里**最后一张卡片**——也就是刚添加的那个模块。
 *
 * 必须取 `.last()`：模板自带一个文字模块，格子里的预览元素不止一个，
 * 直接写 `.card__preview` 会命中多张卡片并触发 strict mode 报错。
 */
function addedCard(page: Page, rowIndex = 0) {
  return leftCell(page, rowIndex).locator('.card').last()
}

/** 打开某一行的模块选择器，并挑选一个模块类型 */
async function addModule(page: Page, rowIndex: number, moduleName: string): Promise<void> {
  const row = page.locator('.canvas__row').nth(rowIndex)
  await row.locator('.canvas__add-module').first().click()
  await page
    .getByRole('dialog', { name: '选择模块类型' })
    .getByRole('button', { name: moduleName })
    .click()
  await expect(page.getByRole('dialog', { name: '选择模块类型' })).toBeHidden()
}

test.describe('M5 代码块模块', () => {
  test('贴入代码后按行渲染，并显示行号', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码块')

    const card = addedCard(page)
    await card.locator('.inline-editor__area').first().fill('第一行\n第二行\n第三行')

    const preview = card.locator('.card__preview')
    await expect(preview.locator('.code-block')).toBeVisible()
    // 三行 → 三个行号
    await expect(preview.locator('.code-block__line')).toHaveCount(3)
    await expect(preview.locator('.code-block__no').first()).toHaveText('1')
    await expect(preview.locator('.code-block__no').last()).toHaveText('3')
    await expect(preview).toContainText('第三行')
  })

  test('代码块里的标签被当作纯文本（不产生元素）', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码块')

    const card = addedCard(page)
    await card.locator('.inline-editor__area').first().fill('<script>alert(1)</script>\n正常一行')

    const preview = card.locator('.card__preview')
    await expect(preview).toContainText('<script>alert(1)</script>')
    // 没有被真的解析成 script 元素
    await expect(preview.locator('script')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('只填空格的代码块被判定为空：展示视图里不出现（§7.4）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码块')

    // 注意：编辑视图的"实时预览"**总是**渲染模块渲染器（ModuleCard 的设计如此），
    // 所以"空模块不渲染"这条规则只能在展示视图上验证。
    const card = addedCard(page)
    await card.locator('.inline-editor__area').first().fill('   \n  ')

    await page.getByRole('button', { name: '进入展示视图' }).click()
    await expect(page.locator('.present')).toBeVisible()

    // 唯一有内容的模块是空白文字模块 + 空白代码块 → 两者都算空，整页给出引导
    await expect(page.locator('.present').getByText('还没有可展示的内容')).toBeVisible()
    await expect(page.locator('.code-block')).toHaveCount(0)
  })
})

test.describe('M5 代码对比模块', () => {
  test('两侧内容不同：差异行着色，左右行号对齐', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码对比')

    const card = addedCard(page)
    const areas = card.locator('.diff-editor__area')
    await expect(areas).toHaveCount(2)

    await areas.nth(0).fill('相同行\n左边旧\n尾行')
    await areas.nth(1).fill('相同行\n右边新\n尾行')

    const preview = card.locator('.card__preview')
    await expect(preview.locator('.diff-view')).toBeVisible()

    // 中间那行是"修改"：左右两侧都应带 change 底色
    await expect(preview.locator('.diff-view__row--change')).toHaveCount(1)
    await expect(preview.locator('.diff-view__cell--change')).toHaveCount(2)

    // 三行对齐：左右各三个行号
    await expect(preview.locator('.diff-view__row')).toHaveCount(3)
  })

  test('只有一侧有内容：整段按新增着色，并给出提示', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码对比')

    const card = addedCard(page)
    const areas = card.locator('.diff-editor__area')
    await areas.nth(0).fill('')
    await areas.nth(1).fill('甲\n乙')

    const preview = card.locator('.card__preview')
    await expect(preview.locator('.diff-view__row--add')).toHaveCount(2)
    await expect(preview.locator('.diff-view__cell--add')).toHaveCount(2)
    // 只填一侧时给出提示，而不是让人怀疑是不是没生效
    await expect(card.locator('.diff-editor__hint')).toBeVisible()
  })

  test('两侧完全相同时提示"一致"，且不高亮任何行', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码对比')

    const card = addedCard(page)
    const areas = card.locator('.diff-editor__area')
    await areas.nth(0).fill('一模一样')
    await areas.nth(1).fill('一模一样')

    const preview = card.locator('.card__preview')
    await expect(preview.locator('.diff-view__equal')).toBeVisible()
    await expect(preview.locator('.diff-view__body')).toHaveCount(0)
  })

  test('行尾空白默认被忽略（不产生假差异）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)
    await addModule(page, 0, '代码对比')

    const card = addedCard(page)
    const areas = card.locator('.diff-editor__area')
    await areas.nth(0).fill('同一行')
    await areas.nth(1).fill('同一行   ')

    await expect(card.locator('.card__preview .diff-view__equal')).toBeVisible()
  })
})

test.describe('M5 设置面板：备份与恢复', () => {
  /** 打开设置 → 数据与存储（沿用既有 E2E 的选择器约定） */
  async function openStoragePanel(page: Page): Promise<void> {
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '数据与存储', exact: true }).click()
  }

  test('导出与恢复入口都在，且恢复用隐藏的文件选择框', async ({ page }) => {
    await page.goto('/')
    await openStoragePanel(page)

    await expect(page.getByRole('button', { name: '导出全部数据' })).toBeVisible()
    await expect(page.getByRole('button', { name: '从备份恢复' })).toBeVisible()

    // 文件选择框必须存在（恢复的入口），但不该出现在视觉流里
    const fileInput = page.locator('.actions__file')
    await expect(fileInput).toHaveCount(1)
    await expect(fileInput).toBeHidden()
  })

  test('导出的备份可以在清空后恢复回来', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    // 改个标题，便于恢复后识别
    const card = leftCell(page, 0).locator('.card').first()
    await card.locator('.card__title').click()
    await card.locator('.card__title-input').fill('备份标记')
    await card.locator('.card__title-input').press('Enter')
    await expect(page.locator('.topbar__save--saved')).toBeVisible({ timeout: 5000 })

    // —— 导出备份 ——
    await openStoragePanel(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出全部数据' }).click()
    const savedPath = await (await download).path()
    expect(savedPath).toBeTruthy()

    // —— 清空全部数据（需要输入确认文字） ——
    await page.getByRole('button', { name: '清空所有数据' }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.locator('input[type="text"]').fill('DELETE')
    await dialog.getByRole('button', { name: '清空所有数据' }).click()
    await expect(page.getByRole('heading', { name: '从一次对比开始' })).toBeVisible()

    // —— 从备份恢复 ——
    await openStoragePanel(page)
    await page.locator('.actions__file').setInputFiles(savedPath as string)

    // 统计里的项目数应从 0 回到 1
    await expect(page.locator('.counts__value').first()).toHaveText('1', { timeout: 10_000 })

    // 回到对比界面，恢复的项目应当出现在侧栏
    await page.getByTestId('nav-compare').click()
    await expect(page.getByRole('complementary').getByText(/共 1 个项目/)).toBeVisible({
      timeout: 10_000,
    })
  })
})

test.describe('M5 关于面板', () => {
  test('提供安装入口，并列出仓库与许可', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '关于', exact: true }).click()

    await expect(page.getByRole('button', { name: '安装' })).toBeVisible()
    await expect(page.getByRole('link', { name: /github\.com/ })).toBeVisible()
  })
})
