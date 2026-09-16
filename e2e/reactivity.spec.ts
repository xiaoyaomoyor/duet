/**
 * 输入焦点与模块内容响应性（回归用例）
 *
 * 这三条断言各自锁死一个踩过的坑，都必须长期保留：
 *
 * 1. **输入时焦点必须稳定**
 *    曾经为了强制刷新界面，把"内容指纹"并进模块卡片的 :key，
 *    结果每敲一个字就重建卡片 → 输入框失焦 → 只能输入一个字符。
 *    M6 把编辑器搬进了弹窗，这条约束**同样成立**：
 *    弹窗若被内容指纹重建，输入框一样会失焦。
 *
 * 2. **导入媒体后编辑视图必须立刻显示**
 *    模块的 editor / renderer 曾在 setup 时用
 *    `const data = props.module.data` 抓**快照**，store 换掉模块对象后
 *    子组件仍指向旧对象，表现为"数据已保存、界面不变、刷新后才正常"。
 *    正确写法是用 computed 读取（见 CoverRenderer 的注释）。
 */
import { expect, test } from '@playwright/test'
import { addedCard, createFromTemplate, moduleCard, openModuleEditor } from './helpers'

const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAcxhA/1kF5WvAAAAAElFTkSuQmCC'

const PNG_FILE = {
  name: 'cover.png',
  mimeType: 'image/png',
  buffer: Buffer.from(RED_PNG_BASE64, 'base64'),
}

test.describe('M2 回归：焦点稳定性与内容响应性', () => {
  test('逐字符输入时焦点保持在同一个输入框', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const dialog = await openModuleEditor(page, addedCard(page, 0))
    const textarea = dialog.locator('textarea').first()
    await textarea.click()
    await textarea.pressSequentially('价格对比', { delay: 50 })

    const state = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement | null
      return { isActive: document.activeElement === el, value: el?.value ?? '' }
    })

    expect(state.isActive, '输入过程中输入框失焦——多半是 :key 里混入了内容指纹').toBe(true)
    expect(state.value).toBe('价格对比')
  })

  test('导入图片后，编辑视图内立刻出现预览（无需刷新）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /图片对比/)

    // 媒体选择器现在位于模块编辑弹窗内
    const target = moduleCard(page, 0, 0)
    const dialog = await openModuleEditor(page, target)
    await dialog.locator('input[type="file"]').first().setInputFiles(PNG_FILE)

    // 关键：不刷新页面，直接断言卡片正文出现图片
    const img = target.locator('.module-view img').first()
    await expect(img).toBeVisible({ timeout: 5000 })
    await expect(img).toHaveJSProperty('naturalWidth', 2)
  })

  test('同一会话内连续替换媒体都能立刻反映', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /图片对比/)

    const target = moduleCard(page, 0, 0)
    const dialog = await openModuleEditor(page, target)
    const input = dialog.locator('input[type="file"]').first()

    await input.setInputFiles(PNG_FILE)
    const firstSrc = await target.locator('.module-view img').first().getAttribute('src')
    expect(firstSrc?.startsWith('blob:')).toBe(true)

    // 换一张不同内容的图片（改用 1×1 透明 PNG），src 必须变化
    await input.setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    })

    await expect
      .poll(async () => target.locator('.module-view img').first().getAttribute('src'), {
        timeout: 5000,
      })
      .not.toBe(firstSrc)
  })
})
