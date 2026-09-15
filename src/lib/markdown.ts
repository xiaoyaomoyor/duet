/**
 * 极简 Markdown 渲染（纯函数，零依赖）
 *
 * 为什么不引 marked/markdown-it：
 *   本项目只需要"把用户写的说明文字排得好看"，不需要完整 CommonMark。
 *   一个 100 行的子集实现能覆盖 95% 的实际用法，且没有供应链与体积成本。
 *
 * 安全纪律（这是重点）：
 *   **先整体转义 HTML，再做 Markdown 替换**。
 *   顺序反过来就会留下 XSS 口子——用户从网上粘一段带 <script> 的文本，
 *   直接渲染就等于执行了别人的代码。因为本文件的输出会走 v-html，
 *   这条顺序不能变，测试里也有对应用例。
 */

/** 支持的块级与行内语法（子集） */
export interface MarkdownOptions {
  /** 是否允许链接（默认允许，但只允许 http/https） */
  allowLinks?: boolean
}

/**
 * 渲染 Markdown 为 HTML 片段。
 *
 * 注意：返回值已经做过 HTML 转义，仅包含本函数生成的标签，可安全用于 v-html。
 */
export function renderMarkdown(input: string, options: MarkdownOptions = {}): string {
  if (!input) return ''

  const allowLinks = options.allowLinks !== false

  // ① 先整体转义：此后所有 < > & 都已是实体，用户无法注入标签
  let text = escapeHtml(input)

  // ② 抽出代码块（先占位，避免块内内容被后续规则误伤）
  const codeBlocks: string[] = []
  text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const index = codeBlocks.length
    codeBlocks.push(
      `<pre class="md__pre"><code class="md__code"${
        lang ? ` data-lang="${lang}"` : ''
      }>${code.replace(/\n$/, '')}</code></pre>`,
    )
    return `\u0000CODE${index}\u0000`
  })

  // ③ 行内代码
  const inlineCodes: string[] = []
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const index = inlineCodes.length
    inlineCodes.push(`<code class="md__inline-code">${code}</code>`)
    return `\u0000INLINE${index}\u0000`
  })

  // ④ 块级：按行处理
  const lines = text.split(/\r?\n/)
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let paragraph: string[] = []

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    html.push(`<p class="md__p">${paragraph.join('<br>')}</p>`)
    paragraph = []
  }

  const closeList = (): void => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  const openList = (type: 'ul' | 'ol'): void => {
    if (listType === type) return
    closeList()
    html.push(`<${type} class="md__list">`)
    listType = type
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.trim() === '') {
      flushParagraph()
      closeList()
      continue
    }

    // 代码块占位符必须按**块级**元素输出。
    // 若放任它落进段落分支，就会生成 <p><pre>…</pre></p>——
    // 浏览器解析到 <pre> 时会提前闭合 <p>，DOM 结构与预期不符
    // （编辑视图看起来正常，复制/导出时就露馅了）。
    //
    // 占位符用 NUL 定界（见下方还原处说明），故此处对 no-control-regex 例外。
    // eslint-disable-next-line no-control-regex -- NUL 是刻意选用的定界符
    const codeLine = /^\u0000CODE(\d+)\u0000/.exec(line)
    if (codeLine) {
      flushParagraph()
      closeList()
      html.push(`\u0000CODE${codeLine[1]}\u0000`)

      // 围栏后同一行还有文字（少见）：当成独立段落，别丢
      const rest = line.slice(codeLine[0].length).trim()
      if (rest) paragraph.push(inline(rest))
      continue
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1]!.length
      html.push(`<h${level} class="md__h${level}">${inline(heading[2] ?? '')}</h${level}>`)
      continue
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushParagraph()
      closeList()
      html.push('<hr class="md__hr">')
      continue
    }

    // 引用
    const quote = /^&gt;\s?(.*)$/.exec(line)
    if (quote) {
      flushParagraph()
      closeList()
      html.push(`<blockquote class="md__quote">${inline(quote[1] ?? '')}</blockquote>`)
      continue
    }

    // 无序列表
    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      openList('ul')
      html.push(`<li class="md__li">${inline(bullet[1] ?? '')}</li>`)
      continue
    }

    // 有序列表
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      openList('ol')
      html.push(`<li class="md__li">${inline(ordered[1] ?? '')}</li>`)
      continue
    }

    // 普通段落行
    closeList()
    paragraph.push(inline(line))
  }

  flushParagraph()
  closeList()

  // ⑤ 还原占位
  //
  // 占位符用 NUL（\u0000）定界，因此这两行对 no-control-regex 例外：
  // 代码块/行内代码的内容里**可能包含任何字符**（用户粘贴的代码就是如此），
  // 只有 NUL 能保证不会被内容里的文本意外命中。
  // 输入在第一步已被 escapeHtml 处理，NUL 也会原样保留而不会与内容混淆。
  let output = html.join('')
  /* eslint-disable no-control-regex -- 见上方说明：NUL 是刻意选用的定界符 */
  output = output.replace(/\u0000INLINE(\d+)\u0000/g, (_m, index: string) => inlineCodes[Number(index)] ?? '')
  output = output.replace(/\u0000CODE(\d+)\u0000/g, (_m, index: string) => codeBlocks[Number(index)] ?? '')
  /* eslint-enable no-control-regex */

  return output

  /** 行内语法：粗体 / 斜体 / 删除线 / 链接 */
  function inline(source: string): string {
    let out = source

    // 链接：只允许 http/https，避免 javascript: 之类的协议注入
    if (allowLinks) {
      out = out.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a class="md__link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      // 裸链接
      out = out.replace(
        /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
        '$1<a class="md__link" href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
      )
    }

    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="md__strong">$1</strong>')
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em class="md__em">$2</em>')
    out = out.replace(/~~([^~]+)~~/g, '<del class="md__del">$1</del>')

    return out
  }
}

/** HTML 转义（本文件的渲染顺序依赖它先执行） */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 纯文本摘要：用于编辑器预览与"是否算已填写"的判定。
 *
 * 只剥离**行首**的标记符（标题 / 引用 / 列表），不做全局字符过滤——
 * 否则 "GPT-4o"、"Tripo3D-v2.5" 这类产品名会被啃掉连字符，
 * 而本项目的绝大多数内容恰好就是产品名。
 */
export function markdownToPlainText(input: string, maxLength = 200): string {
  const text = (input ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '') // 标题
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '') // 引用
    .replace(/^[ \t]{0,3}[-*+][ \t]+/gm, '') // 无序列表
    .replace(/^[ \t]{0,3}\d+[.)][ \t]+/gm, '') // 有序列表
    .replace(/^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '') // 分割线
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
    .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
    .replace(/~~(.*?)~~/g, '$1') // 删除线
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
