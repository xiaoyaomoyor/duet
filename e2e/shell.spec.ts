import { expect, test } from '@playwright/test'

/**
 * M0 验收：应用外壳可启动、主题非空白、双语文案可切换。
 *
 * 对应施工文档 §16.2 主旅程的前置条件（后续里程碑会在此基础上追加
 * 「编辑 → 展示 → 导出」全链路用例）。
 */

test.describe('应用外壳（M0）', () => {
  test('冷启动按系统偏好落到具体主题，且无控制台错误', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')

    // 品牌区
    await expect(page.getByText('对奏', { exact: true })).toBeVisible()
    await expect(page.getByText('Duet', { exact: true })).toBeVisible()

    /*
     * 主题默认是"跟随系统"，而 <html data-theme> 上落的永远是**解析后**的
     * 具体主题（CSS 不认识"系统"这个概念）。
     * Playwright 默认报告 prefers-color-scheme: light，因此这里应该是 light。
     * 关键断言是"它是具体主题之一、而不是 system 本身"。
     */
    const html = page.locator('html')
    const resolved = await html.getAttribute('data-theme')
    expect(['dark', 'light', 'violet-dark']).toContain(resolved)
    expect(resolved).toBe('light')

    await expect(html).toHaveAttribute('lang', 'zh-CN')

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(background).not.toBe('rgba(0, 0, 0, 0)')

    // 空状态与模板卡片
    // 注意：侧栏与主区各有一组模板卡片，断言必须限定在 <main> 内，否则会撞上 strict mode
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { name: '从一场演示开始' })).toBeVisible()
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

    await page.getByRole('link', { name: '设置' }).click()
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

    const settingsButton = page.getByRole('link', { name: '设置' })
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
