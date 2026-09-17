import { defineConfig, devices } from '@playwright/test'

/**
 * 截屏专用配置（`npm run shots`）
 *
 * 为什么单独一份配置而不是塞进主配置：
 *   截屏用例要跑 20 多秒（要造真实内容），而且它会**改写** `docs/screenshots/`。
 *   把它混进 `npm run test:e2e` 会让每次验收都多花半分钟、还可能改到工作区。
 *   主配置里已经用 `testIgnore` 把它排除掉。
 *
 * 用同一套 dev server（端口 5180），因为它截的就是真实的开发态界面。
 */
const PORT = 5180
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'screenshots.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
