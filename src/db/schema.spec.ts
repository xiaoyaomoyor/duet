/**
 * 数据迁移单测（v2 → v3 → v4）
 *
 * 这一层的风险不在"遍历游标"，而在**字段改写**：
 * 哨兵值（星级用 -1 表示未评分，评分用 null）、默认观感（封面是 1:1 + 裁切）、
 * props 合并顺序。改错任何一处，用户的旧工程文件打开后都会"少东西"——
 * 而那是所有失败里最难被接受的一种：看起来像丢数据。
 *
 * 因此这里逐条锁住改写结果，而不是只断言"类型变了"。
 */
import { describe, expect, it } from 'vitest'
import {
  migrateLayout,
  migrateLayoutFill,
  migrateModule,
  migrateSideAccent,
  withTitleRow,
  withoutColumnRatio,
} from './schema'

describe('migrateModule：cover → image', () => {
  it('补上原封面的默认观感', () => {
    const result = migrateModule({
      type: 'cover',
      data: { assetId: 'abc' },
      props: {},
      title: '封面图',
      hidden: false,
    })

    expect(result.type).toBe('image')
    expect(result.props).toMatchObject({ fit: 'cover', ratio: '1/1' })
    // 内容原样保留
    expect(result.data).toEqual({ assetId: 'abc' })
    // 标题、可见性等外壳字段不能丢
    expect(result.title).toBe('封面图')
    expect(result.hidden).toBe(false)
  })

  it('用户已有的 props 优先于迁移默认值', () => {
    const result = migrateModule({
      type: 'cover',
      data: {},
      props: { ratio: '16/9' },
      title: '',
      hidden: false,
    })
    expect(result.props).toMatchObject({ fit: 'cover', ratio: '16/9' })
  })
})

describe('migrateModule：stars → score', () => {
  const migrate = (value: unknown, max?: unknown) =>
    migrateModule({ type: 'stars', data: { value, max }, props: {}, title: '', hidden: false })

  it('正常分数转成 score 并标记为星级外观', () => {
    const result = migrate(4, 5)
    expect(result.type).toBe('score')
    expect(result.data).toEqual({ score: 4, max: 5, label: '', showNumber: false })
    expect(result.props).toMatchObject({ style: 'stars' })
  })

  it('-1 的"未评分"哨兵转成 null（不能变成 0 分）', () => {
    // 这是本次迁移最容易写错的一处：直接搬数值会让"没打分"变成"打了 0 分"
    const result = migrate(-1, 5)
    expect((result.data as { score: unknown }).score).toBeNull()
  })

  it('0 星是有效评分，必须保持为 0 而不是 null', () => {
    const result = migrate(0, 5)
    expect((result.data as { score: unknown }).score).toBe(0)
  })

  it('缺失或非法分数一律转成未评分', () => {
    expect((migrate(undefined, 5).data as { score: unknown }).score).toBeNull()
    expect((migrate('abc', 5).data as { score: unknown }).score).toBeNull()
    expect((migrate(Number.NaN, 5).data as { score: unknown }).score).toBeNull()
  })

  it('缺失满分时回落到 5（星级的默认满分）', () => {
    expect((migrate(3, undefined).data as { max: unknown }).max).toBe(5)
    expect((migrate(3, 0).data as { max: unknown }).max).toBe(5)
  })
})

describe('migrateModule：note → text', () => {
  it('正文搬进 text，语气色搬进 props', () => {
    const result = migrateModule({
      type: 'note',
      data: { text: '音色更干净', tone: 'good' },
      props: {},
      title: '简评',
      hidden: false,
    })

    expect(result.type).toBe('text')
    expect(result.data).toEqual({ text: '音色更干净', align: 'left' })
    expect(result.props).toMatchObject({ variant: 'note', tone: 'good' })
    expect(result.title).toBe('简评')
  })

  it('缺失语气色时回落到中性', () => {
    const result = migrateModule({ type: 'note', data: { text: 'x' }, props: {} })
    expect(result.props).toMatchObject({ tone: 'neutral' })
  })

  it('缺失文本时给空串（而不是 undefined，否则 isEmpty 会读到 undefined）', () => {
    const result = migrateModule({ type: 'note', data: {}, props: {} })
    expect((result.data as { text: unknown }).text).toBe('')
  })
})

describe('migrateModule：幂等与不影响其他模块', () => {
  it('已经是新类型的模块原样返回', () => {
    const image = { type: 'image', data: { assetId: 'a' }, props: {}, title: 'x', hidden: false }
    expect(migrateModule(image)).toEqual(image)

    const score = { type: 'score', data: { score: 3 }, props: {}, title: 'x', hidden: false }
    expect(migrateModule(score)).toEqual(score)
  })

  it('再跑一次迁移不会二次改写（幂等）', () => {
    const once = migrateModule({
      type: 'cover',
      data: { assetId: 'a' },
      props: {},
      title: '',
      hidden: false,
    })
    expect(migrateModule(once)).toEqual(once)
  })

  it('data / props 缺失或类型异常时不崩', () => {
    expect(() => migrateModule({ type: 'cover' })).not.toThrow()
    expect(() => migrateModule({ type: 'stars' })).not.toThrow()
    expect(() => migrateModule({ type: 'note', data: null, props: null })).not.toThrow()

    const result = migrateModule({ type: 'cover', data: null, props: null })
    expect(result.type).toBe('image')
  })
})

/**
 * v3 → v4：把两侧烧死的 hex 认回配色预设。
 *
 * 为什么值得单测：这一步决定"老工程切到亮色主题后颜色对不对"。
 * 认错了会把用户自定义的颜色悄悄改掉；认漏了则浅色主题下依旧看不清。
 */
describe('migrateSideAccent：hex → 预设', () => {
  it('认识的色值会补上 accentPreset，hex 原样保留', () => {
    const result = migrateSideAccent({ id: 'a', accent: '#a78bfa' })
    expect(result.accentPreset).toBe('violet')
    // hex 不动：它仍然是"不认预设的路径"的回退值
    expect(result.accent).toBe('#a78bfa')
  })

  it('亮色主题下的取值同样能认回来（老工程可能在浅色下创建）', () => {
    expect(migrateSideAccent({ accent: '#6d28d9' }).accentPreset).toBe('violet')
    expect(migrateSideAccent({ accent: '#0e7490' }).accentPreset).toBe('cyan')
  })

  it('自定义颜色原样保留，不硬塞一个预设', () => {
    const custom = { id: 'a', accent: '#123456' }
    // 用户当初选的就是自定义色，我们无权替他改成别的
    expect(migrateSideAccent(custom)).toEqual(custom)
  })

  it('已经有 accentPreset 的侧不再处理（幂等）', () => {
    const side = { accent: '#ff0000', accentPreset: 'red' }
    expect(migrateSideAccent(side)).toEqual(side)
    // 连跑两次结果一致
    expect(migrateSideAccent(migrateSideAccent(side))).toEqual(side)
  })

  it('accent 缺失或类型异常时不崩', () => {
    expect(() => migrateSideAccent({})).not.toThrow()
    expect(() => migrateSideAccent({ accent: 123 })).not.toThrow()
    expect(migrateSideAccent({ accent: null }).accentPreset).toBeUndefined()
  })
})

/**
 * v4 → v5：删掉 layout.density。
 *
 * 为什么要删而不是留着不管：渲染层已经不再读它，留着的话老工程里的
 * `'comfy'` 会永远躺在那儿，下一个读代码的人会以为它还有效、
 * 去改却看不到任何变化——这种"看起来能用的死字段"比缺字段更难查。
 */
describe('migrateLayout：移除 density', () => {
  it('删掉 density，其余字段原样保留', () => {
    const result = migrateLayout({
      ratio: [1, 1],
      gutter: 32,
      density: 'comfy',
      showAxis: true,
      background: 'grid',
      maxWidth: 1440,
    })

    expect('density' in result).toBe(false)
    expect(result.gutter).toBe(32)
    expect(result.background).toBe('grid')
    expect(result.maxWidth).toBe(1440)
  })

  it('幂等：再跑一次结果不变', () => {
    const once = migrateLayout({ gutter: 8, density: 'normal' })
    expect(migrateLayout(once)).toEqual(once)
  })

  it('没有 density 时是空操作（不能顺手改动别的）', () => {
    const layout = { ratio: [2, 1], gutter: 48, showAxis: false }
    expect(migrateLayout(layout)).toEqual(layout)
  })
})

/**
 * v5 → v6：填充形式改语义。
 *
 * 旧值 `pattern`（图案铺在内容区）→ 新值 `content`，
 * 旧值 `solid`（整页铺一层实心底色）→ 新值 `page`（图案充满整页）。
 * 必须**映射**而不是丢弃：老工程打开后应当保持它原本的观感。
 */
describe('migrateLayoutFill：填充形式的旧值映射', () => {
  it('pattern → content', () => {
    expect(migrateLayoutFill({ backgroundFill: 'pattern' }).backgroundFill).toBe('content')
  })

  it('solid → page', () => {
    expect(migrateLayoutFill({ backgroundFill: 'solid' }).backgroundFill).toBe('page')
  })

  it('新值原样保留（幂等）', () => {
    expect(migrateLayoutFill({ backgroundFill: 'page' }).backgroundFill).toBe('page')
    expect(migrateLayoutFill({ backgroundFill: 'content' }).backgroundFill).toBe('content')
  })

  it('没设过就不写这个键（不能被迁移"顺手"补一个值）', () => {
    expect('backgroundFill' in migrateLayoutFill({ gutter: 32 })).toBe(false)
  })

  it('其余字段不受影响', () => {
    const result = migrateLayoutFill({ gutter: 48, background: 'grid', backgroundFill: 'solid' })
    expect(result.gutter).toBe(48)
    expect(result.background).toBe('grid')
  })
})

/**
 * v6 → v7：给老工程补一个「标题」行。
 *
 * 工具名卡片从"画布顶部自动绘制"变成了普通模块，老工程里没有它。
 * 不补的话，用户打开历史工程会发现"两边的工具名都不见了"——
 * 比改动之前还少东西，这是最不能被接受的一种回归。
 */
describe('withTitleRow：补「标题」行', () => {
  const cell = (modules: Array<{ type: string }>) => ({ modules, hidden: false })

  it('没有任何 title 模块时，在最前面插一行', () => {
    const rows = [
      { id: 'r1', kind: 'paired', cells: { a: cell([{ type: 'image' }]), b: cell([]) } },
      { id: 'r2', kind: 'paired', cells: { a: cell([]), b: cell([]) } },
    ]
    const next = withTitleRow(rows)
    expect(next).toHaveLength(3)
    const head = next[0] as { cells: Record<string, { modules: Array<{ type: string }> }> }
    expect(head.cells.a?.modules[0]?.type).toBe('title')
    expect(head.cells.b?.modules[0]?.type).toBe('title')
    // 原来那两行原样跟在后面
    expect((next[1] as { id: string }).id).toBe('r1')
  })

  it('已经有 title 模块时不重复插入（用户自己放过了）', () => {
    const rows = [{ id: 'r1', kind: 'paired', cells: { a: cell([{ type: 'title' }]), b: cell([]) } }]
    expect(withTitleRow(rows)).toBe(rows)
  })

  it('一行都没有时不动（空工程没有可供推断两侧 id 的依据）', () => {
    expect(withTitleRow([])).toEqual([])
  })
})

/**
 * v7 → v8：删掉 layout.ratio。
 *
 * v0.5.5 移除了"拖动中轴调左右宽度"（用户："实用性不强"），两侧恒为等宽。
 * 与 v0.4.0 删 density 同一个理由：只有一种取值、又没有界面的字段必须删掉，
 * 否则下一个读代码的人会以为它还有效。
 */
describe('withoutColumnRatio：移除左右宽度比', () => {
  it('删掉 ratio，其余字段原样保留', () => {
    const result = withoutColumnRatio({ ratio: [2, 1], gutter: 40, background: 'grid' })
    expect('ratio' in result).toBe(false)
    expect(result.gutter).toBe(40)
    expect(result.background).toBe('grid')
  })

  it('幂等：再跑一次结果不变', () => {
    const once = withoutColumnRatio({ ratio: [1, 1], gutter: 32 })
    expect(withoutColumnRatio(once)).toEqual(once)
  })

  it('没有 ratio 时是空操作', () => {
    const layout = { gutter: 48, maxWidth: 1440 }
    expect(withoutColumnRatio(layout)).toEqual(layout)
  })
})
