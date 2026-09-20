import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/** R5 delivery matrix. Windows WebKit media limitations are recorded in docs/08. */
export default defineConfig({
  ...base,
  testMatch: ['**/r5-delivery.spec.ts'],
  timeout: 90_000,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
