/**
 * 图标注册表（语义名 → Lucide 组件）
 *
 * 这里只钉两类"改错了不会报错、只会静默变丑"的问题：
 *   1. 组件里写了一个没登记的名字 → getIcon 返回 undefined → 图标位置一片空白
 *   2. 两个语义名指到同一个图标
 *
 * 第 2 条是 M7 的真实缺陷：导入与导出共用了一对**看起来对、实际相反**的图标
 * （import = 朝上的 Upload、export = 朝下的 Download）。按箭头朝向记是记不住的，
 * 因此这里直接把"方向语义"钉进断言：导入是"收进来"（Download）、
 * 导出是"送出去"（Upload）。
 */
import { describe, expect, it } from 'vitest'
import { Download, Upload } from '@lucide/vue'
import { getIcon, hasIcon, ICON_NAMES, ICONS } from './iconMap'

describe('图标注册表', () => {
  it('登记表非空且名字唯一（对象字面量本身保证唯一，这里防的是大小写重名）', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(30)
    const lower = ICON_NAMES.map((name) => name.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })

  it('getIcon 对已登记名字返回组件', () => {
    for (const name of ICON_NAMES) {
      expect(getIcon(name), `${name} 应当能取到组件`).toBeTruthy()
      expect(hasIcon(name)).toBe(true)
    }
  })

  it('getIcon 对未登记名字返回 undefined（不在生产环境抛错，由调用方兜底）', () => {
    expect(getIcon('definitely-not-an-icon')).toBeUndefined()
    expect(hasIcon('definitely-not-an-icon')).toBe(false)
  })

  it('导入是"收进来"、导出是"送出去"，两者不能是同一个图标', () => {
    expect(ICONS.import).toBe(Download)
    expect(ICONS.export).toBe(Upload)
    expect(ICONS.import).not.toBe(ICONS.export)
  })

  it('界面里高频出现的那几个语义名都在表里', () => {
    // 这些名字散落在十几个组件的模板里，漏登记只会让某个角落少一个图标，
    // 因此集中在这里挡一道
    const required = [
      'plus',
      'close',
      'check',
      'trash',
      'edit',
      'copy',
      'grip',
      'insertRow',
      'undo',
      'redo',
      'settings',
      'options',
      'sidebar',
      'present',
      'image',
      'music',
      'video',
      'text',
    ]
    for (const name of required) {
      expect(hasIcon(name), `缺少 ${name} 的登记`).toBe(true)
    }
  })

  it('"在上方插入行"与"添加通用模块"用的是两个不同图标（语义必须能区分）', () => {
    expect(ICONS.insertRow).not.toBe(ICONS.plus)
  })
})
