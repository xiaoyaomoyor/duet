/**
 * 设置面板注册表（§9.3）
 *
 * 新增一个设置分组 = 在这里加一行；SettingsView 不做任何修改。
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
  { id: 'appearance', icon: 'image', titleKey: 'settings.appearance', component: AppearancePanel },
  { id: 'language', icon: 'text', titleKey: 'settings.language', component: LanguagePanel },
  { id: 'behavior', icon: 'settings', titleKey: 'settings.behavior', component: BehaviorPanel },
  {
    id: 'compare',
    icon: 'divider',
    titleKey: 'settings.compareDefaults',
    component: CompareDefaultsPanel,
  },
  { id: 'tools', icon: 'cube', titleKey: 'settings.tools', component: ToolsPanel },
  { id: 'storage', icon: 'export', titleKey: 'settings.storage', component: StoragePanel },
  { id: 'about', icon: 'comment', titleKey: 'settings.about', component: AboutPanel },
]

export const DEFAULT_PANEL_ID: PanelId = 'appearance'

export function findPanel(id: string | null | undefined): PanelDefinition | undefined {
  return SETTINGS_PANELS.find((panel) => panel.id === id)
}
