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

  /**
   * 并发上限刻意压到 2（CI 为 1）。
   *
   * 原因（实测，不是"保守起见"）：E2E 跑的是 `vite dev`，模块**按需转换**。
   * M5 把模块从 11 个加到 23 个之后，默认并发（按 CPU 核数）会让多个 worker
   * 同时请求首次编译的重模块图，dev server 来不及转换，
   * 页面就一直白屏到 30s 超时——表现为"4 个用例莫名失败"，
   * 但单独跑其中任何一个是 2.6s 通过。
   *
   * 这种偶发失败的排查成本远高于多跑十几秒，所以宁可串一点。
   * 若将来改成对 `vite preview`（产物已预构建）跑 E2E，可以把这里调回去。
   */
  workers: process.env.CI ? 1 : 2,
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
