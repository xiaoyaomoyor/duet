/**
 * 项目服务单测：工厂、复制、工程文件序列化与解析
 *
 * 解析部分是"用户数据入口"，必须对损坏与恶意输入保持沉默失败→明确报错的行为。
 */
import { describe, expect, it } from 'vitest'
import {
  createProject,
  duplicateProject,
  parseProjectFile,
  parseSingleProject,
  projectFileName,
  serializeProjects,
} from './projectService'
import { getTemplate, instantiateTemplate } from './templateService'
import { SCHEMA_VERSION } from '@/types/project'

const music = getTemplate('music')!

describe('createProject', () => {
  it('按模板创建，标题与颜色来自模板', () => {
    const project = createProject({ name: '音乐对比', templateId: 'music' })
    expect(project.title).toBe('音乐对比')
    // v0.5.0 起模板多一行「标题」（工具名卡片变成了普通模块）
    expect(project.sheet.rows).toHaveLength(5)
    expect(project.sheet.sides[0]?.accent).toBe(music.accent[0])
  })

  it('模板 id 非法时回退到空白项目（不抛异常）', () => {
    const project = createProject({ name: 'x', templateId: 'does-not-exist' })
    // 空白项目只有一行「标题」
    expect(project.sheet.rows).toHaveLength(1)
  })

  it('可覆盖配色', () => {
    const project = createProject({ name: 'x', templateId: 'music', accent: ['#ffffff', '#000000'] })
    expect(project.sheet.sides[0]?.accent).toBe('#ffffff')
  })

  it('默认标题可用', () => {
    expect(createProject().title).toBe('未命名对比')
  })
})

describe('duplicateProject', () => {
  it('生成全新的 id（项目、对比页、行、模块）', () => {
    const source = instantiateTemplate(music, { name: '原项目' })
    const copy = duplicateProject(source)

    expect(copy.id).not.toBe(source.id)
    expect(copy.sheet.id).not.toBe(source.sheet.id)
    expect(copy.title).toContain('副本')

    const sourceRowIds = source.sheet.rows.map((row) => row.id)
    const copyRowIds = copy.sheet.rows.map((row) => row.id)
    for (const id of copyRowIds) expect(sourceRowIds).not.toContain(id)

    // 模块 id 也必须全部重建
    const sourceModuleIds = collectModuleIds(source)
    for (const id of collectModuleIds(copy)) expect(sourceModuleIds).not.toContain(id)
  })

  it('内容保持一致（深浅拷贝正确）', () => {
    const source = instantiateTemplate(music, { name: '原项目' })
    const copy = duplicateProject(source)

    expect(copy.sheet.rows).toHaveLength(source.sheet.rows.length)
    expect(copy.sheet.sides[0]?.toolRef).toEqual(source.sheet.sides[0]?.toolRef)

    // 修改副本不影响原项目
    copy.sheet.layout.gutter = 999
    expect(source.sheet.layout.gutter).not.toBe(999)
  })
})

describe('工程文件：序列化与解析往返', () => {
  it('导出再导入内容完全一致', () => {
    const original = instantiateTemplate(music, { name: '往返测试' })
    const envelope = serializeProjects([original])

    const parsed = parseProjectFile(JSON.stringify(envelope))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value).toHaveLength(1)
    expect(parsed.value[0]).toEqual(original)
  })

  it('信封格式包含必要的元信息', () => {
    const envelope = serializeProjects([createProject()])
    expect(envelope.$format).toBe('duet-project')
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION)
    expect(envelope.projects).toHaveLength(1)
  })

  it('支持裸项目对象（单项目明文）', () => {
    const project = createProject({ name: '裸对象' })
    const parsed = parseProjectFile(JSON.stringify(project))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value[0]?.title).toBe('裸对象')
  })

  it('parseSingleProject 取第一个项目', () => {
    const result = parseSingleProject(JSON.stringify(createProject({ name: '单个' })))
    expect(result.ok && result.value.title).toBe('单个')
  })
})

describe('工程文件：异常输入', () => {
  it('非 JSON 文本', () => {
    const result = parseProjectFile('这不是 json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('JSON')
  })

  it('缺少 sheet 的未知对象', () => {
    const result = parseProjectFile(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })

  it('projects 为空数组', () => {
    const result = parseProjectFile(JSON.stringify({ $format: 'duet-project', projects: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('没有任何项目')
  })

  it('版本高于当前应用时明确拒绝（而不是猜测解析）', () => {
    const project = createProject({ name: '未来版本' })
    const future = { ...project, schemaVersion: SCHEMA_VERSION + 1 }
    const result = parseProjectFile(JSON.stringify(future))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('升级')
  })

  it('结构损坏的项目被拒绝并指出位置', () => {
    const project = createProject({ name: '损坏', templateId: 'music' })
    const broken = JSON.parse(JSON.stringify(project)) as {
      sheet: { rows: Array<Record<string, unknown>> }
    }
    // 显式把第一行的 id 置空（模拟手工改坏 / 传输截断）
    const firstRow = broken.sheet.rows[0]
    if (!firstRow) throw new Error('测试前置条件失败：模板没有生成任何行')
    firstRow.id = ''

    const result = parseProjectFile(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('rows[0]')
  })

  it('对比页缺少行数组时被拒绝', () => {
    const project = createProject({ name: '损坏', templateId: 'music' })
    const broken = JSON.parse(JSON.stringify(project)) as { sheet: Record<string, unknown> }
    delete broken.sheet.rows

    const result = parseProjectFile(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('rows')
  })

  it('模块缺少 data 字段时被拒绝（避免渲染层拿到 undefined）', () => {
    const project = createProject({ name: '损坏', templateId: 'music' })
    const broken = JSON.parse(JSON.stringify(project)) as {
      sheet: { rows: Array<{ cells: Record<string, { modules: Array<Record<string, unknown>> }> }> }
    }
    const cell = Object.values(broken.sheet.rows[0]?.cells ?? {})[0]
    const module = cell?.modules[0]
    if (!module) throw new Error('测试前置条件失败：模板没有生成任何模块')
    delete module.data

    const result = parseProjectFile(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('data')
  })

  it('多个项目中任意一个损坏则整体拒绝', () => {
    const good = createProject({ name: '好的' })
    const envelope = {
      $format: 'duet-project',
      schemaVersion: SCHEMA_VERSION,
      projects: [good, { id: 'x' }],
    }
    const result = parseProjectFile(JSON.stringify(envelope))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('第 2 个')
  })
})

describe('projectFileName', () => {
  it('去掉文件系统不允许的字符', () => {
    const project = createProject({ name: 'a/b:c*d?e"f<g>h|i' })
    expect(projectFileName(project)).toBe('a_b_c_d_e_f_g_h_i.duet')
  })

  it('空标题回退为 untitled', () => {
    const project = createProject({ name: '   ' })
    expect(projectFileName(project)).toBe('untitled.duet')
  })
})

function collectModuleIds(project: { sheet: { rows: Array<{ cells: Record<string, { modules: Array<{ id: string }> }> }> } }): string[] {
  const ids: string[] = []
  for (const row of project.sheet.rows) {
    for (const cell of Object.values(row.cells)) {
      for (const module of cell.modules) ids.push(module.id)
    }
  }
  return ids
}
