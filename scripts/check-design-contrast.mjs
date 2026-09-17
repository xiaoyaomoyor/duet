import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/design.css', import.meta.url), 'utf8')
const values = (block) =>
  Object.fromEntries(
    [...block.matchAll(/(--d-[\w-]+):\s*(#[a-f\d]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  )
const ink = values(css.match(/\[data-design-theme\]\s*\{([^}]+)\}/)[1])
const paper = {
  ...ink,
  ...values(css.match(/\[data-design-theme=['"]paper['"]\]\s*\{([^}]+)\}/)[1]),
}
const luminance = (hex) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
let failed = 0
for (const [name, tokens] of Object.entries({ ink, paper })) {
  let count = 0
  for (const bg of ['bg', 'surface', 'raised']) {
    for (const fg of ['text', 'muted', 'faint', 'a', 'b', 'danger']) {
      const a = luminance(tokens[`--d-${bg}`])
      const b = luminance(tokens[`--d-${fg}`])
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < 4.5) {
        console.error(`${name}: ${fg} / ${bg} = ${ratio.toFixed(2)} < 4.5`)
        failed++
      }
      count++
    }
  }
  const a = luminance(tokens['--d-accent'])
  const b = luminance(tokens['--d-accent-ink'])
  if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5) {
    console.error(`${name}: primary button contrast failed`)
    failed++
  }
  console.log(`${name}: checked ${count + 1} design color pairs`)
}
if (failed) process.exitCode = 1
else console.log('✓ R1 design text and button colors meet WCAG AA')
