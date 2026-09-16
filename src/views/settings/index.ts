/**
 * 设置面板注册表（§9.3）
 *
 * 新增一个设置分组 = 在这里加一行；SettingsView 不做任何修改。
 *
 * 图标选型（M6 调整）：每个分组的图标要与它**装的内容**对得上。
 * 之前外观/语言/行为分别复用 image / text / settings，
 * 一列排下来几乎分不清哪个是哪个——这是用户反馈里明确提到的问题。
 */

import type { Component } from 'vue'
import AppearancePanel from './AppearancePanel.vue'
import LanguagePanel from './LanguagePanel.vue'
import BehaviorPanel from './BehaviorPanel.vue'
import CompareDefaultsPanel from './CompareDefaultsPanel.vue'
import ToolsPanel from './ToolsPanel.vue'
import StoragePanel from './StoragePanel.vue'
import AboutPanel from './AboutPanel.vue'

export type PanelId =
  | 'appearance'
  | 'language'
  | 'behavior'
  | 'compare'
  | 'tools'
  | 'storage'
  | 'about'

export interface PanelDefinition {
  id: PanelId
  icon: string
  /** 导航项标题的 i18n key */
  titleKey: string
  component: Component
}

export const SETTINGS_PANELS: readonly PanelDefinition[] = [
  { id: 'appearance', icon: 'palette', titleKey: 'settings.appearance', component: AppearancePanel },
  { id: 'language', icon: 'languages', titleKey: 'settings.language', component: LanguagePanel },
  { id: 'behavior', icon: 'behavior', titleKey: 'settings.behavior', component: BehaviorPanel },
  {
    id: 'compare',
    icon: 'compare',
    titleKey: 'settings.compareDefaults',
    component: CompareDefaultsPanel,
  },
  { id: 'tools', icon: 'tools', titleKey: 'settings.tools', component: ToolsPanel },
  { id: 'storage', icon: 'storage', titleKey: 'settings.storage', component: StoragePanel },
  { id: 'about', icon: 'info', titleKey: 'settings.about', component: AboutPanel },
]

export const DEFAULT_PANEL_ID: PanelId = 'appearance'

export function findPanel(id: string | null | undefined): PanelDefinition | undefined {
  return SETTINGS_PANELS.find((panel) => panel.id === id)
}
