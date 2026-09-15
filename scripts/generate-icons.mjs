/**
 * 生成 PWA 图标（零依赖）
 *
 * 为什么自己写而不是装 sharp / canvas：
 *   PWA 只需要三张**静态**图标，而 sharp 会带来几十 MB 的原生依赖，
 *   在 CI 与 Tauri 构建里都是负担。这里的图形很简单（圆角矩形 + 几个色块），
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

// —— ICO / ICNS 容器（Windows / macOS 桌面版需要） ——

/**
 * 打包成 ICO。
 *
 * ICO 可以直接内嵌 PNG（Vista 起支持），因此不需要再写一套 BMP 编码：
 * 每个尺寸就是一份完整的 PNG 数据。
 * 宽/高字段为 0 表示 256（一个字节放不下 256）。
 */
function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // 保留位
  header.writeUInt16LE(1, 2) // 类型：1 = 图标
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  for (const [index, entry] of entries.entries()) {
    const base = index * 16
    directory[base] = entry.size >= 256 ? 0 : entry.size
    directory[base + 1] = entry.size >= 256 ? 0 : entry.size
    directory[base + 2] = 0 // 调色板数量（真彩为 0）
    directory[base + 3] = 0 // 保留位
    directory.writeUInt16LE(1, base + 4) // 颜色平面
    directory.writeUInt16LE(32, base + 6) // 位深
    directory.writeUInt32LE(entry.png.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += entry.png.length
  }

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

/**
 * 打包成 ICNS。
 *
 * 容器同样简单：magic + 总长度，然后一串 (类型, 长度, 数据)。
 * 现代 macOS 接受 PNG 载荷，类型码决定系统在什么场合用它。
 */
function encodeIcns(entries) {
  const chunks = entries.map((entry) => {
    const header = Buffer.alloc(8)
    header.write(entry.type, 0, 4, 'ascii')
    header.writeUInt32BE(entry.png.length + 8, 4)
    return Buffer.concat([header, entry.png])
  })

  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)

  return Buffer.concat([head, body])
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

/**
 * Tauri 的图标（`tauri.conf.json` 的 bundle.icon 直接引用这些路径）。
 * 这里不做 maskable 内缩：桌面图标不需要为系统裁切留白。
 */
const TAURI_DIR = resolve(ROOT, 'src-tauri/icons')
mkdirSync(TAURI_DIR, { recursive: true })

const tauriPngs = [
  { file: '32x32.png', size: 32 },
  { file: '128x128.png', size: 128 },
  { file: '128x128@2x.png', size: 256 },
  { file: 'icon.png', size: 512 },
]

const pngBySize = new Map()
for (const { file, size } of tauriPngs) {
  const png = encodePng(size, render(size, 0))
  pngBySize.set(size, png)
  writeFileSync(resolve(TAURI_DIR, file), png)
  console.log(`✓ src-tauri/icons/${file}  ${size}×${size}  ${kb(png)}`)
}

// Windows：多尺寸 ICO，让任务栏/桌面/文件管理器各取所需
const ico = encodeIco([
  { size: 16, png: encodePng(16, render(16, 0)) },
  { size: 32, png: pngBySize.get(32) },
  { size: 48, png: encodePng(48, render(48, 0)) },
  { size: 64, png: encodePng(64, render(64, 0)) },
  { size: 128, png: pngBySize.get(128) },
  { size: 256, png: pngBySize.get(256) },
])
writeFileSync(resolve(TAURI_DIR, 'icon.ico'), ico)
console.log(`✓ src-tauri/icons/icon.ico  16/32/48/64/128/256  ${kb(ico)}`)

// macOS：ICNS 的每个类型码对应系统的不同使用场景
const icns = encodeIcns([
  { type: 'ic11', png: encodePng(32, render(32, 0)) }, // 16@2x
  { type: 'ic12', png: encodePng(64, render(64, 0)) }, // 32@2x
  { type: 'ic07', png: pngBySize.get(128) }, // 128
  { type: 'ic13', png: pngBySize.get(256) }, // 128@2x
  { type: 'ic08', png: pngBySize.get(256) }, // 256
  { type: 'ic14', png: pngBySize.get(512) }, // 256@2x
  { type: 'ic09', png: pngBySize.get(512) }, // 512
])
writeFileSync(resolve(TAURI_DIR, 'icon.icns'), icns)
console.log(`✓ src-tauri/icons/icon.icns  16→512  ${kb(icns)}`)

console.log(`\n输出目录：\n  ${OUT_DIR}\n  ${TAURI_DIR}`)

function kb(buffer) {
  return `${(buffer.length / 1024).toFixed(1)} KB`
}
