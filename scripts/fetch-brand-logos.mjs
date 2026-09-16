/**
 * 抓取真实品牌 LOGO 到**本地目录**（零依赖）
 *
 * 用途与边界（这一段是重点，请先读完）：
 *   这些 LOGO 是**第三方商标**，版权归各自所有者。把它们提交进本仓库
 *   等于再分发他人商标，风险远大于你自己在本机使用。
 *   因此本脚本把文件写进 `public/brand-local/`，而该目录**已加入 .gitignore**：
 *     - 你自己跑一次脚本，本机就能看到真实 LOGO
 *     - 别人克隆仓库时拿到的是"没有图标"的状态，应用自动回退到
 *       按品牌色生成的几何图标（见 ToolIcon.vue）
 *   ——效果就是你要的"只影响我自己的实例，不影响其他人获取到的项目"。
 *
 * 图标来源：Simple Icons（https://simpleicons.org）
 *   该项目的图标文件以 CC0 1.0 释出，但**商标权仍归各品牌所有**。
 *   Simple Icons 自己也声明："All brand icons are trademarks of their
 *   respective owners. The use of these trademarks does not indicate
 *   endorsement."
 *
 * 用法：
 *   node scripts/fetch-brand-logos.mjs            # 抓取内置工具清单里有对应图标的那些
 *   node scripts/fetch-brand-logos.mjs openai suno  # 只抓指定的几个
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/brand-local')

/**
 * 内置工具 → Simple Icons 的 slug。
 *
 * 这张表是**实测过**的：每个 slug 都跑过一次真实请求，
 * 404 的一律不登记（Simple Icons 会因为商标政策下架某些品牌，
 * 例如 openai / adobe / microsoft 目前都已下架）。
 * 表里没有的品牌会继续用生成的几何图标，这不是缺陷。
 * slug 可在 https://simpleicons.org 查询后补进来。
 *
 * M7 补充的判据（用户实测反馈"其他品牌的 LOGO 为什么还是默认的"）：
 *   Simple Icons **根本没有收录**中文 AI 产品（可灵 / 即梦 / 海绵音乐 /
 *   天工 / Tripo3D / Meshy / IndexTTS / GPT-SoVITS 全部 404），
 *   这不是脚本的问题，补多少行都变不出来。
 *   能做的是把**同一主体的母品牌**登记进去——可灵是快手的、
 *   Kimi 是月之暗面的、海螺与 MiniMax Speech 是 MiniMax 的。
 *   卡片上仍然显示产品名，所以看到快手/月之暗面的标记不会被误读成
 *   "这就是可灵"，反而比一个字母方块更有信息量。
 * 不做的事：拿一个"看起来像"的 slug 硬凑（比如用 flux 的 CD 项目图标
 *   冒充 Black Forest Labs 的 FLUX）。图标错了比没有图标更糟。
 */
const SLUGS = {
  suno: 'suno',
  deepseek: 'deepseek',
  claude: 'anthropic',
  anthropic: 'anthropic',
  gemini: 'googlegemini',
  huggingface: 'huggingface',
  ollama: 'ollama',
  elevenlabs: 'elevenlabs',
  // —— M7 新增（均经实测确认存在）——
  kimi: 'moonshotai',
  qwen: 'qwen',
  kling: 'kuaishou',
  hailuo: 'minimax',
  'minimax-speech': 'minimax',
  'fish-audio': 'fishaudio',
  github: 'github',
  figma: 'figma',
  notion: 'notion',
  cursor: 'cursor',
  vercel: 'vercel',
  netlify: 'netlify',
  supabase: 'supabase',
  cloudflare: 'cloudflare',
  blender: 'blender',
  unity: 'unity',
  unrealengine: 'unrealengine',
  steam: 'steam',
  epicgames: 'epicgames',
  nvidia: 'nvidia',
  intel: 'intel',
  amd: 'amd',
  apple: 'apple',
  google: 'google',
  meta: 'meta',
  discord: 'discord',
  reddit: 'reddit',
  youtube: 'youtube',
  spotify: 'spotify',
  tiktok: 'tiktok',
}

const requested = process.argv.slice(2)
const keys = requested.length > 0 ? requested : Object.keys(SLUGS)

mkdirSync(OUT_DIR, { recursive: true })

const manifest = {}
let ok = 0
let skipped = 0
let failed = 0

for (const key of keys) {
  const slug = SLUGS[key]
  if (!slug) {
    skipped += 1
    continue
  }

  /*
   * 不带颜色参数：拿默认色。
   *
   * M7 之前这里写的是 `/ffffff`（纯白），结果是**浅色主题下 LOGO 完全看不见**
   * ——白字形画在浅灰底上。真正的问题不在这个参数，而在于当时把 SVG
   * 当成普通图片铺在底色上；界面现在改用 CSS mask（见 ToolIcon.vue），
   * 只取图形的**轮廓**、颜色一律用当前主题的文字色，因此文件里是什么颜色
   * 已经无所谓。既然无所谓，就取默认色，至少单独打开文件时看得清。
   */
  const url = `https://cdn.simpleicons.org/${slug}`

  try {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) {
      console.warn(`✗ ${key}（${slug}）：HTTP ${response.status}`)
      failed += 1
      continue
    }

    const svg = await response.text()
    if (!svg.includes('<svg')) {
      console.warn(`✗ ${key}（${slug}）：返回的不是 SVG`)
      failed += 1
      continue
    }

    writeFileSync(resolve(OUT_DIR, `${key}.svg`), svg, 'utf8')
    manifest[key] = { slug, file: `${key}.svg` }
    ok += 1
    console.log(`✓ ${key}.svg  ← ${slug}`)
  } catch (error) {
    console.warn(`✗ ${key}（${slug}）：${error instanceof Error ? error.message : error}`)
    failed += 1
  }

  // 对第三方 CDN 客气一点，别并发打过去
  await new Promise((resolve) => setTimeout(resolve, 120))
}

writeFileSync(
  resolve(OUT_DIR, 'manifest.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), icons: manifest }, null, 2)}\n`,
  'utf8',
)

console.log(`
完成：成功 ${ok} · 跳过（无对应图标）${skipped} · 失败 ${failed}

输出目录：public/brand-local/（已在 .gitignore 中，不会提交）

提醒：这些是第三方商标，仅供你本机识别使用。
      请勿将它们提交到仓库或用于任何可能被理解为官方背书的场合。
`)
