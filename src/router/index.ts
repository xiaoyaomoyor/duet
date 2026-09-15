import { createRouter, createWebHashHistory } from 'vue-router'
import { APP } from '@/app.config'

/**
 * 路由（hash 模式）
 *
 * 选 hash 而非 history 的原因见 §5 T4：
 *   静态托管无需 fallback 配置，且 file:// 与 Tauri 打包后同样可用。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/compare',
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('@/views/CompareView.vue'),
      meta: { layout: 'compare' },
    },
    {
      path: '/p/:projectId',
      name: 'project',
      component: () => import('@/views/CompareView.vue'),
      props: true,
      meta: { layout: 'compare' },
    },
    {
      path: '/settings/:panel?',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      props: true,
      meta: { layout: 'settings' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/compare',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  if (import.meta.env.DEV) {
    console.debug(`[${APP.slug}] route → ${to.fullPath}`)
  }
})
