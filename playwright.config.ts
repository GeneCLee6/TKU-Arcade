import { defineConfig } from '@playwright/test'

/**
 * Browser tests (`npm run test:browser`). They run against BASE_URL: a deployed preview in CI, or
 * `npm run dev` locally (the default). `npx playwright install chromium` once before the first run.
 */
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5175',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
