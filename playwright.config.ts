import { defineConfig, devices } from '@playwright/test'

/**
 * 对奏 Duet — 端到端测试配置（验收主旅程见 docs/01-施工总案.md §16.2）
 *
 * ⚠️ 用 localhost 而非 127.0.0.1：
 * Vite 8 默认只监听 IPv6 的 ::1，写死 127.0.0.1 会让 webServer 健康检查
 * 一直连不上并超时（本项目已踩过这个坑）。
 */
const PORT = 5180
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
