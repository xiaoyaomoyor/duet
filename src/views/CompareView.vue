<script setup lang="ts">
/**
 * 对比界面（核心视图）
 *
 * 职责：
 *   1. 路由 `#/p/:projectId` → 打开对应项目
 *   2. 没有项目时展示模板画廊（空状态引导）
 *   3. 有项目时渲染对比画布
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import TemplateGallery from '@/components/compare/TemplateGallery.vue'
import CompareCanvas from '@/components/compare/CompareCanvas.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useUiStore } from '@/stores/useUiStore'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const projects = useProjectsStore()
const ui = useUiStore()

const loading = ref(false)

const routeProjectId = computed(() => {
  const raw = route.params.projectId
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
})

/** 路由 → 打开项目 */
watch(
  routeProjectId,
  async (id) => {
    if (!id || store.current?.id === id) return

    loading.value = true
    const result = await store.open(id)
    loading.value = false

    if (!result.ok) {
      ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
      await router.replace({ name: 'compare' })
    }
  },
  { immediate: true },
)

/** 打开项目后同步 URL（从空状态进入项目，或关闭标签页回到空状态） */
watch(
  () => store.current?.id,
  (id) => {
    if (id && routeProjectId.value !== id) {
      void router.replace({ name: 'project', params: { projectId: id } })
    } else if (!id && routeProjectId.value) {
      void router.replace({ name: 'compare' })
    }
  },
)

// 首次进入时确保项目列表已加载（侧栏与画廊都依赖它）
if (projects.items.length === 0 && !projects.loading) {
  void projects.load()
}
</script>

<template>
  <div class="compare">
    <div v-if="loading" class="compare__loading">{{ t('common.loading') }}</div>

    <CompareCanvas v-else-if="store.current" :project="store.current" />

    <TemplateGallery v-else />
  </div>
</template>

<style scoped>
.compare {
  min-height: 100%;
}

.compare__loading {
  padding: var(--sp-12);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
