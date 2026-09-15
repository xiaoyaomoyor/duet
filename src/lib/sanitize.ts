/**
 * HTML 净化（纯函数）
 *
 * 为什么必须有：
 *   "富文本"模块把用户输入按 HTML 保存，而渲染时走 v-html。
 *   如果直接把粘贴来的 HTML 原样渲染，就等于让别人在你页面上执行脚本。
 *   这里采用**白名单**策略：不在名单里的一律丢弃（不是转义，而是删除标签）。
 *
 * 实现方式：不依赖 DOM 解析器（在单测里也能跑），
 * 先用正则剥离危险区块，再逐个过滤标签，最后过滤属性。
 */

/** 允许保留的标签（全部是排版用途，没有交互能力） */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'span',
])

/** 允许保留的属性（只有 class，用来承载语义化样式） */
const ALLOWED_ATTRS = new Set(['class'])

/** 危险区块：连内容一起删除 */
const DANGEROUS_BLOCKS = [
  /<script[\s\S]*?<\/script>/gi,
  /<style[\s\S]*?<\/style>/gi,
  /<iframe[\s\S]*?<\/iframe>/gi,
  /<object[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[\s\S]*?>/gi,
  /<meta[\s\S]*?>/gi,
]

/** 完整标签（开始或结束） */
const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g

/**
 * 白名单标签的占位符。
 *
 * 这里刻意使用 NUL（\u0000）作为定界符，因此需要对 no-control-regex 例外：
 * 占位符必须是**用户无法在输入里伪造**的形态，而 NUL 是唯一保证——
 * 第 ⓪ 步会先把它从输入中全部剔除。换成普通字符（如 `@@`）
 * 就等于让用户自己拼出占位符，进而绕过属性过滤。
 */
// eslint-disable-next-line no-control-regex -- 见上方说明：NUL 是刻意且必需的定界符
const PLACEHOLDER_PATTERN = /\u0000T(\d+)\u0000/g

/**
 * 净化 HTML 片段。
 * @returns 只含白名单标签与属性的 HTML
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ''

  // ⓪ 先剔除 NUL：它是内部占位符的定界符，不能让用户自己造出来
  // eslint-disable-next-line no-control-regex -- 同上：这里正是在清理用户输入里的 NUL
  let html = input.replace(/\u0000/g, '')

  // ① 去掉危险区块（含其内容）
  for (const pattern of DANGEROUS_BLOCKS) {
    html = html.replace(pattern, '')
  }

  // ② 去掉 HTML 注释（注释里可以藏条件注释脚本）
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // ③ 逐标签处理：白名单标签换成占位符，其余（含其属性）整体丢弃
  const kept: string[] = []
  html = html.replace(TAG_PATTERN, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''

    kept.push(match.startsWith('</') ? `</${tag}>` : buildOpenTag(tag, rawAttrs))
    return `\u0000T${kept.length - 1}\u0000`
  })

  // ④ 此时剩下的 < 必然属于"半截标签"（如 `<div` 没闭合、`a < b`）。
  //    全部转义——占位符里没有尖括号，因此不会误伤第 ③ 步保留的标签。
  //    这比"用负向断言猜哪些 < 是安全的"可靠得多：漏掉一个就是一个注入点。
  html = html.replace(/</g, '&lt;')

  // ⑤ 还原白名单标签
  return html.replace(PLACEHOLDER_PATTERN, (_match, index: string) => kept[Number(index)] ?? '')
}

/** 生成规范化的开始标签（属性已过滤） */
function buildOpenTag(tag: string, rawAttrs: string): string {
  const attrs = filterAttributes(rawAttrs)
  return attrs ? `<${tag} ${attrs}>` : `<${tag}>`
}

/** 只保留白名单属性，并去掉所有事件处理器与 javascript: 协议 */
function filterAttributes(raw: string): string {
  const out: string[] = []

  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null

  while ((match = attrPattern.exec(raw)) !== null) {
    const name = (match[1] ?? '').toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''

    if (!ALLOWED_ATTRS.has(name)) continue
    if (name.startsWith('on')) continue
    if (/javascript:/i.test(value)) continue

    out.push(`${name}="${escapeAttr(value)}"`)
  }

  return out.join(' ')
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 纯文本摘要：用于"是否算已填写"与列表预览 */
export function htmlToPlainText(input: string, maxLength = 200): string {
  const text = (input ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
