/**
 * 本地品牌 LOGO（可选，刻意不入库）
 *
 * 背景：用户希望看到真实的品牌 LOGO，但把第三方商标提交进 AGPL 仓库
 * 等于再分发他人商标。折中方案是"本地增强"：
 *   - `scripts/fetch-brand-logos.mjs` 把 SVG 抓到 `public/brand-local/`
 *   - 该目录在 `.gitignore` 里，因此只影响跑过脚本的那台机器
 *   - 别人克隆仓库时这里读到的是空清单，图标自动回退到程序化生成
 *
 * 为什么先读清单而不是直接 `<img src>` 试错：
 *   内置工具有几十个，直接试错会让"没有本地 LOGO"的用户每次渲染
 *   都收到几十个 404。清单只请求一次（不存在时也只 404 一次），
 *   之后全部走内存判断。
 */

/** 单个 LOGO 的记录 */
interface LocalLogoEntry {
  slug: string
  file: string
}

interface LocalLogoManifest {
  generatedAt?: string
  icons: Record<string, LocalLogoEntry>
}

/** 缓存：`null` 表示还没读过 */
let cache: Record<string, LocalLogoEntry> | null = null
/** 正在进行的读取（并发调用共享同一个 Promise，避免重复请求） */
let pending: Promise<Record<string, LocalLogoEntry>> | null = null

/**
 * 读取本地 LOGO 清单。
 *
 * 失败（文件不存在、JSON 坏了、离线）一律当作"没有本地 LOGO"，
 * 不抛异常、不打扰用户——这只是锦上添花的能力。
 *
 * ⚠️ `cache: 'no-store'` 不是随手加的（M9 实测反馈"完全看不到 DeepSeek/Gemini 的图标"）：
 *   用户在这个应用上已经用了很久，而 `public/brand-local/` 是后来才跑脚本生成的。
 *   在那之前浏览器很可能已经把 manifest.json 的 **404 响应**按启发式规则缓存了下来，
 *   于是即使文件已经存在，这里也永远拿到 404 → 全部退回程序化图标。
 *   而自动化测试每次都是全新的浏览器上下文（没有缓存），所以**测试永远是绿的**——
 *   这正是"我这边好好的、用户那边看不到"的典型来源。
 *   显式要求不走缓存，这一整类问题就消失了。
 */
export function loadLocalLogos(): Promise<Record<string, LocalLogoEntry>> {
  if (cache) return Promise.resolve(cache)
  if (pending) return pending

  pending = (async () => {
    try {
      // 相对路径：应用可能跑在子路径下（GitHub Pages）
      const url = new URL('brand-local/manifest.json', document.baseURI).href
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        warnOnce(`本地品牌 LOGO 清单不可用（HTTP ${response.status}）`)
        return {}
      }

      const parsed = (await response.json()) as Partial<LocalLogoManifest>
      const icons = parsed.icons ?? {}
      if (Object.keys(icons).length === 0) {
        warnOnce('本地品牌 LOGO 清单是空的，将全部使用程序化图标')
      }
      return icons
    } catch {
      return {}
    } finally {
      pending = null
    }
  })().then((icons) => {
    cache = icons
    return icons
  })

  return pending
}

/**
 * 本地 LOGO 是否可用（供设置页显示诊断信息）。
 *
 * 为什么值得暴露：这个能力依赖"用户自己跑过一次 npm run logos"，
 * 而它失败时**界面上一片安静**——用户只会看到一堆字母方块，
 * 完全无法判断是"这些品牌没有图标"还是"我的本地目录是空的"。
 * 这两者的处理方式完全不同，所以必须在界面上能区分。
 */
export function localLogosStatus(): 'unknown' | 'empty' | 'ready' {
  if (!cache) return 'unknown'
  return Object.keys(cache).length > 0 ? 'ready' : 'empty'
}

/** 只告警一次：几十个图标每个都打一行会把控制台刷满 */
let warned = false
function warnOnce(message: string): void {
  if (warned || !import.meta.env.DEV) return
  warned = true
  console.warn(`[duet/logos] ${message}。运行 \`npm run logos\` 可拉取真实品牌图标到 public/brand-local/。`)
}

/**
 * 同步查表：拿到某个工具的本地 LOGO 地址。
 *
 * 需要先调用过 `loadLocalLogos()`（ToolIcon 会在挂载时调用并触发重渲染）。
 * 返回 null 表示没有本地 LOGO，调用方应回退到程序化图标。
 */
export function localLogoUrl(key: string | undefined): string | null {
  if (!key || !cache) return null

  const entry = cache[key]
  if (!entry) return null

  return new URL(`brand-local/${entry.file}`, document.baseURI).href
}

/** 测试用：清掉缓存 */
export function __resetLocalLogosForTests(): void {
  cache = null
  pending = null
  warned = false
}
