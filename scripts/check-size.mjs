/**
 * 首屏体积预算校验（§15）
 *
 * 为什么要有这个脚本：
 *   体积预算只在"每次构建都自动比对"时才有意义。
 *   靠人偶尔跑一次 `du` 看产物，等到发现超了通常已经加了好几个依赖。
 *
 * 口径（刻意按 gzip 算）：
 *   只统计 **index.html 直接引用 + modulepreload** 的资源，
 *   也就是"打开首页必须下载的东西"。懒加载的路由与模块不算首屏——
 *   这正是代码分割的目的，把它们算进来会让预算失去意义。
 *
 * 用法：node scripts/check-size.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')

/** §15 的预算（gzip 后） */
const BUDGET = {
  js: 260 * 1024,
  css: 40 * 1024,
}

const htmlPath = join(DIST, 'index.html')
if (!existsSync(htmlPath)) {
  console.error('✗ 找不到 dist/index.html，请先运行 npm run build')
  process.exit(1)
}

const html = readFileSync(htmlPath, 'utf8')

// 抓出 index.html 里引用的所有 assets 文件（script / modulepreload / stylesheet）
const referenced = new Set()
for (const match of html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)) {
  if (match[1]) referenced.add(match[1])
}

if (referenced.size === 0) {
  console.error('✗ index.html 里没有解析出任何 assets 引用，检查构建输出')
  process.exit(1)
}

let jsTotal = 0
let cssTotal = 0
const rows = []

for (const file of [...referenced].sort()) {
  const path = join(ASSETS, file)
  if (!existsSync(path)) continue

  const buffer = readFileSync(path)
  const gzipped = gzipSync(buffer, { level: 9 }).length

  if (file.endsWith('.js')) jsTotal += gzipped
  else if (file.endsWith('.css')) cssTotal += gzipped
  else continue

  rows.push({
    file,
    raw: buffer.length,
    gzip: gzipped,
  })
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const pass = (value, budget) => value <= budget

console.log('首屏资源（index.html 直接引用）：\n')
for (const row of rows) {
  console.log(`  ${row.file.padEnd(32)}${kb(row.raw).padStart(11)}  ${kb(row.gzip).padStart(12)} gzip`)
}

console.log('')
const checks = [
  { label: '首屏 JS ', value: jsTotal, budget: BUDGET.js },
  { label: '首屏 CSS', value: cssTotal, budget: BUDGET.css },
]

let failed = false
for (const check of checks) {
  const ok = pass(check.value, check.budget)
  if (!ok) failed = true
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${check.label}  ${kb(check.value).padStart(11)}  (预算 ${kb(check.budget)})`,
  )
}

if (failed) {
  console.error('\n✗ 首屏体积超出预算。请把新依赖移入懒加载分支，或先更新 §15 的预算并说明理由。')
  process.exit(1)
}

console.log('\n✓ 首屏体积在预算内')
