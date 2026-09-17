import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportReadonlyHtml } from './htmlExport'
import { getTemplate, instantiateTemplate } from './templateService'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
})

function fixture() {
  const project = instantiateTemplate(getTemplate('music')!, { name: 'Blind listening' })
  const root = document.createElement('div')
  root.className = 'present__stage'
  root.setAttribute('data-v-stage', '')
  document.body.append(root)
  return { project, root }
}

describe('只读 HTML 导出回归', () => {
  it('临时揭晓不进入静态文件；遮罩和 scoped 布局标记保留', async () => {
    const { project, root } = fixture()
    const side = project.sheet.sides[0]!
    Object.assign(side, {
      labelOverride: 'SECRET-NAME',
      modelVersion: 'SECRET-VERSION',
      anonymizeName: true,
      anonymizeVersion: true,
      anonymizeIcon: true,
    })
    root.innerHTML = `<header data-v-header data-side-id="${side.id}" data-export-name="工具 1" data-export-version="">
      <button data-v-header data-export-mask="text" data-export-label="工具 1">SECRET-NAME</button>
      <button data-v-header data-export-mask="text" data-export-label="•••">SECRET-VERSION</button>
      <button data-v-header data-export-mask="icon"><img src="blob:private-icon" alt="SECRET-NAME"></button>
    </header><div class="row__cells" data-v-row>Content</div>`
    document.documentElement.dataset.theme = 'light'
    const result = await exportReadonlyHtml(project, { presentRoot: root })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toMatch(/SECRET-|blob:private-icon/)
    const exported = new DOMParser().parseFromString(result.value, 'text/html')
    expect(exported.documentElement.dataset.theme).toBe('light')
    expect(exported.querySelector('.present__stage[data-v-stage]')).not.toBeNull()
    expect(exported.querySelector('.row__cells[data-v-row]')).not.toBeNull()
    expect(exported.querySelectorAll('span[data-export-mask]')).toHaveLength(3)
    expect(exported.querySelector('button')).toBeNull()
    // 导出只改克隆；当前演示仍可继续揭晓。
    expect(root.textContent).toContain('SECRET-NAME')
  })

  it('名称与版本的匿名/显示开关独立控制摘要', async () => {
    const { project, root } = fixture()
    Object.assign(project.sheet.sides[0]!, {
      labelOverride: 'NAME-HIDDEN',
      modelVersion: 'VisibleVersion',
      anonymizeName: true,
    })
    Object.assign(project.sheet.sides[1]!, {
      labelOverride: 'NAME-NOT-SHOWN',
      modelVersion: 'VERSION-NOT-SHOWN',
      showName: false,
      showVersion: false,
    })
    const result = await exportReadonlyHtml(project, { presentRoot: root })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toContain('VisibleVersion')
    expect(result.value).not.toMatch(/NAME-HIDDEN|NAME-NOT-SHOWN|VERSION-NOT-SHOWN/)
  })

  it('关闭内嵌时不遗留失效 blob 地址，保留原生控制并说明缺失媒体', async () => {
    const { project, root } = fixture()
    root.innerHTML =
      '<audio src="blob:unavailable" autoplay hidden></audio><div style="background-image:url(blob:cover)"></div>'
    const result = await exportReadonlyHtml(project, { presentRoot: root, embedMedia: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const exported = new DOMParser().parseFromString(result.value, 'text/html')
    expect(result.value).not.toMatch(/blob:unavailable|blob:cover/)
    expect(exported.querySelector('audio')?.hasAttribute('controls')).toBe(true)
    expect(exported.querySelector('audio')?.hasAttribute('autoplay')).toBe(false)
    expect(exported.querySelector('audio')?.hasAttribute('hidden')).toBe(false)
    expect(exported.querySelector('.duet-warnings')).not.toBeNull()
  })

  it('CSS 背景与视频 poster 同样内嵌，保留带引号的 data URI', async () => {
    const { project, root } = fixture()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['image'], { type: 'image/png' }),
      })),
    )
    root.innerHTML =
      '<div style="--audio-cover:url(blob:cover)"></div><video poster="blob:poster"></video>'
    const result = await exportReadonlyHtml(project, { presentRoot: root })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toMatch(/blob:cover|blob:poster/)
    expect(result.value).toContain('data:image/png;base64,')
    const exported = new DOMParser().parseFromString(result.value, 'text/html')
    expect(exported.querySelector('video')?.getAttribute('poster')).toMatch(/^data:image\/png/)
  })
})
