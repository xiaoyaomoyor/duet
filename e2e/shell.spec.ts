import { expect, test } from '@playwright/test'

/**
 * M0 验收：应用外壳可启动、主题非空白、双语文案可切换。
 *
 * 对应施工文档 §16.2 主旅程的前置条件（后续里程碑会在此基础上追加
 * 「编辑 → 展示 → 导出」全链路用例）。
 */

test.describe('应用外壳（M0）', () => {
  test('冷启动渲染紫夜主题且无控制台错误', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')

    // 品牌区
    await expect(page.getByText('对奏', { exact: true })).toBeVisible()
    await expect(page.getByText('Duet', { exact: true })).toBeVisible()

    // 主题已落到 <html>，且底色确实是深紫而非默认白
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'violet-dark')
    await expect(html).toHaveAttribute('data-platform', 'web')
    await expect(html).toHaveAttribute('lang', 'zh-CN')

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    )
    expect(background).not.toBe('rgba(0, 0, 0, 0)')
    expect(background).not.toBe('rgb(255, 255, 255)')

    // 空状态与模板卡片
    // 注意：侧栏与主区各有一组模板卡片，断言必须限定在 <main> 内，否则会撞上 strict mode
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { name: '从一次对比开始' })).toBeVisible()
    await expect(main.getByRole('button', { name: /音乐对比/ })).toBeVisible()
    await expect(main.getByRole('button', { name: /空白对比/ })).toBeVisible()

    // 三个主区都在
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(main).toBeVisible()
    await expect(page.getByRole('complementary')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('切换到设置界面并改动语言即时生效', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: '设置' }).click()
    await expect(page.getByRole('heading', { name: '设置', level: 2 })).toBeVisible()

    // 语言面板 → English
    await page.getByRole('button', { name: '语言' }).click()
    await page.getByRole('button', { name: 'English' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible()

    // 刷新后语言保持（设置已落 IndexedDB）
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  })

  test('侧栏折叠开关生效', async ({ page }) => {
    await page.goto('/')

    const shell = page.locator('.shell')
    await expect(shell).not.toHaveClass(/shell--compact/)

    await page.getByRole('button', { name: /折叠/ }).click()
    await expect(shell).toHaveClass(/shell--compact/)
  })

  test('无障碍基线：键盘可达设置入口且焦点可见', async ({ page }) => {
    await page.goto('/')

    const settingsButton = page.getByRole('button', { name: '设置' })
    await settingsButton.focus()
    await expect(settingsButton).toBeFocused()

    const outline = await settingsButton.evaluate((el) => {
      const style = getComputedStyle(el)
      return `${style.outlineStyle} ${style.outlineWidth}`
    })
    expect(outline).not.toContain('none')
    expect(outline).not.toContain('0px')
  })
})
