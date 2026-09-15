<script setup lang="ts">
/**
 * 对奏 Duet — 应用根组件
 *
 * 职责：
 *   1. 同步浏览器标签页标题
 *   2. 启动后加载项目列表并恢复"保持位置"
 *   3. 把 store 层捕获的错误以 Toast 呈现（不静默吞掉）
 *   4. 接线 PWA（离线可用、更新提示、安装提示）
 *   5. 桌面版：响应"双击 .duet 文件"的系统请求
 * 布局由 AppShell 负责。
 */
import { onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/layout/AppShell.vue'
import { APP } from '@/app.config'
import { startPwa } from '@/composables/usePwa'
import { onOpenFileRequest, readTextFileAt } from '@/services/platformAdapter'
import { restoreFromBackup } from '@/services/maintenanceService'
import { useProjectStore } from '@/stores/useProjectStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'

const { t } = useI18n()
const project = useProjectStore()
const projects = useProjectsStore()
const settings = useSettingsStore()
const ui = useUiStore()

// 同步浏览器标签页标题（语言切换时自动更新）
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.title = `${APP.nameZh} ${APP.nameEn} · ${t('app.tagline')}`
})

let stopOpenFileListener: (() => void) | null = null

// 启动流程：加载项目列表 → 恢复上次位置 → 申请持久化存储 → 接线 PWA
onMounted(() => {
  void (async () => {
    await projects.load()
    await project.restoreLastPosition()
    await settings.ensurePersistentStorage()
  })()

  // PWA 与数据加载无关，不必等它：早注册一秒就早一秒可离线
  startPwa()

  // 桌面版：双击 .duet 会走这里。Web 版拿到的是空实现，因此不需要分支判断。
  stopOpenFileListener = onOpenFileRequest((path) => {
    void (async () => {
      const text = await readTextFileAt(path)
      if (!text.ok) {
        ui.notify(t('export.failed', { message: text.error }), 'danger')
        return
      }

      const restored = await restoreFromBackup(text.value)
      if (!restored.ok) {
        ui.notify(t('export.failed', { message: restored.error }), 'danger')
        return
      }

      await projects.load()
      ui.notify(t('export.importDone', { n: restored.value.projects }), 'success')
    })()
  })
})

onBeforeUnmount(() => {
  stopOpenFileListener?.()
  stopOpenFileListener = null
})

// 错误必须可见：store 捕获的失败在这里统一提示（§8.5）
watch(
  () => project.lastError,
  (message) => {
    if (!message) return
    ui.notify(t('errors.projectLoad', { message }), 'danger')
    project.lastError = null
  },
)
</script>

<template>
  <AppShell />
</template>
