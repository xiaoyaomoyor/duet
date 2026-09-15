/**
 * 极简 Markdown 单测（纯函数）
 *
 * 两个重点：
 *   1. **安全顺序**——必须先整体转义 HTML 再做 Markdown 替换。
 *      顺序写反就是一个 XSS 漏洞，所以这里有专门的用例盯着它。
 *   2. 中文排版习惯——不要在词中间乱插空格。
 */
import { describe, expect, it } from 'vitest'
import { escapeHtml, markdownToPlainText, renderMarkdown } from './markdown'

describe('renderMarkdown —— 安全', () => {
  it('HTML 标签被转义而不是执行（先转义、后解析的顺序不能变）', () => {
    const result = renderMarkdown('<script>alert(1)</script>')
    expect(result).not.toContain('<script')
    expect(result).toContain('&lt;script&gt;')
  })

  it('内联事件处理器进不来', () => {
    const result = renderMarkdown('<img src=x onerror=alert(1)>')
    // 整段变成转义后的**文字**：能看见，但没有元素、没有处理器
    expect(result).toBe('<p class="md__p">&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(result).not.toMatch(/<img/i)
  })

  it('链接只允许 http/https，javascript: 协议被无视', () => {
    const result = renderMarkdown('[点我](javascript:alert(1))')
    expect(result).not.toContain('href')
    expect(result).not.toContain('<a ')
  })

  it('data: 协议同样不生成链接', () => {
    const result = renderMarkdown('[点我](data:text/html;base64,PHNjcmlwdD4=)')
    expect(result).not.toContain('<a ')
  })

  it('转义后再解析，因此用户无法用实体绕过转义', () => {
    // &lt;script&gt; 会被当成普通文字，不会再被解析回标签
    const result = renderMarkdown('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result).not.toMatch(/<script/i)
    expect(result).toContain('&amp;lt;script&amp;gt;')
  })

  it('allowLinks: false 时不生成任何链接', () => {
    const result = renderMarkdown('[文字](https://a.b)', { allowLinks: false })
    expect(result).not.toContain('<a ')
    expect(result).toContain('[文字](https://a.b)')
  })
})

describe('renderMarkdown —— 块级语法', () => {
  it('标题 h1~h4', () => {
    expect(renderMarkdown('# 一级')).toBe('<h1 class="md__h1">一级</h1>')
    expect(renderMarkdown('### 三级')).toBe('<h3 class="md__h3">三级</h3>')
  })

  it('超过四级的 # 当普通段落（不做 h5/h6）', () => {
    const result = renderMarkdown('##### 五级')
    expect(result).toBe('<p class="md__p">##### 五级</p>')
  })

  it('连续两行合成一个段落并用 <br> 连接', () => {
    expect(renderMarkdown('第一行\n第二行')).toBe('<p class="md__p">第一行<br>第二行</p>')
  })

  it('空行分段', () => {
    expect(renderMarkdown('甲\n\n乙')).toBe('<p class="md__p">甲</p><p class="md__p">乙</p>')
  })

  it('无序列表（- * + 都认）', () => {
    const expected = '<ul class="md__list"><li class="md__li">甲</li><li class="md__li">乙</li></ul>'
    expect(renderMarkdown('- 甲\n- 乙')).toBe(expected)
    expect(renderMarkdown('* 甲\n* 乙')).toBe(expected)
    expect(renderMarkdown('+ 甲\n+ 乙')).toBe(expected)
  })

  it('有序列表', () => {
    expect(renderMarkdown('1. 甲\n2. 乙')).toBe(
      '<ol class="md__list"><li class="md__li">甲</li><li class="md__li">乙</li></ol>',
    )
  })

  it('列表结束后再起段落不会把段落吞进列表里', () => {
    const result = renderMarkdown('- 项\n\n正文')
    expect(result).toBe('<ul class="md__list"><li class="md__li">项</li></ul><p class="md__p">正文</p>')
  })

  it('列表类型切换会先闭合上一个列表', () => {
    const result = renderMarkdown('- 甲\n1. 乙')
    expect(result).toBe(
      '<ul class="md__list"><li class="md__li">甲</li></ul>' +
        '<ol class="md__list"><li class="md__li">乙</li></ol>',
    )
  })

  it('引用', () => {
    expect(renderMarkdown('> 引用内容')).toBe('<blockquote class="md__quote">引用内容</blockquote>')
  })

  it('分割线（--- / *** / ___）', () => {
    expect(renderMarkdown('---')).toBe('<hr class="md__hr">')
    expect(renderMarkdown('***')).toBe('<hr class="md__hr">')
    expect(renderMarkdown('___')).toBe('<hr class="md__hr">')
  })

  it('两个连字符不算分割线', () => {
    expect(renderMarkdown('--')).toBe('<p class="md__p">--</p>')
  })

  it('空输入返回空串', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('\n\n')).toBe('')
  })
})

describe('renderMarkdown —— 行内语法', () => {
  it('粗体 / 斜体 / 删除线', () => {
    expect(renderMarkdown('**粗**')).toBe('<p class="md__p"><strong class="md__strong">粗</strong></p>')
    expect(renderMarkdown('*斜*')).toBe('<p class="md__p"><em class="md__em">斜</em></p>')
    expect(renderMarkdown('~~删~~')).toBe('<p class="md__p"><del class="md__del">删</del></p>')
  })

  it('粗体优先于斜体（** 不会被当成两个 *）', () => {
    expect(renderMarkdown('**粗**')).not.toContain('<em')
  })

  it('同一行里粗体与斜体共存', () => {
    const result = renderMarkdown('**粗** 和 *斜*')
    expect(result).toContain('<strong class="md__strong">粗</strong>')
    expect(result).toContain('<em class="md__em">斜</em>')
  })

  it('链接（显式写法）', () => {
    expect(renderMarkdown('[文档](https://example.com/a)')).toBe(
      '<p class="md__p"><a class="md__link" href="https://example.com/a" target="_blank" rel="noopener noreferrer">文档</a></p>',
    )
  })

  it('裸链接也会转成可点链接', () => {
    const result = renderMarkdown('见 https://example.com/x 说明')
    expect(result).toContain('<a class="md__link" href="https://example.com/x"')
  })

  it('行内代码不参与粗斜体解析', () => {
    const result = renderMarkdown('`a **b** c`')
    expect(result).toBe('<p class="md__p"><code class="md__inline-code">a **b** c</code></p>')
  })

  it('行内代码里的尖括号保持转义后的字面量', () => {
    const result = renderMarkdown('`<div>`')
    expect(result).toBe('<p class="md__p"><code class="md__inline-code">&lt;div&gt;</code></p>')
  })
})

describe('renderMarkdown —— 代码块', () => {
  it('围栏代码块单独成块', () => {
    expect(renderMarkdown('```\ncode\n```')).toBe(
      '<pre class="md__pre"><code class="md__code">code</code></pre>',
    )
  })

  it('带语言标记时写入 data-lang', () => {
    expect(renderMarkdown('```ts\nconst a = 1\n```')).toBe(
      '<pre class="md__pre"><code class="md__code" data-lang="ts">const a = 1</code></pre>',
    )
  })

  it('代码块内的 Markdown 标记保持原样', () => {
    const result = renderMarkdown('```\n# 不是标题\n- 不是列表\n```')
    expect(result).not.toContain('<h1')
    expect(result).not.toContain('<ul')
    expect(result).toContain('# 不是标题')
  })

  it('代码块内的尖括号被转义，不会变成真标签', () => {
    const result = renderMarkdown('```\n<script>alert(1)</script>\n```')
    expect(result).not.toMatch(/<script/i)
    expect(result).toContain('&lt;script&gt;')
  })

  it('代码块前后的段落正常渲染', () => {
    const result = renderMarkdown('前\n\n```\nc\n```\n\n后')
    expect(result).toContain('<p class="md__p">前</p>')
    expect(result).toContain('<pre class="md__pre">')
    expect(result).toContain('<p class="md__p">后</p>')
  })

  it('pre 永远不会被包进 p 里（浏览器会提前闭合段落，DOM 就坏了）', () => {
    for (const source of [
      '```\nc\n```',
      '文字\n\n```\nc\n```',
      '```\nc\n```\n\n文字',
      '# 标题\n```\nc\n```',
      '- 项\n```\nc\n```',
    ]) {
      expect(renderMarkdown(source), source).not.toMatch(/<p[^>]*>(?:(?!<\/p>)[\s\S])*<pre/)
    }
  })

  it('围栏后同一行的文字不会被吞掉', () => {
    const result = renderMarkdown('```\nc\n``` 尾巴')
    expect(result).toContain('<pre class="md__pre">')
    expect(result).toContain('尾巴')
  })
})

describe('escapeHtml', () => {
  it('转义五个危险字符', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('& 先转，避免二次转义', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('markdownToPlainText', () => {
  it('剥掉标记只留文字', () => {
    expect(markdownToPlainText('# 标题\n\n**粗** 文字')).toBe('标题 粗 文字')
  })

  it('保留产品名里的连字符（这是本项目最要紧的一条）', () => {
    // 曾经的实现用 /[#>*_~-]+/g 全局替换，把 "GPT-4o" 啃成了 "GPT 4o"
    expect(markdownToPlainText('GPT-4o 与 Tripo3D-v2.5')).toBe('GPT-4o 与 Tripo3D-v2.5')
    expect(markdownToPlainText('- GPT-SoVITS')).toBe('GPT-SoVITS')
  })

  it('列表与引用标记只剥行首', () => {
    expect(markdownToPlainText('- 甲\n- 乙')).toBe('甲 乙')
    expect(markdownToPlainText('> 引用')).toBe('引用')
  })

  it('分割线不留下横杠', () => {
    expect(markdownToPlainText('前\n\n---\n\n后')).toBe('前 后')
  })

  it('链接保留链接文字', () => {
    expect(markdownToPlainText('见 [文档](https://a.b)')).toBe('见 文档')
  })

  it('代码块内容整体略去，行内代码保留', () => {
    expect(markdownToPlainText('```\n一堆代码\n```')).toBe('')
    expect(markdownToPlainText('用 `npm run dev` 启动')).toBe('用 npm run dev 启动')
  })

  it('超长截断', () => {
    expect(markdownToPlainText('字'.repeat(300), 10)).toBe('字'.repeat(10) + '…')
  })

  it('空输入返回空串', () => {
    expect(markdownToPlainText('')).toBe('')
    expect(markdownToPlainText('   \n  ')).toBe('')
  })
})
