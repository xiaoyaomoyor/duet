import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { multiFixture } from './fixtures/multi'
import { importFixture } from './fixtures/studio'
import { readZip } from '../src/lib/zip'

test('R5 presets inherit, reset, persist and share without content', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await importFixture(page, multiFixture(2))
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  await page.getByRole('button', { name: '外观与版式', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '外观与版式' }),
    scene = page.locator('.project-scene:visible')
  await panel.getByRole('button', { name: '纸上评测', exact: true }).click()
  await expect(scene).toHaveAttribute('data-design-theme', 'paper')
  await expect(scene).toHaveAttribute('data-media-layout', 'sleeve')
  await panel.getByRole('button', { name: '场景覆盖', exact: true }).click()
  await panel.getByLabel('强调色', { exact: true }).selectOption('blue')
  await expect(scene).toHaveAttribute('data-palette', 'blue')
  await panel.getByLabel('明暗', { exact: true }).selectOption('ink')
  await expect(scene).toHaveAttribute('data-design-theme', 'ink')
  await panel.getByRole('button', { name: '恢复项目外观', exact: true }).click()
  await expect(scene).toHaveAttribute('data-design-theme', 'paper')
  await expect(scene).toHaveAttribute('data-palette', 'amber')
  await panel.getByRole('button', { name: '项目默认', exact: true }).click()
  await panel.getByLabel('预设名称', { exact: true }).fill('我的冷调评测')
  await panel.getByRole('button', { name: '冷调放映', exact: true }).click()
  await panel.getByRole('button', { name: '保存当前外观', exact: true }).click()
  await expect(panel.getByRole('button', { name: '我的冷调评测', exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出外观', exact: true }).click()
  const path = info.outputPath('look.duetstyle')
  await (await download).saveAs(path)
  const style = JSON.parse(await readFile(path, 'utf8'))
  expect(Object.keys(style)).toEqual(['$format', 'version', 'name', 'appearance'])
  expect(JSON.stringify(style)).not.toMatch(/Suno|assetId|case-six|回声|Take A/)
  await expect(page.locator('.studio__project small')).toHaveText('已保存')
  await page.reload()
  await page.locator('.studio__outline button').filter({ hasText: '作品试听' }).click()
  await expect(scene).toHaveAttribute('data-palette', 'blue')
  await page.getByRole('button', { name: '外观与版式', exact: true }).click()
  await panel.getByRole('button', { name: '删除预设 我的冷调评测', exact: true }).click()
  await expect(panel.getByRole('button', { name: '我的冷调评测', exact: true })).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-palette', 'blue')
  await panel.locator('input[type=file]').setInputFiles(path)
  await expect(panel.getByRole('button', { name: '我的冷调评测', exact: true })).toBeVisible()
})

test('R5 offline HTML preserves scene art direction and sample playback', async ({
  page,
  context,
}, info) => {
  const p = multiFixture(2)
  p.appearance = { theme: 'paper', typography: 'editorial', mediaLayout: 'sleeve' }
  p.comparison!.scenes[0]!.appearance = {
    theme: 'ink',
    palette: 'blue',
    showBrand: false,
    titleAlign: 'center',
  }
  await importFixture(page, p)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /只读网页/ })
    .click()
  const file = info.outputPath('styled.html')
  await (await download).saveAs(file)
  const offline = await context.newPage()
  await offline.goto(pathToFileURL(file).href)
  const scene = offline.locator('.project-scene:visible')
  await expect(scene).toHaveAttribute('data-palette', 'blue')
  await expect(scene).toHaveAttribute('data-design-theme', 'ink')
  await expect(scene.locator('.stage-frame__brand')).toHaveCount(0)
  await expect(scene.locator('.stage-frame__title')).toHaveCSS('text-align', 'center')
  await expect(scene.locator('.stage-frame')).toHaveCSS('color', 'rgb(238, 234, 226)')
  await offline.getByLabel('A 作品', { exact: true }).selectOption('a-two')
  await scene
    .locator('audio')
    .first()
    .evaluate(async (el) => el.play())
  await expect
    .poll(() =>
      scene
        .locator('audio')
        .first()
        .evaluate((el) => el.paused),
    )
    .toBe(false)
  await offline.getByLabel('演示场景', { exact: true }).selectOption('1')
  await expect(scene).toHaveAttribute('data-design-theme', 'paper')
  await expect(scene).toHaveAttribute('data-typography', 'editorial')
})

test('R5 paginated PNG ZIP contains bounded, distinct nonempty pages', async ({ page }, info) => {
  const p = multiFixture(2),
    art = await readFile('public/showcase/amber.svg'),
    id = 'r5-png-cover'
  for (const entry of Object.values(p.comparison!.cases[0]!.entries))
    for (const sample of entry.samples)
      Object.assign(sample.contentBySection.listen!.modules[0]!.data as object, {
        coverAssetId: id,
      })
  await page.goto('/')
  await page.locator('.gallery input[type=file]').setInputFiles({
    name: 'cover.duet',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        $format: 'duet-project',
        schemaVersion: 9,
        projects: [p],
        assets: [
          {
            id,
            kind: 'image',
            mime: 'image/svg+xml',
            name: 'amber.svg',
            size: art.length,
            createdAt: 1,
            embedded: true,
            data: 'data:image/svg+xml;base64,' + art.toString('base64'),
          },
        ],
      }),
    ),
  })
  await expect(page.locator('.studio')).toBeVisible()
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('图片按场景分页', { exact: true }).check()
  const download = page.waitForEvent('download', { timeout: 60000 })
  await page.getByRole('dialog').getByRole('button', { name: /长图/ }).click()
  const file = info.outputPath('pages.zip')
  await (await download).saveAs(file)
  const archive = await readZip(new Blob([await readFile(file)])),
    manifest = JSON.parse(await archive.get('manifest.json')!.text())
  expect(manifest.pages.length).toBeGreaterThan(2)
  const sizes = []
  for (const entry of manifest.pages) {
    const png = Buffer.from(await archive.get(entry.file)!.arrayBuffer())
    expect(png.toString('ascii', 1, 4)).toBe('PNG')
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20)
    expect(width).toBeLessThanOrEqual(8192)
    expect(height).toBeLessThanOrEqual(8192)
    expect(width * height).toBeLessThanOrEqual(16_000_000)
    expect(png.length).toBeGreaterThan(5000)
    sizes.push(png.length)
    const colors = await page.evaluate(async (base64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + base64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 144
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, 256, 144)
      const data = ctx.getImageData(0, 0, 256, 144).data,
        unique = new Set()
      for (let i = 0; i < data.length; i += 4)
        unique.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2])
      return unique.size
    }, png.toString('base64'))
    expect(colors).toBeGreaterThan(30)
  }
  expect(new Set(sizes).size).toBeGreaterThan(2)
})

test('R5 oversized reports paginate automatically without reducing scale', async ({
  page,
}, info) => {
  test.setTimeout(90000)
  const p = multiFixture(2)
  for (const entry of Object.values(p.comparison!.cases[0]!.entries))
    for (const sample of entry.samples)
      for (const m of sample.contentBySection.notes!.modules)
        if (m.type === 'text')
          m.data = {
            text: Array.from(
              { length: 180 },
              (_, i) => `第 ${i + 1} 条观察：保留完整的中文长段落与比较证据。`,
            ).join('\n'),
            align: 'left',
          }
  await importFixture(page, p)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download', { timeout: 60000 })
  await page.getByRole('dialog').getByRole('button', { name: /长图/ }).click()
  const d = await download
  expect(d.suggestedFilename()).toMatch(/\.zip$/)
  const file = info.outputPath('long.zip')
  await d.saveAs(file)
  const archive = await readZip(new Blob([await readFile(file)])),
    manifest = JSON.parse(await archive.get('manifest.json')!.text())
  expect(manifest.scale).toBe(2)
  expect(manifest.pages.length).toBeGreaterThan(1)
  let previous = 0
  for (const entry of manifest.pages) {
    expect(entry.sourceTop).toBe(previous)
    previous += entry.height / manifest.scale
    expect(entry.height * manifest.width).toBeLessThanOrEqual(16_000_000)
  }
  expect(previous).toBeGreaterThan(4096)
  await expect(page.locator('body')).not.toHaveAttribute('data-exporting')
})

test('R5 complete bundle round trips inactive large media and blocks missing/external sources', async ({
  page,
  browser,
}, info) => {
  await importFixture(page, multiFixture(2))
  const result = await page.evaluate(async () => {
    const { assetInventory, exportProjectBundle, importProjectBundle } =
      await import('/src/services/projectBundle.ts')
    const { useProjectStore } = await import('/src/stores/useProjectStore.ts')
    const { putAsset } = await import('/src/db/assetsRepo.ts')
    const { readZip, createZip } = await import('/src/lib/zip.ts')
    const p = JSON.parse(JSON.stringify(useProjectStore().current)),
      id = 'r5-large-inactive'
    const original =
      p.comparison.cases[0].entries.a.samples[1].contentBySection.listen.modules[0].data
    const wav = await (await fetch(original.sourceUrl)).blob(),
      bytes = new Uint8Array(21 * 1024 * 1024)
    bytes.set(new Uint8Array(await wav.arrayBuffer()))
    const blob = new Blob([bytes], { type: 'audio/wav' })
    await putAsset({
      id,
      kind: 'audio',
      name: 'large.wav',
      mime: 'audio/wav',
      size: blob.size,
      createdAt: 1,
      blob,
    })
    p.comparison.cases[0].entries.a.samples[1].contentBySection.listen.modules[0].data = {
      name: 'large.wav',
      assetId: id,
    }
    p.appearance = { palette: 'blue' }
    const exported = await exportProjectBundle(p)
    if (!exported.ok) throw Error(exported.error)
    const imported = await importProjectBundle(exported.value)
    if (!imported.ok) throw Error(imported.error)
    const inv = await assetInventory(imported.value.projects[0])
    const archive = await readZip(exported.value),
      meta = JSON.parse(await archive.get('project.duet').text())
    meta.assets[0].size++
    archive.set('project.duet', new Blob([JSON.stringify(meta)]))
    const corrupted = await importProjectBundle(
      await createZip([...archive].map(([name, blob]) => ({ name, blob }))),
    )
    p.comparison.cases[0].entries.a.samples[1].contentBySection.listen.modules[0].data = {
      assetId: 'missing-r5',
    }
    const missing = await exportProjectBundle(p)
    p.comparison.cases[0].entries.a.samples[1].contentBySection.listen.modules[0].data = {
      sourceUrl: 'https://example.com/song.wav',
    }
    const external = await exportProjectBundle(p)
    return {
      size: exported.value.size,
      bytes: inv.bytes,
      palette: imported.value.projects[0].appearance.palette,
      corruptOk: corrupted.ok,
      missingOk: missing.ok,
      externalOk: external.ok,
    }
  })
  expect(result.bytes).toBe(21 * 1024 * 1024)
  expect(result.size).toBeGreaterThan(result.bytes)
  expect(result.palette).toBe('blue')
  expect(result.corruptOk || result.missingOk || result.externalOk).toBe(false)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /完整素材包 .duetpack/ }).click()
  const file = info.outputPath('review.duetpack')
  await (await download).saveAs(file)
  const context = await browser.newContext(),
    other = await context.newPage()
  await other.goto('/')
  await other.locator('.gallery input[type=file]').setInputFiles(file)
  await expect(other.locator('.studio')).toBeVisible()
  await context.close()
})
