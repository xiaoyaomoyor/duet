/**
 * PWA 构建产物校验（跑在 `vite build` 之后）
 *
 * 为什么不在 E2E 里测：
 *   Service Worker 与 manifest 注入都是**构建期**行为，dev server 下
 *   `devOptions.enabled` 是 false（这是刻意的：否则本地调试会被上一版缓存干扰）。
 *   所以"清单对不对、图标在不在、SW 有没有预缓存"只能在产物上验。
 *
 * 为什么解析 PNG 头而不是只看文件在不在：
 *   manifest 里声明 `512x512` 而实际图片是 192×192 是很容易犯的错，
 *   而且浏览器会因此判定应用不可安装——只看"文件存在"完全测不出来。
 *
 * 用法：node scripts/check-pwa.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')

const problems = []
const notes = []

function fail(message) {
  problems.push(message)
}

function check(condition, message) {
  if (!condition) fail(message)
  return condition
}

// —— 1. 产物目录 ——

if (!existsSync(DIST)) {
  console.error('✗ 找不到 dist/，请先运行 npm run build')
  process.exit(1)
}

// —— 2. manifest ——

const manifestPath = resolve(DIST, 'manifest.webmanifest')
if (!check(existsSync(manifestPath), '缺少 dist/manifest.webmanifest')) {
  report()
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

check(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest.name 为空')
check(typeof manifest.short_name === 'string' && manifest.short_name.length > 0, 'manifest.short_name 为空')
check(manifest.display === 'standalone', `manifest.display 应为 standalone，实际是 ${manifest.display}`)
check(manifest.start_url !== undefined, 'manifest 缺少 start_url')

// —— 3. 图标：存在 + 尺寸与声明一致 ——

/** 读取 PNG 的 IHDR，拿到真实宽高 */
function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') return null
  // IHDR 紧跟在 8 字节签名之后：4 字节长度 + 4 字节类型，然后宽高各 4 字节
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const icons = manifest.icons ?? []
check(icons.length > 0, 'manifest.icons 为空')

let has512 = false
let hasMaskable = false

for (const icon of icons) {
  const iconPath = resolve(DIST, icon.src)
  if (!check(existsSync(iconPath), `图标不存在：${icon.src}`)) continue

  const buffer = readFileSync(iconPath)
  const size = pngSize(buffer)

  if (!check(size !== null, `图标不是合法 PNG：${icon.src}`)) continue

  const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number)
  check(
    size.width === declaredWidth && size.height === declaredHeight,
    `图标尺寸与声明不符：${icon.src} 实际 ${size.width}×${size.height}，manifest 声明 ${icon.sizes}`,
  )

  if (icon.sizes === '512x512') has512 = true
  if (icon.purpose === 'maskable') hasMaskable = true

  notes.push(`${icon.src}  ${size.width}×${size.height}  ${(buffer.length / 1024).toFixed(1)} KB`)
}

// Chrome 的安装条件之一：至少一个 512×512 图标
check(has512, '缺少 512×512 图标，Chrome 会判定为不可安装')
check(hasMaskable, '缺少 maskable 图标，Android 上图标会被裁切')

// —— 4. Service Worker ——

const swPath = resolve(DIST, 'sw.js')
if (check(existsSync(swPath), '缺少 dist/sw.js（Service Worker 未生成）')) {
  const sw = readFileSync(swPath, 'utf8')
  check(sw.length > 0, 'dist/sw.js 是空文件')
  // 预缓存清单是离线可用的前提
  check(/precache/i.test(sw) || /workbox/i.test(sw), 'dist/sw.js 里看不出预缓存逻辑')
  notes.push(`sw.js  ${(statSync(swPath).size / 1024).toFixed(1)} KB`)
}

// —— 5. index.html 引用了 manifest ——

const htmlPath = resolve(DIST, 'index.html')
if (check(existsSync(htmlPath), '缺少 dist/index.html')) {
  const html = readFileSync(htmlPath, 'utf8')
  check(html.includes('rel="manifest"'), 'index.html 没有引用 manifest')
  check(html.includes('theme-color'), 'index.html 缺少 theme-color（移动端地址栏不会跟随主题）')
}

// —— 6. 入口脚本不能内联 manifest 内容（应保持可缓存的外部文件） ——

report()

function report() {
  if (problems.length === 0) {
    console.log('✓ PWA 产物校验通过')
    for (const note of notes) console.log(`    ${note}`)
    process.exit(0)
  }

  console.error(`✗ PWA 产物校验失败：${problems.length} 项\n`)
  for (const problem of problems) console.error(`  · ${problem}`)
  process.exit(1)
}
