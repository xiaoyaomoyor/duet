import type { Project } from '@/types/project'
import {
  DEFAULT_APPEARANCE,
  validAppearance,
  type Appearance,
  type AppearancePatch,
  type AppearancePreset,
} from '@/types/appearance'
import { deepClone } from '@/lib/clone'
import { err, ok, type Result } from '@/lib/result'

export const BUILTIN_APPEARANCES: readonly AppearancePreset[] = [
  { id: 'cinema', name: '琥珀剧场', appearance: { ...DEFAULT_APPEARANCE } },
  {
    id: 'editorial',
    name: '纸上评测',
    appearance: {
      ...DEFAULT_APPEARANCE,
      theme: 'paper',
      typography: 'editorial',
      mediaLayout: 'sleeve',
    },
  },
  {
    id: 'blue',
    name: '冷调放映',
    appearance: { ...DEFAULT_APPEARANCE, palette: 'blue', titleAlign: 'center', texture: 'subtle' },
  },
  {
    id: 'mono',
    name: '黑白纪要',
    appearance: { ...DEFAULT_APPEARANCE, theme: 'paper', palette: 'mono', typography: 'editorial' },
  },
]
export function resolveAppearance(project: Project, sceneId?: string): Appearance {
  return {
    ...DEFAULT_APPEARANCE,
    theme: project.sheet.layout.presentation?.theme ?? 'ink',
    ...project.appearance,
    ...project.comparison?.scenes.find((s) => s.id === sceneId)?.appearance,
  }
}
export function setAppearance(
  project: Project,
  value: AppearancePatch | null,
  sceneId?: string,
): Result<Project, string> {
  if (value !== null && !validAppearance(value)) return err('外观选项无效；仅支持内置样式选项')
  const p = deepClone(project)
  if (sceneId) {
    const scene = p.comparison?.scenes.find((s) => s.id === sceneId)
    if (!scene) return err('场景不存在')
    if (value === null) delete scene.appearance
    else scene.appearance = deepClone(value)
  } else {
    if (value === null) delete p.appearance
    else p.appearance = deepClone(value)
    p.sheet.layout.presentation = {
      enabled: p.sheet.layout.presentation?.enabled ?? p.workspace === 'modern',
      theme: value === null ? 'ink' : (value.theme ?? p.sheet.layout.presentation?.theme ?? 'ink'),
    }
  }
  return ok(p)
}
export function presetFile(name: string, appearance: AppearancePatch): string {
  if (!validAppearance(appearance)) throw new Error('预设中含有非外观字段')
  return JSON.stringify(
    {
      $format: 'duet-appearance',
      version: 1,
      name: name.trim().slice(0, 60) || '个人风格',
      appearance,
    },
    null,
    2,
  )
}
export function parsePreset(text: string): Result<Omit<AppearancePreset, 'id'>, string> {
  try {
    if (text.length > 16000) return err('外观预设不应包含媒体或长文本')
    const p = JSON.parse(text)
    if (
      !p ||
      p.$format !== 'duet-appearance' ||
      p.version !== 1 ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 60 ||
      !validAppearance(p.appearance) ||
      Object.keys(p).some((k) => !['$format', 'version', 'name', 'appearance'].includes(k))
    )
      return err('不是有效的外观预设；不接受作品、身份或资源字段')
    return ok({ name: p.name, appearance: p.appearance })
  } catch {
    return err('外观预设文件无法读取')
  }
}
