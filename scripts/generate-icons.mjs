/**
 * 生成 PWA 图标（零依赖）
 *
 * 为什么自己写而不是装 sharp / canvas：
 *   PWA 只需要三张**静态**图标，而 sharp 会带来几十 MB 的原生依赖，
 *   在 CI 与 Web 构建里都是负担。这里的图形很简单（圆角矩形 + 几个色块），
 *   用 4× 超采样手写光栅化 + 自己拼 PNG（Node 自带 zlib）就够了。
 *
 * 产物：
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-512-maskable.png   ← 留出 20% 安全边距，适配圆形/圆角裁切
 *
 * 用法：node scripts/generate-icons.mjs
 * 改动图形时先改 public/favicon.svg，再同步改下面的 SHAPES。
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/icons')

/** 设计稿坐标系（与 favicon.svg 的 24×24 viewBox 一致） */
const VIEW = 24
/** 超采样倍数：4× 之后边缘已经看不出锯齿，再高只是浪费内存 */
const SUPERSAMPLE = 4

/**
 * 绘制指令（按 SVG 里的顺序，后画的覆盖先画的）。
 * 颜色取自 src/styles/tokens.css，改主题时这里也要跟着改。
 */
const SHAPES = [
  { kind: 'roundRect', x: 0, y: 0, w: 24, h: 24, r: 6, color: [0x15, 0x0f, 0x26] },
  { kind: 'line', x1: 12, y1: 4.5, x2: 12, y2: 19.5, width: 1.2, color: [0x6b, 0x57, 0xb5] },
  { kind: 'roundRect', x: 4, y: 8.4, w: 3.4, h: 7.2, r: 1.1, color: [0xa7, 0x8b, 0xfa] },
  { kind: 'roundRect', x: 8.6, y: 10.2, w: 2.4, h: 3.6, r: 0.9, color: [0x7c, 0x5c, 0xe0] },
  { kind: 'roundRect', x: 16.6, y: 8.4, w: 3.4, h: 7.2, r: 1.1, color: [0x22, 0xd3, 0xee] },
  { kind: 'roundRect', x: 13, y: 10.2, w: 2.4, h: 3.6, r: 0.9, color: [0x1b, 0x93, 0xac] },
]

/**
 * 光栅化图标。
 * @param {number} size 输出边长（像素）
 * @param {number} inset 图形相对画布的内缩比例（maskable 用 0.2 留安全边距）
 */
function render(size, inset) {
  const hi = size * SUPERSAMPLE
  // 预乘 alpha 的缓冲（超采样求平均时不会出现黑边）
  const acc = new Float32Array(size * size * 4)

  /**
   * 画布坐标 → 设计坐标。
   *
   * inset 的含义是"图形只占画布中间的那一块"，所以要把设计坐标范围
   * 0..VIEW 映射到画布的 inset..(1-inset) 区间：
   *   p = inset       → u = 0
   *   p = 1 - inset   → u = VIEW
   * 即 u = (p - inset) / (1 - 2·inset) · VIEW。
   *
   * 注意别写成反过来的形式（(p-0.5)·(1-2·inset)+0.5），
   * 那是"放大到只剩中间"，图形会顶出画布之外。
   */
  const paint = (v) => {
    if (inset <= 0) return v
    const p = v / VIEW
    return ((p - inset) / (1 - inset * 2)) * VIEW
  }

  for (let py = 0; py < hi; py += 1) {
    const vy = paint((py + 0.5) / (hi / VIEW))

    for (let px = 0; px < hi; px += 1) {
      const vx = paint((px + 0.5) / (hi / VIEW))

      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (const shape of SHAPES) {
        if (!inside(shape, vx, vy)) continue
        const [sr, sg, sb] = shape.color
        // painter's algorithm：全不透明，直接覆盖
        r = sr
        g = sg
        b = sb
        a = 255
      }

      if (a === 0) continue

      // 累积到对应的输出像素（预乘）
      const ox = Math.floor(px / SUPERSAMPLE)
      const oy = Math.floor(py / SUPERSAMPLE)
      const index = (oy * size + ox) * 4
      acc[index] += r
      acc[index + 1] += g
      acc[index + 2] += b
      acc[index + 3] += a
    }
  }

  const samples = SUPERSAMPLE * SUPERSAMPLE
  const out = Buffer.alloc(size * size * 4)

  for (let i = 0; i < size * size; i += 1) {
    const r = acc[i * 4] / samples
    const g = acc[i * 4 + 1] / samples
    const b = acc[i * 4 + 2] / samples
    const a = acc[i * 4 + 3] / samples

    // 反预乘，还原成 PNG 需要的"直通 alpha"
    const alpha = a / 255
    const unpremultiply = alpha > 0 ? 1 / alpha : 0

    out[i * 4] = clampByte(r * unpremultiply)
    out[i * 4 + 1] = clampByte(g * unpremultiply)
    out[i * 4 + 2] = clampByte(b * unpremultiply)
    out[i * 4 + 3] = clampByte(a)
  }

  return out
}

/** 点是否落在图形内 */
function inside(shape, x, y) {
  if (shape.kind === 'roundRect') {
    const { x: sx, y: sy, w, h, r } = shape
    if (x < sx || x > sx + w || y < sy || y > sy + h) return false

    // 圆角：判断是否落在某个角的圆外
    const cx = Math.min(Math.max(x, sx + r), sx + w - r)
    const cy = Math.min(Math.max(y, sy + r), sy + h - r)
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= r * r
  }

  if (shape.kind === 'line') {
    // 只有垂直/水平线用得上，按矩形处理（线帽取平头，与 SVG 默认一致）
    const half = shape.width / 2
    return (
      x >= Math.min(shape.x1, shape.x2) - half &&
      x <= Math.max(shape.x1, shape.x2) + half &&
      y >= Math.min(shape.y1, shape.y2) - half &&
      y <= Math.max(shape.y1, shape.y2) + half
    )
  }

  return false
}

function clampByte(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

// —— PNG 编码 ——

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)

  return Buffer.concat([length, typeAndData, crc])
}

/** RGBA → PNG（8 位真彩 + alpha，无隔行） */
function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型：RGBA
  ihdr[10] = 0 // 压缩方法
  ihdr[11] = 0 // 过滤方法
  ihdr[12] = 0 // 非隔行

  // 每行前置一个过滤字节（0 = None）
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// —— 入口 ——

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  // maskable：系统会按圆形/圆角裁切，图形必须缩到中间 60% 才不会被切掉
  { file: 'icon-512-maskable.png', size: 512, inset: 0.2 },
]

for (const { file, size, inset } of targets) {
  const png = encodePng(size, render(size, inset))
  const path = resolve(OUT_DIR, file)
  writeFileSync(path, png)
  console.log(`✓ public/icons/${file}  ${size}×${size}  ${kb(png)}`)
}

console.log(`输出目录：${OUT_DIR}`)

function kb(buffer) {
  return `${(buffer.length / 1024).toFixed(1)} KB`
}
