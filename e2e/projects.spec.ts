import { expect, test, type Page } from '@playwright/test'

/**
 * M1 验收：项目生命周期、持久化、标签页与设置面板。
 *
 * 每个 test 都有独立的 browser context，因此 IndexedDB 从空开始，
 * 不需要（也不应该）依赖上一个用例的残留数据。
 */

/**
 * 通过主区模板卡新建一个项目。
 *
 * M7 起模板卡片只在主区渲染（侧栏的 ＋ 会先把主区切回画廊），
 * 因此不再需要"限定在 <aside> 内"那层防 strict mode 的保护。
 */
async function createFromTemplate(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('complementary').getByRole('button', { name: '新建对比' }).click()
  await page.getByRole('main').getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/** 打开侧栏某个项目的右键菜单 */
async function openItemMenu(page: Page, title: string): Promise<void> {
  const item = page.getByRole('complementary').getByRole('button', { name: new RegExp(title) })
  await item.click({ button: 'right' })
}

test.describe('M1 项目生命周期', () => {
  test('从模板创建项目并渲染对比画布', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    // 工具头：模板默认的两个占位工具
    const main = page.getByRole('main')
    await expect(main.getByText('工具 A')).toBeVisible()
    await expect(main.getByText('工具 B')).toBeVisible()

    // 模板预置的模块（M7 起「封面图」并入「图片」；v0.5.0 起另有「标题」行）
    for (const moduleName of ['标题', '图片', '音频', '歌词', '进度条']) {
      await expect(main.getByText(moduleName, { exact: true }).first()).toBeVisible()
    }

    // 侧栏出现该项目，且显示行数
    await expect(
      page.getByRole('complementary').getByRole('button', { name: /音乐对比/ }).first(),
    ).toBeVisible()
    // v0.5.0 起模板多一行「标题」（工具名卡片变成了普通模块）
    await expect(page.getByRole('complementary').getByText('5 行')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('重命名项目并持久化（刷新后仍在）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    await openItemMenu(page, '音乐对比')
    await page.getByRole('button', { name: '重命名' }).click()

    const renameInput = page.getByRole('complementary').locator('input.sidebar__rename')
    await renameInput.fill('Suno 对 Lyria')
    await renameInput.press('Enter')

    await expect(page.getByRole('complementary').getByText('Suno 对 Lyria')).toBeVisible()

    // 刷新：设置里的"保持位置"应自动把该项目重新打开
    await page.reload()
    await expect(page.getByRole('complementary').getByText('Suno 对 Lyria')).toBeVisible()
    await expect(page.locator('.canvas')).toBeVisible()
  })

  test('多项目：标签页打开、切换与关闭', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await createFromTemplate(page, /图片对比/)

    const tabbar = page.locator('.tabbar')
    await expect(tabbar.locator('.tabbar__tab')).toHaveCount(2)

    // 关闭当前标签后应回落到另一个标签，且画布仍在（项目未被删除）
    // 选中态类名是 .u-selected（M8 统一色彩风格后，与项目列表选中项同源）
    await tabbar.locator('.tabbar__tab.u-selected .tabbar__close').click()
    await expect(tabbar.locator('.tabbar__tab')).toHaveCount(1)
    await expect(page.locator('.canvas')).toBeVisible()

    // 侧栏中两个项目都还在（关闭标签 ≠ 删除项目）
    await expect(page.getByRole('complementary').getByText('共 2 个项目')).toBeVisible()
  })

  test('删除项目：危险操作需二次确认，且可撤销', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /视频对比/)

    await openItemMenu(page, '视频对比')
    // exact: true —— 编辑视图里每个模块卡片也有一个"删除"按钮，
    // 不加精确匹配会撞上 strict mode（这是 M2 引入的新按钮）
    await page.getByRole('button', { name: '删除', exact: true }).click()

    // 确认对话框
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '删除' }).click()

    await expect(page.getByRole('complementary').getByText('共 0 个项目')).toBeVisible()

    // Toast 提供撤销（限定在 toast 内，避免与顶栏同名按钮冲突）
    await page.locator('.toast__action').click()
    await expect(page.getByRole('complementary').getByText('共 1 个项目')).toBeVisible()
  })

  test('编辑工具卡片字段触发自动保存', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const main = page.getByRole('main')

    /*
     * v0.5.0：工具名卡片本身就是一个「标题」模块，因此编辑入口不再是
     * 卡片右上角的小按钮，而是**模块卡片**右上角的"编辑模块"
     * （编辑入口只留一个，见 modules/title/TitleEditor.vue 的说明）。
     */
    const head = main.locator('.side-head').first()
    const titleCard = main.locator('.canvas__row[data-has-title] .card').first()
    await titleCard.hover()
    await titleCard.getByRole('button', { name: '编辑模块' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    /*
     * 弹窗里第一个 text 输入是**模块标题**（ModuleEditorDialog 自带的），
     * 工具名在「标题」模块编辑器自己的表单里，因此要限定到 .section--fields。
     */
    const nameInput = dialog.locator('.section--fields input[type="text"]').first()
    await nameInput.fill('可灵 1.6')
    await nameInput.blur()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await expect(head).toContainText('可灵 1.6')
    // 保存指示最终回到"已保存"
    await expect(page.locator('.compare-toolbar__save--saved')).toBeVisible({ timeout: 5000 })

    await page.reload()
    await expect(page.getByRole('main').locator('.side-head').first()).toContainText('可灵 1.6')
  })
})

test.describe('M1 设置面板', () => {
  test('七个分组都可打开且渲染出内容', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()

    const panels: Array<[string, string | RegExp]> = [
      ['外观', '主题'],
      ['语言', '简体中文'],
      ['行为', '保持位置'],
      ['对比默认值', '默认对比配色'],
      // M9 起内置与自定义工具合并成一个气泡列表，原来的「内置工具」小标题没有了，
      // 因此改判列表上方的操作提示（它同时也是这一屏的用法说明）
      ['工具库', /点名字编辑/],
      ['数据与存储', '存储用量'],
      ['关于', 'AGPL-3.0-or-later'],
    ]

    for (const [nav, content] of panels) {
      await page.getByRole('button', { name: nav, exact: true }).click()
      await expect(page.getByText(content).first()).toBeVisible()
    }
  })

  test('行为设置可改并持久化', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '行为', exact: true }).click()

    const autosave = page.locator('input[type="number"]')
    await autosave.fill('600')
    await autosave.blur()

    await page.reload()
    await expect(page.locator('input[type="number"]')).toHaveValue('600')
  })

  test('语言切换为英文并持久化', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await page.getByRole('button', { name: 'English' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')

    await page.reload()
    // 设置入口在顶栏，是一个 RouterLink（渲染成 <a>）而不是 button
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  test('工具库可停用工具，且统计随之更新（内置与自定义同等对待）', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '工具库', exact: true }).click()

    await expect(page.getByText(/内置 \d+ 个 · 自定义 0 个 · 停用 0 个/)).toBeVisible()

    // 停用第一个工具
    await page.locator('.chip__toggle').first().click()
    await expect(page.getByText(/停用 1 个/)).toBeVisible()
  })

  /**
   * M9：内置工具也能像自定义工具一样编辑与删除（用户要求"整合"）。
   *
   * 这两件事在数据层是"本地改写"与"从工具库移除"（内置工具来自代码，
   * 删不掉，只能屏蔽），因此必须验证它们**真的落到设置里**、
   * 而且删除之后还能一键恢复。
   */
  test('内置工具可以编辑与移除，并且能恢复', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '工具库', exact: true }).click()

    const chip = page.locator('.chip').first()
    const name = (await chip.locator('.chip__name').textContent())?.trim() ?? ''
    expect(name.length).toBeGreaterThan(0)

    // —— 编辑：点名字打开同一个编辑窗口，改名后出现在气泡上 ——
    await chip.locator('.chip__name').click()
    const form = page.getByRole('dialog')
    await expect(form).toBeVisible()
    await form.locator('input[type="text"]').first().fill('测试改名工具')
    await form.getByRole('button', { name: '保存' }).click()
    await expect(page.locator('.chip__name', { hasText: '测试改名工具' })).toBeVisible()

    // —— 删除：编辑窗口里的删除入口 → 二次确认 → 从列表消失 ——
    await page.locator('.chip', { hasText: '测试改名工具' }).locator('.chip__name').click()
    await page.getByRole('dialog').getByRole('button', { name: '从工具库移除' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '从工具库移除' }).click()

    await expect(page.locator('.chip__name', { hasText: '测试改名工具' })).toHaveCount(0)

    // —— 恢复：一键把内置工具全部还原 ——
    await page.getByRole('button', { name: '恢复内置工具' }).click()
    await expect(page.locator('.chip__name', { hasText: name }).first()).toBeVisible()
  })

  test('存储面板展示用量与统计', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '数据与存储', exact: true }).click()

    await expect(page.getByRole('progressbar')).toBeVisible()
    // 项目数应为 1
    await expect(page.locator('.counts__value').first()).toHaveText('1')
  })

  test('清空所有数据需要输入确认文字', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '数据与存储', exact: true }).click()
    await page.getByRole('button', { name: '清空所有数据' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()

    // 未输入确认文字时按钮禁用
    const confirmButton = dialog.getByRole('button', { name: '清空所有数据' })
    await expect(confirmButton).toBeDisabled()

    await dialog.locator('input[type="text"]').fill('DELETE')
    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()

    // 清空后回到空状态（路由会被带回 /compare）
    await expect(page.getByRole('heading', { name: '从一次对比开始' })).toBeVisible()
    await expect(page.getByRole('complementary').getByText('共 0 个项目')).toBeVisible()
  })
})
