<script setup lang="ts">
/**
 * 音频控制台（通用模块的渲染器）
 *
 * 直接复用 `SyncPlayerBar`：控制逻辑（共用时钟、Solo/Mute、漂移显示、
 * 高级选项）一行都不重写，只是把它从"固定控制栏"改成"画布里的一个模块"。
 *
 * 项目从 store 读，而不是走模块 props：
 *   通用模块的 props 契约（ModuleRendererProps）对所有模块统一，
 *   为一个模块加 `project` 字段会污染全部模块。控制台本来就需要
 *   "同时操纵两侧"这种越界能力，从 store 直接读是最诚实的表达。
 */
import { computed } from 'vue'
import SyncPlayerBar from '@/components/present/SyncPlayerBar.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import type { ModuleRendererProps } from '../types'

defineProps<ModuleRendererProps>()

const project = useProjectStore()
const current = computed(() => project.current)
</script>

<template>
  <SyncPlayerBar v-if="current" :project="current" embedded />
</template>
