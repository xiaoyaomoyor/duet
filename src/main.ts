import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useSettingsStore } from './stores/useSettingsStore'
import { applyPlatformFlags } from './lib/theme'
import { APP } from './app.config'

/**
 * ⚠️ 这一行是**必需**的，不能删：
 * 模块注册是副作用（每个模块在自己的 index.ts 里调用 registerModule），
 * 没有它注册表就是空的 —— 表现为"模块卡片只显示标题，既没有编辑器也没有预览"。
 * 所有编辑器/渲染器都从注册表按 type 解析，因此必须在挂载前完成注册。
 */
import './modules'

import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'

/**
 * 应用启动（对奏 Duet）
 *
 * 顺序很关键：
 *   1. 先把主题/语言落到 <html>，避免首帧闪白或字体跳动（§2.3 R1）
 *   2. 再挂载路由与视图
 */
async function boot(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.use(i18n)

  applyPlatformFlags()

  // 设置存于 IndexedDB，必须在挂载前完成，否则会先渲染默认主题再跳变
  const settings = useSettingsStore(pinia)
  await settings.load()

  app.mount('#app')

  if (import.meta.env.DEV) {
    console.info(`[${APP.nameZh} ${APP.nameEn}] v${APP.version} ready`)
  }
}

void boot()
