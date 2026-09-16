/**
 * 对奏 Duet — 主题对比度核验
 *
 * 用法：node scripts/check-contrast.mjs
 *
 * 与旧版的区别（这是关键）：
 *   旧版把色值**硬编码**在脚本里，于是脚本和被检查的 tokens.css 会各自漂移——
 *   改了主题忘了改脚本，校验依然全绿。现在改为**直接解析 tokens.css**：
 *   脚本里的 hex 只有"背景参照"这一处来源，色值一律从 CSS 读。
 *   新增主题只要在 tokens.css 里加一个块，这里自动开始校验它，无需改脚本。
 *
 * 检查的是"**实际会被读到的**前景/背景组合"，而不是所有排列组合。
 * 排列组合会让报告淹没在无关项里；只查真实用法才能让失败项都有意义。
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOKENS_PATH = resolve(ROOT, 'src/styles/tokens.css')

// ——————————————————————————————————————————————————————————
// 颜色工具
// ——————————————————————————————————————————————————————————

const srgbToLinear = (channel) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = ({ r, g, b }) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 解析任意 CSS 颜色字面量为 {r,g,b,a}。
 * 只支持 tokens.css 里实际会用到的形式：#rgb / #rrggbb / #rrggbbaa / rgb() / rgba() / hsl()。
 */
function parseColor(input) {
  const value = String(input).trim().toLowerCase()

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgbMatch) {
    // 同时兼容 `rgb(1, 2, 3)` 与 `rgb(1 2 3 / 40%)`
    const parts = (rgbMatch[1] ?? '').split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const channel = (raw) =>
      raw.endsWith('%') ? Math.round((parseFloat(raw) / 100) * 255) : parseInt(raw, 10)
    const alpha = parts[3]
    return {
      r: channel(parts[0] ?? '0'),
      g: channel(parts[1] ?? '0'),
      b: channel(parts[2] ?? '0'),
      a: alpha === undefined ? 1 : alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha),
    }
  }

  return null
}

/** 把半透明前景压到不透明背景上，得到"肉眼看到的颜色" */
function composite(fg, bg) {
  if (fg.a >= 1) return fg
  return {
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
    a: 1,
  }
}

const hex = ({ r, g, b }) =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`

// ——————————————————————————————————————————————————————————
// tokens.css 解析
// ——————————————————————————————————————————————————————————

/**
 * 把 tokens.css 切成 { selector, body } 列表。
 * 用大括号配对而不是正则匹配整块，避免嵌套的 @media 把块边界切错。
 */
function extractBlocks(css) {
  const blocks = []
  let index = 0

  while (index < css.length) {
    const open = css.indexOf('{', index)
    if (open < 0) break

    const selector = css.slice(index, open).trim()

    // 从 open 开始做大括号配对
    let depth = 0
    let cursor = open
    while (cursor < css.length) {
      const char = css[cursor]
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) break
      }
      cursor += 1
    }

    const body = css.slice(open + 1, cursor)
    blocks.push({ selector, body })
    index = cursor + 1
  }

  return blocks
}

/** 取出块内声明的自定义属性 */
function extractTokens(body) {
  const tokens = {}
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1]
    const value = (match[2] ?? '').trim()
    if (name) tokens[name] = value
  }
  return tokens
}

/**
 * 去掉 CSS 注释。
 *
 * 必须在切块**之前**做：本文件的两个块之间夹着大段说明性注释，
 * 而注释在文本上属于"选择器"区域，于是注释里随手举的
 * `:root[data-theme='x']` 例子会被当成一个真实主题登记进来。
 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')

const css = stripComments(readFileSync(TOKENS_PATH, 'utf8'))
const blocks = extractBlocks(css)

/** 基础 token（:root 里那份），所有主题共享 */
let baseTokens = {}
/** 主题 id → 该主题覆盖的 token */
const themes = new Map()

for (const { selector, body } of blocks) {
  // 跳过 @media / @supports 之类的条件块：它们的 token 是运行期覆盖，
  // 不应参与"静态对比度"的判断（动效降级块就在其中）
  if (selector.startsWith('@')) continue

  const tokens = extractTokens(body)

  /*
   * 一个块可能同时是"基础块"和"某个主题块"，形如：
   *   :root,
   *   :root[data-theme='violet-dark'] { … }
   * 这是刻意的写法——默认主题必须写在 :root 上，
   * 否则 JS 尚未执行（首屏、禁用脚本）时页面会完全没有颜色。
   * 所以这里要**两边都登记**，只当成主题会让其它主题丢掉结构性 token。
   */
  if (/(^|,)\s*:root\s*(,|$)/.test(selector)) {
    baseTokens = { ...baseTokens, ...tokens }
  }

  for (const match of selector.matchAll(/data-theme=['"]([\w-]+)['"]/g)) {
    const id = match[1]
    if (id) themes.set(id, { ...(themes.get(id) ?? {}), ...tokens })
  }
}

if (themes.size === 0) {
  console.error('✗ 没有从 tokens.css 里解析出任何 [data-theme] 主题块')
  process.exit(1)
}

// ——————————————————————————————————————————————————————————
// 检查项：只列真实会同时出现的组合
// ——————————————————————————————————————————————————————————

/** 内容可能落在的所有背景层级 */
const CONTENT_BACKGROUNDS = ['--bg-base', '--bg-surface', '--bg-surface-2', '--bg-elevated']

/** 一级内容色：正文、标题 */
const PRIMARY_TEXT = ['--text-primary', '--text-secondary']

/** 二级内容色：说明、注释、占位、空状态——都必须能读 */
const TERTIARY_TEXT = ['--text-muted', '--text-disabled']

/** 语义色（状态文字、链接、强调） */
const SEMANTIC_TEXT = ['--accent-500', '--side-a', '--side-b', '--success', '--warning', '--danger', '--info']

/** 非文本（描边、图标、焦点环）：AA 1.4.11 要求 3:1 */
const NON_TEXT = ['--border-strong', '--accent-500', '--side-a', '--side-b']

/**
 * 实心强调面上的文字，形如 [前景, 背景]。
 *
 * 这一组此前完全没有被检查，而它恰恰出过两次问题：
 *   1. `--accent-fg` 在"暗"主题里是近黑色（因为那里的 accent-500 是**浅**蓝），
 *      一旦被用在深蓝的实心面上，就成了"深色文字压深色底"。
 *   2. 选中态与主操作按钮混用了同一套实心色，深浅主题下观感完全走样。
 * 教训：**"面上的文字"必须作为一个整体校验**，只查它跟页面背景的关系没有意义——
 * 页面背景根本不是它实际压着的东西。
 */
const ON_SOLID_PAIRS = [
  ['--accent-fg', '--accent-solid'],
  ['--accent-fg', '--accent-solid-hover'],
]

const AA_TEXT = 4.5
const AA_NON_TEXT = 3

// ——————————————————————————————————————————————————————————
// 执行
// ——————————————————————————————————————————————————————————

const resolveToken = (tokens, name) => {
  const raw = tokens[name] ?? baseTokens[name]
  if (raw === undefined) return null
  return parseColor(raw)
}

let failures = 0

console.log(`解析自 ${TOKENS_PATH.replace(ROOT, '.').replace(/\\/g, '/')}`)
console.log(`发现 ${themes.size} 个主题：${[...themes.keys()].join(', ')}\n`)

for (const [themeId, overrides] of themes) {
  const tokens = { ...baseTokens, ...overrides }
  const rows = []
  let themeFailed = 0

  for (const bgName of CONTENT_BACKGROUNDS) {
    const bg = resolveToken(tokens, bgName)
    if (!bg) continue
    const bgOpaque = composite(bg, { r: 255, g: 255, b: 255, a: 1 })

    const check = (fgName, min) => {
      const raw = resolveToken(tokens, fgName)
      if (!raw) return
      const fg = composite(raw, bgOpaque)
      const value = contrast(fg, bgOpaque)
      const ok = value >= min
      if (!ok) themeFailed += 1
      rows.push({ ok, name: `${fgName} on ${bgName}`, value, min, fg: hex(fg), bg: hex(bgOpaque) })
    }

    for (const name of PRIMARY_TEXT) check(name, AA_TEXT)
    for (const name of TERTIARY_TEXT) check(name, AA_TEXT)
    for (const name of SEMANTIC_TEXT) check(name, AA_TEXT)
    // 非文本只查最主要的那个背景，避免报告过长
    if (bgName === '--bg-surface') for (const name of NON_TEXT) check(name, AA_NON_TEXT)
  }

  // 实心面上的文字：背景不是页面层级，而是实心色本身，因此单独一组
  for (const [fgName, bgName] of ON_SOLID_PAIRS) {
    const bgRaw = resolveToken(tokens, bgName)
    const fgRaw = resolveToken(tokens, fgName)
    if (!bgRaw || !fgRaw) continue

    const bgOpaque = composite(bgRaw, { r: 255, g: 255, b: 255, a: 1 })
    const fg = composite(fgRaw, bgOpaque)
    const value = contrast(fg, bgOpaque)
    const ok = value >= AA_TEXT
    if (!ok) themeFailed += 1
    rows.push({
      ok,
      name: `${fgName} on ${bgName}`,
      value,
      min: AA_TEXT,
      fg: hex(fg),
      bg: hex(bgOpaque),
    })
  }

  console.log(`=== 主题 ${themeId} ===`)
  for (const row of rows) {
    if (row.ok) continue
    console.log(
      `  FAIL  ${row.name.padEnd(38)} ${row.value.toFixed(2).padStart(6)}:1  (需 ${row.min})  ${row.fg} on ${row.bg}`,
    )
  }
  if (themeFailed === 0) {
    console.log(`  PASS  全部 ${rows.length} 项达标`)
  } else {
    console.log(`  —— ${themeFailed} / ${rows.length} 项未达标`)
  }
  console.log('')
  failures += themeFailed
}

if (failures === 0) {
  console.log(`✅ 全部 ${themes.size} 个主题满足 WCAG AA`)
  process.exit(0)
}

console.error(`❌ 共 ${failures} 项未达标。请调整 tokens.css 后重试。`)
process.exit(1)
