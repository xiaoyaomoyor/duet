/**
 * M4 验收：同步播放控制栏与动效开关
 *
 * 说明：真正的"两侧起播是否对齐"已经由 audioSync.spec.ts 用假的
 * AudioContext 精确验证过（单测能断言到毫秒级）。这里验证的是
 * **接线是否正确**——控制栏该出现时出现、该降级时说明原因、
 * 动效开关是否真的关掉了动效。
 */
import { expect, test, type Page } from '@playwright/test'
import { fillModuleText, importMedia } from './helpers'

/** 生成一段指定时长的静音 WAV（8kHz 单声道 16bit） */
function silentWav(seconds: number): Buffer {
  const sampleRate = 8000
  const samples = Math.floor(sampleRate * seconds)
  const dataSize = samples * 2

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, Buffer.alloc(dataSize)])
}

const WAV_A = { name: 'a.wav', mimeType: 'audio/wav', buffer: silentWav(1.5) }
const WAV_B = { name: 'b.wav', mimeType: 'audio/wav', buffer: silentWav(2.5) }

async function createFromTemplate(page: Page, name: RegExp): Promise<void> {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('button', { name: '新建对比' }).click()
  await sidebar.getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/**
 * 音乐模板第二行是音频模块；给左右两格各导入一段音频。
 *
 * 走共享的 importMedia：它会等导入真正完成再关弹窗
 * （立刻关窗会把 MediaPicker 卸载在异步导入中途，且不报错）。
 */
async function importBothTracks(page: Page): Promise<void> {
  const row = page.locator('.canvas__row').nth(1)

  await importMedia(page, row.locator('.canvas__cell').nth(0).locator('.card').first(), WAV_A)
  await importMedia(page, row.locator('.canvas__cell').nth(1).locator('.card').first(), WAV_B)

  // 等两侧都完成元数据探测（时长 > 0 才会出现控制栏）
  await expect(row.locator('audio').first()).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1200)
}

/**
 * 从设置页回到对比界面。
 *
 * 用 data-testid 而不是可访问名：顶栏品牌链接的可访问名由
 * "对奏 + DUET + 图标 aria-label" 拼成，按名字匹配很脆弱；
 * 而按文字匹配"对比"会误命中侧栏的「音乐对比 / 图片对比」模板卡。
 */
async function backToCompare(page: Page): Promise<void> {
  await page.getByTestId('nav-compare').click()
  await expect(page.locator('.canvas')).toBeVisible()
}

test.describe('M4 同步播放', () => {
  test('两侧都有音频时出现同步控制栏', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await importBothTracks(page)

    await expect(page.locator('.syncbar').first()).toBeVisible()
    // 关键控件齐备
    await expect(page.getByRole('button', { name: '同步播放' })).toBeVisible()
    await expect(page.locator('.syncbar__seek').first()).toBeVisible()
    // 漂移值对用户可见
    await expect(page.locator('.syncbar__drift').first()).toBeVisible()
  })

  test('只有一侧有音频时不显示控制栏（没有"双轨"可言）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const row = page.locator('.canvas__row').nth(1)
    await importMedia(page, row.locator('.canvas__cell').nth(0).locator('.card').first(), WAV_A)
    await expect(row.locator('audio').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(800)

    await expect(page.locator('.syncbar')).toHaveCount(0)
  })

  test('Solo 与静音按钮可切换且状态可见', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await importBothTracks(page)

    const soloA = page.getByRole('button', { name: '独听 A' })
    await expect(soloA).toBeVisible({ timeout: 10_000 })

    await expect(soloA).toHaveAttribute('aria-pressed', 'false')
    await soloA.click()
    await expect(soloA).toHaveAttribute('aria-pressed', 'true')

    // 再点一次取消
    await soloA.click()
    await expect(soloA).toHaveAttribute('aria-pressed', 'false')
  })

  test('高级选项可展开，且不报错', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await importBothTracks(page)

    await page.getByRole('button', { name: '高级' }).click()
    // 偏移量输入框与主轨按钮出现
    await expect(page.locator('.syncbar__number').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /设为主轨/ }).first()).toBeVisible()
  })

  test('控制栏在展示视图下也随画布一起工作', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await importBothTracks(page)

    // 控制栏位于画布上方，属于主内容区；展示视图是独立遮罩层
    // 这里只验证进入/退出展示视图不会让控制栏或页面出错
    await page.getByRole('button', { name: '进入展示视图' }).click()
    await expect(page.locator('.present')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.present')).toBeHidden()
    await expect(page.locator('.canvas')).toBeVisible()
  })
})

test.describe('M4 动效开关', () => {
  test('开启"始终开启"时展示态模块带有入场动效类', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await fillModuleText(page, cell, '动效测试')
    await expect(cell.locator('.module-view')).toContainText('动效测试')

    // 设置：动效始终开启
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.locator('select').first().selectOption('never')
    await backToCompare(page)

    await page.getByRole('button', { name: '进入展示视图' }).click()
    const module = page.locator('[data-present-root] .row__module').first()
    await expect(module).toHaveClass(/anim-enter-up/)
  })

  test('关闭动效时进入展示视图仍然正常（只是没有位移）', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /空白对比/)

    const cell = page.locator('.canvas__row').first().locator('.canvas__cell').first()
    await fillModuleText(page, cell, '关闭动效')

    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.locator('select').first().selectOption('always')
    await backToCompare(page)

    await page.getByRole('button', { name: '进入展示视图' }).click()
    const root = page.locator('[data-present-root]')
    // 内容仍然可见（动效关闭不等于内容隐藏）
    await expect(root).toContainText('关闭动效')

    // 动效时长被压缩到 1ms：检查 CSS 变量确实生效
    const duration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--dur-slower').trim(),
    )
    expect(duration).toBe('1ms')
  })
})
