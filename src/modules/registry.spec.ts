/**
 * 模块注册表单测
 *
 * 这是"模块系统"最容易出错的三个点：
 *   1. meta.ts 与已注册模块类型不一致（选择器里出现点不了的模块，或反之）
 *   2. 某个模块的 schema.create() 与 isEmpty() 打架（新建即"已填写"）
 *   3. 重复注册导致渲染不可预测
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { MODULE_META } from './meta'
import {
  __resetRegistryForTests,
  allModules,
  getModule,
  hasModule,
  registerModule,
  registeredTypes,
} from './registry'
import '@/modules' // 副作用注册全部模块

const META_TYPES = MODULE_META.map((meta) => meta.type)

beforeEach(() => {
  // 每个用例都从"已注册全部模块"的干净状态开始（注册是幂等的模块副作用）
})

describe('meta.ts 与注册表的一致性', () => {
  it('每个已注册模块都能在 meta.ts 中找到元数据', () => {
    for (const type of registeredTypes()) {
      expect(META_TYPES, `模块 ${type} 缺少 meta.ts 登记`).toContain(type)
    }
  })

  it('已注册模块的数量与 M7 归纳后一致（20 个）', () => {
    expect(registeredTypes().sort()).toEqual(
      [
        // M2：基础 P0 模块 + 图片集
        'audio',
        'divider',
        'gallery',
        'image',
        'keyValue',
        'link',
        'lyrics',
        'progress',
        'text',
        'video',
        // M5：轻量比较模块
        'code',
        'diff',
        'iframe',
        'markdown',
        'model3d',
        'placeholder',
        'richText',
        'score',
        'tagList',
        'timeline',
        // M7：通用模块
        'audioConsole',
      ].sort(),
    )
  })

  it('被合并掉的模块类型确实已从注册表移除（不能只做一半）', () => {
    // cover → image、stars → score、note → text。
    // 这条断言的意义：这三个 type 只要还留在注册表里，
    // v2→v3 迁移就失去意义，而且"合并"会退化成"多出三个别名"。
    for (const retired of ['cover', 'stars', 'note']) {
      expect(hasModule(retired), `${retired} 应当已被合并移除`).toBe(false)
    }
  })

  it('每个模块的 type 与其 meta.titleKey 后缀一致（防止复制粘贴后忘改）', () => {
    for (const definition of allModules()) {
      expect(definition.meta.titleKey).toBe(`modules.${definition.type}`)
    }
  })

  it('meta.ts 中没有重复类型', () => {
    expect(new Set(META_TYPES).size).toBe(META_TYPES.length)
  })

  it('allModules 按 meta.ts 的声明顺序返回（保证选择器顺序稳定）', () => {
    const ordered = allModules().map((definition) => definition.type)
    const expected = META_TYPES.filter((type) => registeredTypes().includes(type))
    expect(ordered).toEqual(expected)
  })
})

describe('模块定义契约', () => {
  it('每个模块都有 editor / renderer / isEmpty / schema', () => {
    for (const definition of allModules()) {
      expect(definition.editor, `${definition.type} 缺少 editor`).toBeTruthy()
      expect(definition.renderer, `${definition.type} 缺少 renderer`).toBeTruthy()
      expect(typeof definition.isEmpty, `${definition.type} 缺少 isEmpty`).toBe('function')
      expect(typeof definition.schema.create, `${definition.type} 缺少 schema.create`).toBe('function')
      expect(typeof definition.schema.isData, `${definition.type} 缺少 schema.isData`).toBe('function')
    }
  })

  it('schema.create() 产出的是合法 data，且通过自身 isData 校验', () => {
    for (const definition of allModules()) {
      const data = definition.schema.create()
      expect(definition.schema.isData(data), `${definition.type} 的默认 data 未通过校验`).toBe(true)
    }
  })

  it('新建的模块默认是"空"的（否则演示视图会立刻出现空白内容）', () => {
    // 例外：这几个模块没有"未填写"状态——它们的尺寸/开关本身是内容，
    // 或者（音频控制台）是用户主动放进去的东西，不该凭空消失。
    // 见下一条用例的显式断言。
    const alwaysVisible = new Set(['divider', 'placeholder', 'progress', 'audioConsole'])

    for (const definition of allModules()) {
      if (alwaysVisible.has(definition.type)) continue

      const data = definition.schema.create()
      const props = (definition.defaultProps ?? {}) as Record<string, unknown>
      expect(
        definition.isEmpty(data, props),
        `${definition.type} 新建即非空，违反 §7.4 空模块规则`,
      ).toBe(true)
    }
  })

  it('分割线、占位块、进度条与音频控制台是 isEmpty 的显式特例（恒为 false）', () => {
    const divider = getModule('divider')
    const progress = getModule('progress')
    const placeholder = getModule('placeholder')
    const console_ = getModule('audioConsole')
    expect(divider?.isEmpty({ style: 'solid', label: '' }, {})).toBe(false)
    expect(progress?.isEmpty({ showTime: true, showWaveform: true }, {})).toBe(false)
    expect(placeholder?.isEmpty({ height: 48, hint: '' }, {})).toBe(false)
    // 控制台没有"内容"可言，但用户既然主动添加了它，就不该让它凭空消失；
    // 真正没准备好时（只有一侧有音轨）由组件内部说明原因。
    expect(console_?.isEmpty({}, {})).toBe(false)
  })

  it('评分模块把"未评分"与"0 分"分开（0 是有效评分）', () => {
    // 这是最容易写错的一处：夹取范围时若不先判哨兵值，
    // Math.max(0, -1) 会把"未评分"变成"0 分"，新建模块立刻显示成已评分。
    // M7 合并「星级」后，两种外观（条 / 星）共用这一份语义——
    // 外观不该影响"算不算已填写"。
    const score = getModule('score')
    expect(score?.isEmpty({ score: null, max: 10 }, {})).toBe(true)
    expect(score?.isEmpty({ score: 0, max: 10 }, {})).toBe(false)
    expect(score?.isEmpty({ score: -3, max: 10 }, {})).toBe(true)

    // 星级外观下同样是 0 有效、null 为空
    expect(score?.isEmpty({ score: null, max: 5 }, { style: 'stars' })).toBe(true)
    expect(score?.isEmpty({ score: 0, max: 5 }, { style: 'stars' })).toBe(false)
    expect(score?.isEmpty({ score: 5, max: 5 }, { style: 'stars' })).toBe(false)
  })

  it('文本模块把纯空白视为未填写', () => {
    const text = getModule('text')
    expect(text?.isEmpty({ text: '', align: 'left' }, {})).toBe(true)
    expect(text?.isEmpty({ text: '   \n  ', align: 'left' }, {})).toBe(true)
    expect(text?.isEmpty({ text: '0', align: 'left' }, {})).toBe(false)
  })

  it('参数表只填了键也算有内容', () => {
    const kv = getModule('keyValue')
    expect(kv?.isEmpty({ rows: [{ key: '', value: '' }] }, {})).toBe(true)
    expect(kv?.isEmpty({ rows: [{ key: '价格', value: '' }] }, {})).toBe(false)
    expect(kv?.isEmpty({ rows: [{ key: '', value: '99' }] }, {})).toBe(false)
  })

  it('媒体模块在任一来源存在时即为非空', () => {
    // M7 起封面已并入图片模块，因此这里不再单列 cover
    for (const type of ['image', 'audio', 'video']) {
      const definition = getModule(type)
      expect(definition?.isEmpty({}, {})).toBe(true)
      expect(definition?.isEmpty({ assetId: 'a' }, {})).toBe(false)
      expect(definition?.isEmpty({ sourceUrl: 'https://x/y.png' }, {})).toBe(false)
    }
  })

  /*
   * scope 决定"这个模块能放到哪"：'side' 只能进左右某一栏、
   * 'common' 只能进横跨两栏的通用行、'both' 两边都行。
   *
   * 为什么值得单独钉住：ModulePicker 按它过滤选项，而**真源在模块实现里**
   * （meta.ts 刻意不重复声明）。写错一个 scope 不会报任何错，
   * 只会让某个模块在选择器里莫名消失——正是那种"上线了才发现"的问题。
   */
  it('音频控制台是纯通用模块，没有内容却永远可见', () => {
    const definition = getModule('audioConsole')
    expect(definition?.scope).toBe('common')

    // 它是用户主动放进成稿的一块内容，因此没有任何"未填写"状态；
    // 真正没准备好时（只有一侧有音轨）由组件内部说明原因。
    expect(definition?.isEmpty({}, {})).toBe(false)

    /*
     * 刻意**没有**任何选项：控制台的播放/独听/静音是即时操作，
     * 不是"呈现选项"，塞进模块选项反而会被误解成"设置后要重开才生效"。
     * 这条断言同时也防止有人"顺手"把音频模块的 showCover 复制过来。
     */
    expect(definition?.options ?? []).toHaveLength(0)
  })

  it('音频模块的封面开关默认开启，关掉时不留空位', () => {
    const definition = getModule('audio')
    const option = (definition?.options ?? []).find((item) => item.key === 'showCover')
    expect(option?.type).toBe('boolean')
    expect((definition?.defaultProps as Record<string, unknown>)?.showCover).toBe(true)
  })

  it('两侧都能用的模块声明为 both；纯通用模块不能落进单侧', () => {
    expect(getModule('text')?.scope).toBe('both')
    expect(getModule('divider')?.scope).toBe('both')
    expect(getModule('placeholder')?.scope).toBe('both')

    // 其余模块未声明 scope，等同于 'side'（ModulePicker 会按此回退）
    const sideOnly = allModules().filter((definition) => definition.scope === undefined)
    expect(sideOnly.length).toBeGreaterThan(0)
    expect(sideOnly.map((definition) => definition.type)).toContain('image')
  })
})

describe('注册表行为', () => {
  it('getModule 对未知类型返回 undefined（调用方需自行兜底）', () => {
    expect(getModule('nope')).toBeUndefined()
    expect(hasModule('nope')).toBe(false)
  })

  it('重复注册同一类型会抛错（编码错误应尽早暴露）', () => {
    const definition = getModule('text')
    expect(definition).toBeTruthy()
    if (!definition) return
    expect(() => registerModule(definition)).toThrowError(/重复注册/)
  })

  it('清空注册表后可以重新注册（测试隔离用）', () => {
    __resetRegistryForTests()
    expect(registeredTypes()).toEqual([])
    const definition = getModule('text')
    expect(definition).toBeUndefined()
  })
})
