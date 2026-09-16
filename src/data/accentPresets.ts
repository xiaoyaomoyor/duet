/**
 * 对比双方的配色预设
 *
 * 为什么要有这张表（M8 的核心改动之一）：
 *   在此之前，左右两侧的颜色是在**新建对比时烧进工程文件**的一个 hex
 *   （来自 services/templateService 的 ACCENT_PAIRS）。这带来两个问题：
 *     1. 那些色是照着深色背景挑的浅色（#a78bfa / #22d3ee …），
 *        一旦切到**亮色主题**，浅紫浅青压在白底上几乎看不见——
 *        用户实测反馈的"亮色主题下颜色不对"有一部分就是它。
 *     2. 想换配色必须回到「设置 → 对比默认值」里挑，而且只影响**新建**的项目，
 *        已经打开的这份改不了。用户明确要求"选择当前这几个工具各自的配色"。
 *
 * 现在的做法：工程里存的是**预设 id**，实际色值按当前主题解析。
 *   同一个"紫"，紫夜/暗色主题下用浅紫（#a78bfa），亮色主题下用深紫（#6d28d9）——
 *   这正是用户说的"该用浅紫色的时候用浅紫色，该用深紫色的时候用深紫色"。
 *
 * 深色侧的取值刻意与旧的 ACCENT_PAIRS **完全一致**：
 * 这样 v3 及更早的工程迁移过来之后，在紫夜主题下的观感与迁移前逐像素相同，
 * 不存在"升个版本整个配色全变了"的惊吓。
 */

import { hexToSoft } from '@/lib/color'
import type { ResolvedThemeId } from '@/types'

export interface AccentPreset {
  id: string
  /** i18n key，形如 accentPreset.violet */
  labelKey: string
  /** 亮色主题下的取值（深一档） */
  light: string
  /** 暗色主题下的取值（浅一档） */
  dark: string
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'violet', labelKey: 'accentPreset.violet', light: '#6d28d9', dark: '#a78bfa' },
  { id: 'cyan', labelKey: 'accentPreset.cyan', light: '#0e7490', dark: '#22d3ee' },
  { id: 'pink', labelKey: 'accentPreset.pink', light: '#be185d', dark: '#f472b6' },
  { id: 'blue', labelKey: 'accentPreset.blue', light: '#1d4ed8', dark: '#60a5fa' },
  { id: 'orange', labelKey: 'accentPreset.orange', light: '#c2410c', dark: '#fb923c' },
  { id: 'green', labelKey: 'accentPreset.green', light: '#047857', dark: '#34d399' },
  { id: 'amber', labelKey: 'accentPreset.amber', light: '#a16207', dark: '#fbbf24' },
  { id: 'red', labelKey: 'accentPreset.red', light: '#b91c1c', dark: '#f87171' },
  { id: 'slate', labelKey: 'accentPreset.slate', light: '#475569', dark: '#94a3b8' },
] as const

const BY_ID = new Map(ACCENT_PRESETS.map((preset) => [preset.id, preset]))

/** 预设 id → 该主题下的实际色值；id 不认识时返回 undefined */
export function presetColor(id: string | undefined, theme: ResolvedThemeId): string | undefined {
  if (!id) return undefined
  const preset = BY_ID.get(id)
  if (!preset) return undefined
  return theme === 'light' ? preset.light : preset.dark
}

/**
 * 反查：某个色值属于哪个预设。
 *
 * 只用于 v3 → v4 迁移，把老工程里烧死的 hex 认回预设。
 * 两个主题的取值都认，因此老工程无论当初在哪个主题下创建都能对上。
 */
export function presetIdOfColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const wanted = color.trim().toLowerCase()
  for (const preset of ACCENT_PRESETS) {
    if (preset.light.toLowerCase() === wanted || preset.dark.toLowerCase() === wanted) {
      return preset.id
    }
  }
  return undefined
}

/** 默认的左右配色（紫 / 青，与 §11.2 的 --side-a / --side-b 一致） */
export const DEFAULT_ACCENT_PRESETS: readonly [string, string] = ['violet', 'cyan']

/**
 * 解析某一侧最终应该用哪个颜色。
 *
 * 优先级：预设（跟随主题）> 工程里存的 hex（老数据 / 用户自定义）> 空串。
 * 返回空串时由调用方回落到 `var(--accent-500)`。
 */
export function resolveAccent(
  side: { accentPreset?: string | undefined; accent?: string | undefined },
  theme: ResolvedThemeId,
): string {
  return presetColor(side.accentPreset, theme) ?? side.accent ?? ''
}

/** 预设色值派生出的柔色底（与 CanvasRow 里的算法保持同一个实现） */
export function accentSoft(color: string, percent = 8): string {
  return hexToSoft(color, percent)
}
