/**
 * HTML 净化单测（纯函数）
 *
 * 这是全项目安全等级最高的一段代码：它的输出会直接走 v-html。
 * 因此测试的重点不是"排版对不对"，而是**有没有任何一个口子能塞进可执行的东西**。
 * 每个用例都对应一种真实见过的注入手法。
 */
import { describe, expect, it } from 'vitest'
import { htmlToPlainText, sanitizeHtml } from './sanitize'

describe('sanitizeHtml —— 危险内容必须消失', () => {
  it('script 连内容一起删除', () => {
    const result = sanitizeHtml('<p>前</p><script>alert(1)</script><p>后</p>')
    expect(result).toBe('<p>前</p><p>后</p>')
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
  })

  it('style / iframe / object / embed / link / meta 同样删除', () => {
    expect(sanitizeHtml('<style>body{display:none}</style>x')).toBe('x')
    expect(sanitizeHtml('<iframe src="https://evil"></iframe>x')).toBe('x')
    expect(sanitizeHtml('<object data="x"></object>x')).toBe('x')
    expect(sanitizeHtml('<embed src="x">x')).toBe('x')
    expect(sanitizeHtml('<link rel="stylesheet" href="x">x')).toBe('x')
    expect(sanitizeHtml('<meta http-equiv="refresh" content="0">x')).toBe('x')
  })

  it('大小写混写的危险标签照样拦住', () => {
    expect(sanitizeHtml('<ScRiPt>alert(1)</ScRiPt>x')).toBe('x')
    expect(sanitizeHtml('<IFRAME></IFRAME>x')).toBe('x')
  })

  it('HTML 注释被删除（条件注释里可以藏脚本）', () => {
    expect(sanitizeHtml('a<!--[if IE]><script>x</script><![endif]-->b')).toBe('ab')
    expect(sanitizeHtml('a<!-- 普通注释 -->b')).toBe('ab')
  })

  it('不在白名单的标签被整体丢弃（不是转义）', () => {
    // div / table / a 都不在名单里：标签没了，文字留下
    expect(sanitizeHtml('<div>内容</div>')).toBe('内容')
    expect(sanitizeHtml('<a href="https://x">链接</a>')).toBe('链接')
    expect(sanitizeHtml('<table><tr><td>格</td></tr></table>')).toBe('格')
  })

  it('on* 事件处理器一律丢弃', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<p onmouseover=alert(1)>x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<span ONLOAD="x" class="a">y</span>')).toBe('<span class="a">y</span>')
  })

  it('非白名单属性一律丢弃（style / href / src / id …）', () => {
    expect(sanitizeHtml('<p style="position:fixed;top:0">x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<p id="a" data-x="1" class="k">x</p>')).toBe('<p class="k">x</p>')
  })

  it('属性值里的 javascript: 会被拦下', () => {
    expect(sanitizeHtml('<p class="javascript:alert(1)">x</p>')).toBe('<p>x</p>')
  })
})

describe('sanitizeHtml —— 白名单内容保持不变', () => {
  it('允许的标签原样保留', () => {
    expect(sanitizeHtml('<p>段落</p>')).toBe('<p>段落</p>')
    expect(sanitizeHtml('<strong>粗</strong><em>斜</em>')).toBe('<strong>粗</strong><em>斜</em>')
    expect(sanitizeHtml('<ul><li>项</li></ul>')).toBe('<ul><li>项</li></ul>')
    expect(sanitizeHtml('<h2>标题</h2>')).toBe('<h2>标题</h2>')
    expect(sanitizeHtml('<blockquote>引</blockquote>')).toBe('<blockquote>引</blockquote>')
    expect(sanitizeHtml('<pre><code>code</code></pre>')).toBe('<pre><code>code</code></pre>')
  })

  it('class 属性保留，值里的引号被转义', () => {
    expect(sanitizeHtml('<p class="md__p">x</p>')).toBe('<p class="md__p">x</p>')
    expect(sanitizeHtml("<p class='a b'>x</p>")).toBe('<p class="a b">x</p>')
    // 想用引号逃出属性：转义后只能老实待在值里
    expect(sanitizeHtml('<p class="a&quot; onload=&quot;x">y</p>')).toBe('<p class="a&amp;quot; onload=&amp;quot;x">y</p>')
  })

  it('br 的自闭合写法统一成 <br>', () => {
    expect(sanitizeHtml('a<br>b')).toBe('a<br>b')
    expect(sanitizeHtml('a<br/>b')).toBe('a<br>b')
    expect(sanitizeHtml('a<br />b')).toBe('a<br>b')
  })

  it('标签名统一转小写（避免出现同一标签的两种写法）', () => {
    expect(sanitizeHtml('<P>大写</P>')).toBe('<p>大写</p>')
    expect(sanitizeHtml('<STRONG>x</STRONG>')).toBe('<strong>x</strong>')
  })

  it('纯文本原样返回', () => {
    expect(sanitizeHtml('就是一段普通中文，带标点。')).toBe('就是一段普通中文，带标点。')
    expect(sanitizeHtml('a > b')).toBe('a > b')
  })

  it('空输入返回空串', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})

describe('sanitizeHtml —— 半截标签的兜底', () => {
  it('未闭合的尖括号被转义（浏览器不会拿它补出一个元素）', () => {
    expect(sanitizeHtml('a < b')).toBe('a &lt; b')
    expect(sanitizeHtml('1 < 2 且 3 > 2')).toBe('1 &lt; 2 且 3 > 2')
    expect(sanitizeHtml('<div')).toBe('&lt;div')
    expect(sanitizeHtml('<div class="x"')).toBe('&lt;div class="x"')
    expect(sanitizeHtml('<3')).toBe('&lt;3')
  })

  it('残缺的 script 开标签也被转义（不能靠漏掉闭合标签绕过）', () => {
    const result = sanitizeHtml('<p>前</p><script')
    expect(result).toBe('<p>前</p>&lt;script')
    expect(result).not.toMatch(/<script/i)
  })

  it('行内的 < 不会凭空造出白名单之外的元素', () => {
    // 注意：浏览器的分词器本身就把 `<b c</p>` 当成一个 b 元素
    // （`<` 在属性名里是普通字符），所以这里不能断言"原样转义"，
    // 只能断言真正要紧的性质：没有非白名单元素、没有残留属性、没有脚本。
    const result = sanitizeHtml('<p>a <b c</p>')
    expect(result).toBe('<p>a <b>')
    expect(result).not.toMatch(/<(?!\/?(?:p|b|br|strong|em|u|s|del|ul|ol|li|blockquote|code|pre|h[1-4]|span)\b)/)
    expect(result).not.toContain('c</p')
  })

  it('未闭合的 script 混在属性位置也进不来', () => {
    // <b x<script> 被当作"b 标签 + 一个叫 x<script 的属性"，属性被丢弃；
    // 后面的 alert(1) 只剩普通文字——可读但不可执行，这正是我们要的结果。
    const result = sanitizeHtml('<b x<script>alert(1)')
    expect(result).toBe('<b>alert(1)')
    expect(result).not.toMatch(/<script/i)
  })
})

describe('sanitizeHtml —— 占位符不可伪造', () => {
  it('输入里的 NUL 会被剔除，因此无法伪造内部占位符', () => {
    // 占位符形态是 \u0000T0\u0000；用户塞进来也只会被清掉
    const forged = '<p>x</p>\u0000T0\u0000<script>alert(1)</script>'
    const result = sanitizeHtml(forged)
    expect(result).toBe('<p>x</p>T0')
    expect(result).not.toContain('<script')
  })

  it('前后多次调用互不干扰（占位符表是调用局部的）', () => {
    expect(sanitizeHtml('<p>甲</p>')).toBe('<p>甲</p>')
    expect(sanitizeHtml('<p>乙</p>')).toBe('<p>乙</p>')
    expect(sanitizeHtml('<b>丙</b>')).toBe('<b>丙</b>')
  })
})

describe('htmlToPlainText', () => {
  it('剥掉标签只留文字', () => {
    expect(htmlToPlainText('<p>你好</p><p>世界</p>')).toBe('你好 世界')
  })

  it('还原常用实体', () => {
    expect(htmlToPlainText('a&nbsp;b&amp;c&lt;d&gt;e')).toBe('a b&c<d>e')
  })

  it('连续空白折叠成一个空格', () => {
    expect(htmlToPlainText('<p>a</p>\n\n   <p>b</p>')).toBe('a b')
  })

  it('超长时截断并加省略号', () => {
    const result = htmlToPlainText('<p>' + '字'.repeat(300) + '</p>', 10)
    expect(result).toBe('字'.repeat(10) + '…')
  })

  it('空输入返回空串', () => {
    expect(htmlToPlainText('')).toBe('')
    expect(htmlToPlainText('<p></p>')).toBe('')
  })
})
