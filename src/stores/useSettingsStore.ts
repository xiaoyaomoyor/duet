/**
 * 应用设置 Store
 *
 * 唯一读写入口：所有设置改动都经 patch() 落盘并立即作用到 DOM。
 */

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_SETTINGS, type AppSettings, type LanguageCode } from '@/types'
import { loadSettings, saveSettings } from '@/db/settingsRepo'
import { applySettings, requestPersistentStorage } from '@/services/themeService'
import { deepClone } from '@/lib/clone'
import { setI18nLocale } from '@/i18n'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(deepClone(DEFAULT_SETTINGS))
  const loaded = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  // 设置变化 → 立即作用于 <html>（主题、语言、动效、侧栏宽度）
  watch(
    settings,
    (value) => {
      applySettings(value)
      setI18nLocale(value.language)
    },
    { deep: true },
  )

  /** 启动时加载（在挂载前 await，避免首帧主题跳变） */
  async function load(): Promise<void> {
    try {
      const stored = await loadSettings()
      settings.value = stored
      applySettings(stored)
      setI18nLocale(stored.language)
      lastError.value = null
    } catch (error) {
      // 读取失败不阻塞启动：用默认值继续，错误交给 UI 提示
      lastError.value = error instanceof Error ? error.message : String(error)
      applySettings(settings.value)
    } finally {
      loaded.value = true
      if (settings.value.language === 'zh-CN' || settings.value.language === 'en-US') {
        setI18nLocale(settings.value.language)
      }
    }
  }

  /** 局部更新 + 落盘 */
  async function patch(partial: Partial<AppSettings>): Promise<void> {
    settings.value = { ...settings.value, ...partial }
    await persist()
  }

  /** 恢复全部默认值 */
  async function resetToDefaults(): Promise<void> {
    settings.value = deepClone(DEFAULT_SETTINGS)
    await persist()
  }

  async function persist(): Promise<void> {
    saving.value = true
    try {
      await saveSettings(settings.value)
      lastError.value = null
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      saving.value = false
    }
  }

  async function setLanguage(language: LanguageCode): Promise<void> {
    await patch({ language })
  }

  /** 记录"保持位置"所需的最后位置 */
  async function rememberPosition(projectId: string, mode: 'edit' | 'present'): Promise<void> {
    if (!settings.value.restoreLastPosition) return
    await patch({ lastProjectId: projectId, lastMode: mode })
  }

  /** 首次运行时申请持久化存储（失败不影响使用，仅降低被清理的风险） */
  async function ensurePersistentStorage(): Promise<void> {
    const granted = await requestPersistentStorage()
    if (!granted && import.meta.env.DEV) {
      console.info('[duet] 持久化存储未获授权，浏览器可能在存储紧张时清理数据')
    }
  }

  const language = computed(() => settings.value.language)
  const sidebarWidth = computed(() => settings.value.sidebarWidth)
  const themeId = computed(() => settings.value.themeId)

  return {
    settings,
    loaded,
    saving,
    lastError,
    language,
    sidebarWidth,
    themeId,
    load,
    patch,
    persist,
    resetToDefaults,
    setLanguage,
    rememberPosition,
    ensurePersistentStorage,
  }
})
