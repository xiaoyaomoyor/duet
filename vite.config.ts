import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
/*
 * 注意这里必须带 `.ts` 扩展名：
 * Vite 8 的 `configLoader: 'native'` 不支持省略扩展名的相对导入，
 * 不带扩展名会在启动时打警告，并在将来成为硬错误。
 */
import { APP } from './src/app.config.ts'

// 对奏 Duet — 构建与开发服务器配置
export default defineConfig({
  plugins: [
    vue(),

    /**
     * PWA（§17 M5-3）：离线可用 + 可安装到桌面。
     *
     * 离线策略刻意选得保守：
     *   - 只预缓存**构建产物**（JS/CSS/HTML/字体/图标），
     *     这些是"应用本体"，必须离线可用
     *   - 用户数据（项目、素材）本来就在 IndexedDB 里，与 SW 无关
     *   - 运行时**绝不缓存用户导入的外链媒体**：那些是别人服务器上的内容，
     *     缓存它们既超出授权范围，也会让存储配额被悄悄吃光
     *   - `navigateFallback` 指向 index.html：hash 路由下任何路径都能回到应用
     */
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      // 开发期不启用 SW：否则本地调试会被上一版缓存干扰（这是最常见的"我明明改了"来源）
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        // 清单是静态文件，无法按语言切换：这里给"中文名 + 英文名"，
        // 保证两种语言的用户都能在桌面上认出它
        name: `${APP.nameZh} / ${APP.nameEn} — ${APP.taglineZh}`,
        short_name: APP.nameZh,
        description: APP.description,
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0714',
        theme_color: '#0b0714',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 单文件体积上限：pdf 与 wasm 不在产物里，超限说明出了问题，让它报错而不是静默跳过
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 唯一的导航回退：hash 路由下所有"页面"都是 index.html
        navigateFallback: 'index.html',
        // 外链一律走网络，不进缓存
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // 相对基址：兼容 GitHub Pages 等子路径静态托管
  base: './',

  server: {
    port: 5180,
    strictPort: false,
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 与 §15 性能预算配套：把重量级、非首屏依赖拆出去。
        // 注意：Vite 8 底层是 Rolldown，manualChunks 只接受函数形式。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('html-to-image')) return 'export'
          if (/[\\/]node_modules[\\/](vue|@vue|vue-router|pinia|vue-i18n)[\\/]/.test(id)) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    // e2e 由 Playwright 负责，必须排除
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**', 'src/services/**', 'src/stores/**'],
    },
  },
})
