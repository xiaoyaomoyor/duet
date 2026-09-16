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
import CompareToolbar from '@/components/compare/CompareToolbar.vue'
import PresentOverlay from '@/components/present/PresentOverlay.vue'
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

/** 是否处于展示视图（编辑树在此时不渲染） */
const isPresent = computed(() => store.current?.ui.mode === 'present')

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

/** 展示视图退出（PresentOverlay 已经写过 mode，这里只做 UI 收尾） */
function onPresentExit(): void {
  ui.inspectorOpen = false
}
</script>

<template>
  <div class="compare">
    <div v-if="loading" class="compare__loading">{{ t('common.loading') }}</div>

    <template v-else-if="store.current">
      <!--
        对比页工具条：保存状态 / 切视图 / 属性 / 导入 / 导出。
        它是**对比页的第一行**，因此放在这里而不是 AppShell —— 空状态
        （还没打开任何项目）下这一行整个不该存在，而空状态是这个视图的分支。
      -->
      <CompareToolbar />

      <!--
        编辑态才渲染主区画布。

        M7 之前两种视图态都渲染：展示态下这里也挂着画布，同时
        PresentOverlay 里还有一份只读画布，于是**同一个项目同时存在两套画布**。
        在同步播放上这不是"多花点性能"，而是真的坏掉：
          1. AudioRenderer 按 sideId 向全局时钟登记音轨，两套画布的同名音轨
             会互相覆盖；展示态一挂载，编辑态那几个 element 的 loadedmetadata
             还没到，登记表就被清空，控制栏随即退化成"两侧都需要有音频"。
          2. SyncPlayerBar 的两份实例会互相 attach / detach 同一个同步引擎。
        展示态本来就被遮罩层完全盖住，把那块画布去掉既修掉了上面的问题，
        也顺带省掉一半的渲染与内存。
      -->
      <CompareCanvas v-if="!isPresent" :project="store.current" />
    </template>

    <TemplateGallery v-else />
  </div>

  <!-- 展示视图：独立遮罩层（§9.2） -->
  <PresentOverlay
    v-if="store.current && isPresent"
    :project="store.current"
    @exit="onPresentExit"
  />
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
