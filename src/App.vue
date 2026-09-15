<script setup lang="ts">
/**
 * 对奏 Duet — 应用根组件
 *
 * 职责：只做最外层的语言/主题包裹与路由出口。
 * 布局由 AppShell 负责（M1 的两大主界面都挂在它下面）。
 */
import { watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/layout/AppShell.vue'
import { APP } from '@/app.config'

const { t } = useI18n()

// 同步浏览器标签页标题（语言切换时自动更新）
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.title = `${APP.nameZh} ${APP.nameEn} · ${t('app.tagline')}`
})
</script>

<template>
  <AppShell />
</template>
