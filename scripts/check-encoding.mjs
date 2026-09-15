/**
 * 全树编码扫描（防"乱码回流"）
 *
 * 为什么需要它：
 *   本项目曾因用 PowerShell 的 `Set-Content` 做含中文文件的文本往返，
 *   一次性损坏了 13 个文件（UTF-8 被按本地代码页解读后再写回）。
 *   那种损坏**不会让构建失败**——只有肉眼看到界面上的乱码才会发现，
 *   而那时可能已经提交并推送了。
 *
 * 判定规则（宁可误报，不可漏报）：
 *   1. 文件必须是合法 UTF-8（严格解码，遇到非法字节序列即失败）
 *   2. 不得包含 U+FFFD（替换字符）——它是"解码失败后写回"的指纹
 *   3. 不得包含常见乱码片段——即中文被按 GBK 解读后产生的那批字符
 *      （具体清单见下方 MOJIBAKE_MARKERS，用码位书写）
 *
 * 用法：node scripts/check-encoding.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 只扫描源码与文档；产物、依赖、二进制一律不管 */
const SCAN_DIRS = ['src', 'e2e', 'docs', 'scripts', 'public']
const SCAN_ROOT_FILES = [
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'index.html',
  'package.json',
  'vite.config.ts',
  'playwright.config.ts',
  'eslint.config.ts',
  'env.d.ts',
]

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.vue',
  '.css',
  '.md',
  '.json',
  '.html',
  '.mjs',
  '.js',
  '.svg',
  '.yml',
  '.yaml',
])

/** 明确跳过：二进制、生成物、第三方 */
const SKIP_NAMES = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report'])

/**
 * 典型的"UTF-8 被当作 GBK/CP936 解读"后产生的字符。
 * 这些字在正常中文里几乎不会成串出现，误报率极低。
 *
 * 刻意用 \u 转义而不是直接写汉字：否则**本文件自己**就会命中这些标记，
 * 扫描器每次都会把自己报成乱码（已经踩过一次）。
 * 转义后文件里不存在这些字符，扫描结果才可信。
 */
const MOJIBAKE_MARKERS = [
  '\uFFFD', // 替换字符：解码失败的铁证
  '\u951B', // "，" 被误读
  '\u9225', // "—" / "、" 被误读
  '\u7035', // "对" 被误读（本项目文档里最常见）
  '\u7481', // "记"/"设" 被误读
  '\u93C2', // "文" 被误读
  '\u935C', // "和" 被误读
  '\u9286', // "。" 被误读
  '\u8133', // 乘号被误读
]

/** 严格 UTF-8 解码：非法字节序列直接抛错 */
const strictDecoder = new TextDecoder('utf-8', { fatal: true })

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }

  for (const entry of entries) {
    if (SKIP_NAMES.has(entry)) continue
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) walk(full, out)
    else if (TEXT_EXTENSIONS.has(extname(entry))) out.push(full)
  }
  return out
}

const files = []
for (const dir of SCAN_DIRS) files.push(...walk(resolve(ROOT, dir)))
for (const file of SCAN_ROOT_FILES) {
  const full = resolve(ROOT, file)
  try {
    if (statSync(full).isFile()) files.push(full)
  } catch {
    // 文件不存在（例如还没写 CHANGELOG）不算问题
  }
}

const problems = []

for (const file of files) {
  const bytes = readFileSync(file)
  const shown = relative(ROOT, file).replace(/\\/g, '/')

  let text
  try {
    text = strictDecoder.decode(bytes)
  } catch (error) {
    problems.push({ file: shown, reason: `不是合法 UTF-8（${error.message}）` })
    continue
  }

  // BOM 不是错误，但会破坏某些工具的解析，提醒一下
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push({ file: shown, reason: '带 UTF-8 BOM（应去掉）' })
  }

  for (const marker of MOJIBAKE_MARKERS) {
    const index = text.indexOf(marker)
    if (index < 0) continue

    // 报出上下文，方便直接定位
    const context = text.slice(Math.max(0, index - 12), index + 12).replace(/\s+/g, ' ')
    problems.push({
      file: shown,
      reason: `疑似乱码 "${marker}"：…${context}…`,
    })
    break // 一个文件报一次就够了
  }
}

if (problems.length === 0) {
  console.log(`✓ 编码扫描通过：${files.length} 个文本文件均为合法 UTF-8，无乱码痕迹`)
  process.exit(0)
}

console.error(`✗ 编码扫描失败：${problems.length} 个文件有问题\n`)
for (const { file, reason } of problems) {
  console.error(`  ${file}\n    ${reason}`)
}
console.error('\n修复方式：用文件编辑工具按 UTF-8 重写该文件；不要用 PowerShell 做文本往返。')
process.exit(1)
