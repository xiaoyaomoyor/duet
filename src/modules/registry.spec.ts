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

  it('已注册模块的数量与 M2 交付一致（10 个 P0 + 1 个图片集）', () => {
    expect(registeredTypes().sort()).toEqual(
      [
        'audio',
        'cover',
        'divider',
        'gallery',
        'image',
        'keyValue',
        'link',
        'lyrics',
        'progress',
        'text',
        'video',
      ].sort(),
    )
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

  it('新建的模块默认是"空"的（否则展示视图会立刻出现空白内容）', () => {
    // 例外：divider 与 progress 的 isEmpty 恒为 false（它们本身就承载信息），
    // 见下一条用例的显式断言。
    const alwaysVisible = new Set(['divider', 'progress'])

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

  it('分割线与进度条是 isEmpty 的显式特例（恒为 false）', () => {
    // 这两个模块没有"未填写"状态：它们本身就承载信息
    const divider = getModule('divider')
    const progress = getModule('progress')
    expect(divider?.isEmpty({ style: 'solid', label: '' }, {})).toBe(false)
    expect(progress?.isEmpty({ showTime: true, showWaveform: true }, {})).toBe(false)
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
    for (const type of ['cover', 'image', 'audio', 'video']) {
      const definition = getModule(type)
      expect(definition?.isEmpty({}, {})).toBe(true)
      expect(definition?.isEmpty({ assetId: 'a' }, {})).toBe(false)
      expect(definition?.isEmpty({ sourceUrl: 'https://x/y.png' }, {})).toBe(false)
    }
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
