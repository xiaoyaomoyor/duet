/**
 * 当前**解析后**的主题（`system` 已经落到具体配色上）
 *
 * 为什么需要它：侧栏配色预设、背景图案这些地方要按"现在到底是深色还是浅色"
 * 选不同的色值，而主题设置里存的可能是 `system`（那不是一个配色，是个规则）。
 *
 * 为什么不直接读 `document.documentElement.dataset.theme`：
 *   那样拿到的是**非响应式**的快照，用户切换主题后组件不会重渲染。
 *   主题的真源在 settings store 里，从那里算出来才是响应式的。
 */
import { computed, type ComputedRef } from 'vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { resolveTheme } from '@/lib/theme'
import type { ResolvedThemeId } from '@/types'

export function useResolvedTheme(): ComputedRef<ResolvedThemeId> {
  const settings = useSettingsStore()
  return computed(() => resolveTheme(settings.settings.themeId))
}
