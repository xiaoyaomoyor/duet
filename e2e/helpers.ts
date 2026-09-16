/**
 * E2E 共享助手
 *
 * 为什么集中在文件里：
 *   卡片改成"呈现即最终效果 + 编辑弹窗"之后，几乎所有涉及"改内容"的用例
 *   都要先打开弹窗再操作。如果每个 spec 各写一遍，
 *   下次再调交互就得改五个文件——这里写一次即可。
 *
 * 契约类名（改动必须同步这里与组件）：
 *   .canvas__row / .canvas__cell / .canvas__add-module  画布结构
 *   .module-view / .module-view__title                  模块呈现（编辑与展示共用）
 *   .dialog__title-input                                模块编辑弹窗的标题输入
 *   .card__actions                                      卡片右上角操作区
 */
import { expect, type Locator, type Page } from '@playwright/test'

/**
 * 从模板新建一个对比。
 *
 * M7 起流程变了：侧栏的 ＋ 不再就地展开一个小列表，
 * 而是把主区切回"从一次对比开始"（模板画廊），模板卡片只在**主区**渲染。
 * 这让本助手反而更简单了——以前得把选择器限定在 <aside> 里，
 * 否则会同时命中侧栏和主区两组同名卡片（strict mode 报错）。
 */
export async function createFromTemplate(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('complementary').getByRole('button', { name: '新建对比' }).click()
  await page.getByRole('main').getByRole('button', { name }).click()
  await expect(page.locator('.canvas')).toBeVisible()
}

/** 某一行的左格 */
export function leftCell(page: Page, rowIndex: number): Locator {
  return page.locator('.canvas__row').nth(rowIndex).locator('.canvas__cell').first()
}

/**
 * 某一格里的第 n 张卡片。
 *
 * 注意模板预置了模块，所以"新加的那个"通常是 `.last()`——直接写 `.card`
 * 会命中多张并触发 strict mode 报错。
 *
 * 名字刻意叫 moduleCard 而不是 card：后者几乎肯定会和用例里的
 * 局部变量重名，读代码时容易看错。
 */
export function moduleCard(page: Page, rowIndex: number, index: number): Locator {
  return leftCell(page, rowIndex).locator('.card').nth(index)
}

/** 刚添加的卡片（格子里的最后一张） */
export function addedCard(page: Page, rowIndex = 0): Locator {
  return leftCell(page, rowIndex).locator('.card').last()
}

/** 打开某一行的模块选择器并挑一个模块类型 */
export async function addModule(page: Page, rowIndex: number, moduleName: string): Promise<void> {
  const row = page.locator('.canvas__row').nth(rowIndex)
  await row.locator('.canvas__add-module').first().click()
  await page
    .getByRole('dialog', { name: '选择模块类型' })
    .getByRole('button', { name: moduleName })
    .click()
  await expect(page.getByRole('dialog', { name: '选择模块类型' })).toBeHidden()
}

/** 打开某张卡片的模块编辑弹窗，返回弹窗 locator */
export async function openModuleEditor(page: Page, target: Locator): Promise<Locator> {
  // 操作按钮默认透明、悬浮才显形；Playwright 的 click 会先移动鼠标，
  // 但显式 hover 一次更稳（透明度动画需要一帧）
  await target.hover()
  await target.getByRole('button', { name: '编辑模块' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * 关闭当前打开的弹窗。
 *
 * 优先点"完成"按钮而不是按 Esc：这更接近真实用户的操作，
 * 也顺带验证了底部主按钮真的可用（曾出现过弹窗只能用 Esc 关的情况）。
 */
export async function closeDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '完成' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * 在模块编辑弹窗里执行一段编辑操作，完成后关闭。
 *
 * 比"专用助手"更通用：像「代码对比」这种一个弹窗里有多个输入框的模块，
 * 用它可以一次把操作写清楚，不必为每种模块各造一个函数。
 */
export async function editModule(
  page: Page,
  target: Locator,
  edit: (dialog: Locator) => Promise<void>,
): Promise<void> {
  const dialog = await openModuleEditor(page, target)
  await edit(dialog)
  await closeDialog(page)
}

/**
 * 改模块正文：打开弹窗 → 填第一个 textarea → 关闭。
 *
 * 这是最高频的组合，单独抽出来可以让绝大多数既有用例
 * 只改一行就继续成立。
 */
export async function fillModuleText(page: Page, target: Locator, value: string): Promise<void> {
  await editModule(page, target, async (dialog) => {
    await dialog.locator('textarea').first().fill(value)
  })
}

/** 改模块标题：打开弹窗 → 填标题 → 关闭 */
export async function renameModule(page: Page, target: Locator, title: string): Promise<void> {
  const dialog = await openModuleEditor(page, target)
  const input = dialog.locator('.dialog__title-input')
  await input.fill(title)
  await input.press('Enter')
  await closeDialog(page)
}

/**
 * 等待自动保存完成。
 *
 * M7 起保存状态从顶栏搬到了**对比页工具条**（.compare-toolbar__save），
 * 因为它描述的是"当前这份对比存没存"，跟着对比页走才对。
 */
export async function waitSaved(page: Page, timeout = 5000): Promise<void> {
  await expect(page.locator('.compare-toolbar__save--saved')).toBeVisible({ timeout })
}

/** setInputFiles 能接受的载荷 */
export interface FilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * 通过模块编辑弹窗导入媒体。
 *
 * ⚠️ 必须等导入**真正完成**再关弹窗。
 *   `setInputFiles` 只保证"change 事件已派发"，而导入是异步的
 *   （读文件 → 内容哈希 → 探测尺寸/时长 → 落库 → 回写模块数据）。
 *   紧接着关窗会把 MediaPicker 卸载在这次异步流程的中途，
 *   结果是"文件选了、内容没进来"，而且**不报任何错**——
 *   在 E2E 里表现为后续断言莫名找不到元素，极难定位。
 *
 *   完成信号用"选择器里出现了 blob: 预览"：
 *   blob URL 只有在资源已落库、并被 useResolvedMedia 解析出来之后才存在，
 *   因此它比"等固定毫秒数"可靠，也同时适用于图片 / 音频 / 视频。
 */
export async function importMedia(
  page: Page,
  target: Locator,
  file: FilePayload,
): Promise<void> {
  const dialog = await openModuleEditor(page, target)
  await dialog.locator('input[type="file"]').first().setInputFiles(file)

  await expect(
    dialog.locator('audio, video, img[src^="blob:"]').first(),
    '导入未完成：选择器里始终没有出现媒体预览',
  ).toBeVisible({ timeout: 15_000 })

  await closeDialog(page)
}
