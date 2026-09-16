/**
 * M4 验收：同步播放控制栏与动效开关
 *
 * 说明：真正的"两侧起播是否对齐"已经由 audioSync.spec.ts 用假的
 * AudioContext 精确验证过（单测能断言到毫秒级）。这里验证的是
 * **接线是否正确**——控制栏该出现时出现、该降级时说明原因、
 * 动效开关是否真的关掉了动效。
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
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
  await page.getByRole('complementary').getByRole('button', { name: '新建对比' }).click()
  await page.getByRole('main').getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/**
 * 加一个「音频控制台」通用模块。
 *
 * M7 起同步控制栏**不再自动出现**（用户的选择是"完全手动"）：
 * 它现在是一块普通内容，横跨两栏、可以排序、可以改标题、能随项目一起导出。
 * 因此每个需要控制栏的用例都必须自己把它加上——这也顺带覆盖了
 * "通用模块行"这条新路径：行标题的 ＋ → 只列通用模块的选择器 → 建出一整行。
 */
async function addAudioConsole(page: Page): Promise<void> {
  const picker = page.getByRole('dialog', { name: '选择模块类型' })
  await page
    .locator('.canvas__row')
    .last()
    .locator('[aria-label="在下方添加通用模块（横跨两栏）"]')
    .click()
  await picker.getByRole('button', { name: '音频控制台' }).click()
  await expect(picker).toBeHidden()
}

/**
 * 等某一行的音频真正就绪（元数据到位）。
 *
 * 为什么不再用 `toBeVisible()`：M9 起音频元素是 `display:none` 的
 * （原生控件被自研播放条取代），但它仍然是真正发声的那个元素。
 * "可见"因此不再是"就绪"的正确判据——判据应该是 `readyState >= 1`，
 * 那也正是同步引擎需要的条件（durationMs > 0）。
 */
async function waitAudioReady(row: Locator): Promise<void> {
  const audio = row.locator('audio').first()
  await expect(audio).toBeAttached({ timeout: 10_000 })
  await audio.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const element = el as HTMLAudioElement
        if (element.readyState >= 1) {
          resolve()
          return
        }
        element.addEventListener('loadedmetadata', () => resolve(), { once: true })
      }),
  )
}

/**
 * 音乐模板第二行是音频模块；给左右两格各导入一段音频。
 *
 * 走共享的 importMedia：它会等导入真正完成再关弹窗
 * （立刻关窗会把 MediaPicker 卸载在异步导入中途，且不报错）。
 */
async function importBothTracks(page: Page): Promise<void> {
  // 先加控制台：它插在**最后一行之后**，因此不会挪动下面按索引定位的音频行
  await addAudioConsole(page)

  const row = page.locator('.canvas__row').nth(1)

  await importMedia(page, row.locator('.canvas__cell').nth(0).locator('.card').first(), WAV_A)
  await importMedia(page, row.locator('.canvas__cell').nth(1).locator('.card').first(), WAV_B)

  // 等两侧都完成元数据探测（时长 > 0 才会出现控制栏）
  await waitAudioReady(row)
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

  /**
   * 回归：音频模块自研播放条的进度必须能用鼠标拖动。
   *
   * 这条来自实测反馈"进度条拨不动"。排查过程中踩到的第一个坑很值得记下来：
   * 探针最初没把元素滚进视口就去算坐标，`elementFromPoint` 返回 null，
   * 于是拖拽事件根本没落到元素上——**假阳性**，看起来就像"拨不动"。
   * 因此这个用例显式 `scrollIntoViewIfNeeded`，并把"拖完之后音频的
   * currentTime 真的变了"作为判据（而不是只看 input.value）。
   */
  test('音频播放条的进度可以用鼠标拖动定位', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const row = page.locator('.canvas__row').nth(1)
    const cell = row.locator('.canvas__cell').first()
    await importMedia(page, cell.locator('.card').first(), WAV_A)
    await waitAudioReady(row)

    const seek = cell.locator('.player__seek')
    await seek.scrollIntoViewIfNeeded()
    await expect(seek).toBeVisible()

    const box = await seek.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    // 从 20% 拖到 80%
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width * 0.2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 })
    await page.mouse.up()

    // 判据是"音频真的跳到了后半段"，而不是"输入框的值变了"——
    // 只改输入框、没改播放位置，对用户来说依然是"拨不动"
    await expect
      .poll(() => row.locator('audio').first().evaluate((el) => (el as HTMLAudioElement).currentTime), {
        timeout: 5000,
      })
      .toBeGreaterThan(1)
  })

  test('只有一侧有音频时不显示控制栏（没有"双轨"可言）', async ({ page }) => {    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)

    const row = page.locator('.canvas__row').nth(1)
    await importMedia(page, row.locator('.canvas__cell').nth(0).locator('.card').first(), WAV_A)
    await waitAudioReady(row)
    await page.waitForTimeout(800)

    await expect(page.locator('.syncbar')).toHaveCount(0)
  })

  /**
   * M8 聚光灯：「色彩弱化」。
   *
   * 为什么必须在**展示视图里**按播放：进入展示视图会重新挂载整块画布
   * （编辑态那份不渲染），音频元素是新的、播放状态自然归零。
   * 真实用法也正是这样——用户在展示视图里点某一侧的播放键试听。
   */
  test('聚光灯：只有一侧在播放时，另一侧在展示视图被弱化', async ({ page }) => {
    await page.goto('/')
    await createFromTemplate(page, /音乐对比/)
    await importBothTracks(page)

    // 先把聚光灯调到「色彩弱化」（面板只在编辑态出现，所以要提前设好）
    await page.getByRole('button', { name: '对比配置', exact: true }).click()
    await page.getByRole('radio', { name: '色彩弱化' }).click()

    await page.getByRole('button', { name: '进入展示视图' }).click()
    await expect(page.locator('.present')).toBeVisible()

    const root = page.locator('[data-present-root]')
    const dimmed = root.locator('.row__cell--dimmed')
    // 还没播放时两侧应当完全一样
    await expect(dimmed).toHaveCount(0)

    // 只让左侧那一条音轨播放（原生控件，直接调 play 即可；
    // 此时页面上早已有过大量用户交互，Chromium 的自动播放策略会放行）
    await root.locator('audio').first().evaluate((el) => (el as HTMLAudioElement).play())

    await expect(dimmed.first()).toBeVisible({ timeout: 10_000 })
    // 被弱化的只应当是一部分格子，而不是整页
    const total = await root.locator('.row__cell').count()
    expect(await dimmed.count()).toBeLessThan(total)
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

    /*
     * M7 起控制栏是**画布里的一个通用模块行**（不再吸在画布上方），
     * 因此它理所当然会出现在展示视图里——而且必须能出现在成稿里，
     * 这也正是"完全手动"这个选择的意义所在。
     */
    await page.getByRole('button', { name: '进入展示视图' }).click()
    await expect(page.locator('.present')).toBeVisible()
    await expect(page.locator('[data-present-root] .syncbar')).toBeVisible()

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
    await page.getByRole('link', { name: '设置' }).click()
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

    await page.getByRole('link', { name: '设置' }).click()
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
