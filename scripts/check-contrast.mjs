/**
 * 对奏 Duet — 主题对比度核验
 * 用法：node scripts/check-contrast.mjs
 * 任一正文色低于 4.5:1 即退出码 1（供 CI 使用）。
 * 改主题时必须同步更新 CHECKS 与 docs/01-施工总案.md §14.2。
 */
const lin = (c) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const SURFACE = '#150F26' // --bg-surface
const CARD = '#1D1533' // --bg-surface-2

// 正文色：必须 >= 4.5:1（WCAG AA）
const TEXT_CHECKS = [
  { name: 'text-primary', fg: '#F3EFFB', bg: SURFACE },
  { name: 'text-secondary', fg: '#C4B9E0', bg: SURFACE },
  { name: 'text-muted', fg: '#8C82AA', bg: SURFACE },
  { name: 'text-primary/2', fg: '#F3EFFB', bg: CARD },
  { name: 'text-muted/2', fg: '#8C82AA', bg: CARD },
  { name: 'accent-500', fg: '#A78BFA', bg: SURFACE },
  { name: 'side-a', fg: '#A78BFA', bg: SURFACE },
  { name: 'side-b', fg: '#22D3EE', bg: SURFACE },
  { name: 'success', fg: '#34D399', bg: SURFACE },
  { name: 'warning', fg: '#FBBF24', bg: SURFACE },
  { name: 'danger', fg: '#F87171', bg: SURFACE },
  { name: 'info', fg: '#60A5FA', bg: SURFACE },
]

// 非文本对比（图标/描边/焦点环）：>= 3:1（WCAG AA 1.4.11）
const NON_TEXT_CHECKS = [
  { name: 'border-strong', fg: '#6B57B5', bg: SURFACE, min: 3 },
  { name: 'focus-ring', fg: '#A78BFA', bg: SURFACE, min: 3 },
]

const AA_TEXT = 4.5
let failed = 0

const run = (title, checks, defaultMin) => {
  console.log(`\n=== ${title} ===`)
  for (const c of checks) {
    const min = c.min ?? defaultMin
    const r = ratio(c.fg, c.bg)
    const ok = r >= min
    if (!ok) failed++
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(16)} ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${c.fg} on ${c.bg}`,
    )
  }
}

run('正文与语义色（AA 4.5:1）', TEXT_CHECKS, AA_TEXT)
run('非文本元素（AA 3:1）', NON_TEXT_CHECKS, 3)

console.log(
  failed === 0
    ? '\n✅ 全部通过：紫夜主题满足 WCAG AA。'
    : `\n❌ ${failed} 项未达标，必须调整 tokens.css 后再提交。`,
)
process.exit(failed ? 1 : 0)
