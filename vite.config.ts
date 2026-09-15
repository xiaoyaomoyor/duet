import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 对奏 Duet — 构建与开发服务器配置
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // 相对基址：同时兼容 GitHub Pages 子路径、file:// 与 Tauri 打包
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
