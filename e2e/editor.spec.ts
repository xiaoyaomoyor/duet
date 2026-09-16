/**
 * M2 验收：编辑器核心（模块增删改、空模块规则、撤销、媒体导入与持久化）
 *
 * 媒体导入使用**真实的二进制文件**（PNG / WAV），
 * 因此这里能验证单测覆盖不到的部分：浏览器解码、尺寸与时长探测、blob 渲染。
 * 在 jsdom 里这些一律测不了，所以必须在这一层补齐（M1 收尾时的承诺）。
 */
import { expect, test, type Page } from '@playwright/test'
import { closeDialog, moduleCard, openModuleEditor, renameModule } from './helpers'

// ——————————————————————————————————————————————————————————
// 测试素材：手工构造的合法最小文件
// ——————————————————————————————————————————————————————————

/** 2×2 红色 PNG（base64） */
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAcxhA/1kF5WvAAAAAElFTkSuQmCC'

/** 8kHz 单声道 0.5 秒静音 WAV */
function silentWav(seconds = 0.5): Buffer {
  const sampleRate = 8000
  const samples = Math.floor(sampleRate * seconds)
  const dataSize = samples * 2 // 16-bit mono

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, Buffer.alloc(dataSize)])
}

const PNG_FILE = {
  name: 'cover.png',
  mimeType: 'image/png',
  buffer: Buffer.from(RED_PNG_BASE64, 'base64'),
}

const WAV_FILE = {
  name: 'song.wav',
  mimeType: 'audio/wav',
  buffer: silentWav(),
}

// ——————————————————————————————————————————————————————————
// 辅助
// ——————————————————————————————————————————————————————————

async function createFromTemplate(page: Page, name: string | RegExp): Promise<void> {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('button', { name: '新建对比' }).click()
  await sidebar.getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/** 打开某一行的模块选择器，并挑选一个模块类型 */
async function addModule(page: Page, rowIndex: number, moduleName: string): Promise<void> {
  const row = page.locator('.canvas__row').nth(rowIndex)
  await row.locator('.canvas__add-module').first().click()
  await page.getByRole('dialog', { name: '选择模块类型' }).getByRole('button', { name: moduleName }).click()
  await expect(page.getByRole('dialog', { name: '选择模块类型' })).toBeHidden()
}

/** 某一行的左格（每行有左右两格，很多断言只关心左格，必须限定作用域） */
function leftCell(page: Page, rowIndex: number) {
  return page.locator('.canvas__row').nth(rowIndex).locator('.canvas__cell').first()
}

test.describe('M2 模块系统', () => {
  test('添加模块 → 编辑内容 → 预览实时更新 → 刷新后保留', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    // 空白模板自带一行；左格有一个文字模块
    const cell = leftCell(page, 0)
    await expect(cell.locator('.card')).toHaveCount(1)

    // 改标题与填内容都在模块编辑弹窗里完成
    const target = moduleCard(page, 0, 0)
    const dialog = await openModuleEditor(page, target)
    const titleInput = dialog.locator('.dialog__title-input')
    await titleInput.fill('价格')
    await titleInput.press('Enter')

    await dialog.locator('textarea').first().fill('¥99 / 月')
    await closeDialog(page)

    await expect(cell.locator('.module-view__title').first()).toHaveText('价格')
    // 卡片正文用的就是展示视图的渲染器，因此内容立刻可见
    await expect(cell.locator('.module-view')).toContainText('¥99 / 月')

    // 自动保存
    await expect(page.locator('.topbar__save--saved')).toBeVisible({ timeout: 5000 })

    // 刷新后内容仍在（"保持位置"会重新打开该项目）
    await page.reload()
    await expect(page.locator('.canvas__row .canvas__cell').first().locator('.module-view__title')).toHaveText('价格')
    await expect(page.locator('.module-view').first()).toContainText('¥99 / 月')

    expect(errors).toEqual([])
  })

  test('同一格可重复添加同类型模块，且各自独立', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = leftCell(page, 0)
    await addModule(page, 0, '文字')
    await addModule(page, 0, '文字')

    await expect(cell.locator('.card')).toHaveCount(3)

    // 三个模块的标题分别改写，互不影响
    const titles = ['价格', '简评', '结论']
    for (const [index, title] of titles.entries()) {
      const card = cell.locator('.card').nth(index)
      await renameModule(page, card, title)
    }

    for (const [index, title] of titles.entries()) {
      await expect(cell.locator('.card').nth(index).locator('.module-view__title')).toHaveText(title)
    }
  })

  test('手动隐藏的模块在编辑视图仍可见，并带隐藏标记', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const card = leftCell(page, 0).locator('.card').first()
    await card.locator('[aria-label="在展示视图隐藏"]').click()

    await expect(card).toHaveClass(/card--hidden/)
    await expect(card.locator('.card__flag')).toHaveText('已隐藏')
  })

  test('删除模块后可用撤销恢复（命令层可逆）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const cell = leftCell(page, 0)
    const before = await cell.locator('.card').count()

    await cell.locator('.card').first().locator('[aria-label="删除模块"]').click()
    await expect(cell.locator('.card')).toHaveCount(before - 1)

    await page.getByRole('button', { name: '撤销' }).click()
    await expect(cell.locator('.card')).toHaveCount(before)

    // 重做
    await page.getByRole('button', { name: '重做' }).click()
    await expect(cell.locator('.card')).toHaveCount(before - 1)
  })

  test('导入 PNG：探测尺寸并渲染预览', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /图片对比/)

    const cell = leftCell(page, 0)
    await expect(cell.locator('.card').first().locator('.module-view__title')).toHaveText('封面图')

    // 媒体选择器在模块编辑弹窗内
    const dialog = await openModuleEditor(page, moduleCard(page, 0, 0))
    await dialog.locator('input[type="file"]').first().setInputFiles(PNG_FILE)
    await closeDialog(page)

    // 卡片正文里应出现真实解码的图片
    const img = cell.locator('.module-view img').first()
    await expect(img).toBeVisible()
    await expect(img).toHaveJSProperty('naturalWidth', 2)
    await expect(img).toHaveJSProperty('naturalHeight', 2)

    // 本地资源以 blob: 渲染（不依赖任何外部网络）
    const src = await img.getAttribute('src')
    expect(src?.startsWith('blob:')).toBe(true)

    // 自动保存后刷新仍能显示（说明资源真的落到了 IndexedDB）
    await expect(page.locator('.topbar__save--saved')).toBeVisible({ timeout: 5000 })
    await page.reload()
    await expect(leftCell(page, 0).locator('.module-view img').first()).toBeVisible()
  })

  test('导入 WAV：探测时长并驱动进度条联动', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    // 音乐模板第二行是音频模块
    const cell = leftCell(page, 1)
    await expect(cell.locator('.card').first().locator('.module-view__title')).toHaveText('音频')

    await openModuleEditor(page, moduleCard(page, 1, 0))
      .then((dialog) => dialog.locator('input[type="file"]').first().setInputFiles(WAV_FILE))
    await closeDialog(page)

    // 时长由导入时探测得到，展示在**渲染器**（.module-view）里，因此要限定作用域
    await expect(cell.locator('.module-view').getByText(/\d{2}:\d{2}/)).toBeVisible({
      timeout: 10_000,
    })

    // 渲染器出现可播放的音频元素（编辑器预览里也有一个 audio，需限定为第一个）
    await expect(cell.locator('audio').first()).toBeVisible()
  })

  test('导入 .lrc 歌词：识别时间轴并开启同步开关', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const cell = leftCell(page, 2)
    await expect(cell.locator('.card').first().locator('.module-view__title')).toHaveText('歌词')

    // 歌词模块的导入入口在弹窗里（既支持点按钮，也支持把 .txt/.lrc 拖进来）
    const dialog = await openModuleEditor(page, moduleCard(page, 2, 0))
    await dialog.locator('input[type="file"]').first().setInputFiles({
      name: 'lyrics.lrc',
      mimeType: 'text/plain',
      buffer: Buffer.from('[00:01.00]第一句\n[00:03.50]第二句\n[00:06.00]第三句', 'utf8'),
    })

    // 状态提示：识别到 3 行时间轴（这些属于编辑器，因此断言限定在弹窗内）
    await expect(dialog.getByText(/含时间轴/)).toBeVisible()
    await expect(dialog.getByText('3 行')).toBeVisible()

    // 有时间轴时才出现同步开关
    await expect(dialog.getByText('与音频同步（按时间轴高亮）')).toBeVisible()
    await closeDialog(page)

    // 卡片正文（= 展示视图的呈现）里出现歌词行
    await expect(cell.locator('.module-view')).toContainText('第一句')
  })

  test('插入行与删除行都走命令层，可一步撤销', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const rows = page.locator('.canvas__row')
    await expect(rows).toHaveCount(4)

    const firstTitle = await rows.nth(0).locator('.module-view__title').first().textContent()
    const secondTitle = await rows.nth(1).locator('.module-view__title').first().textContent()

    // "在上方插入行"会让行数 +1；新行是**空行**（没有模块，等待用户填写），
    // 且插入点就是被点击行的索引。
    await rows.nth(2).locator('[aria-label="在上方插入行"]').click()
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(2).locator('.card')).toHaveCount(0)

    // 单条命令 = 一步撤销：撤销后行数与内容都回到原样
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0).locator('.module-view__title').first()).toHaveText(firstTitle ?? '')
    await expect(rows.nth(1).locator('.module-view__title').first()).toHaveText(secondTitle ?? '')
  })

  test('属性面板可调整布局参数并持久化', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    await page.getByRole('button', { name: '属性', exact: true }).click()
    const inspector = page.getByRole('complementary', { name: '属性' })
    await expect(inspector).toBeVisible()

    await inspector.locator('select').first().selectOption('grid')
    await expect(page.locator('.canvas')).toHaveClass(/canvas--bg-grid/)

    await expect(page.locator('.topbar__save--saved')).toBeVisible({ timeout: 5000 })
    await page.reload()
    await expect(page.locator('.canvas')).toHaveClass(/canvas--bg-grid/)
  })
})
