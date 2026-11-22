import { defineConfig } from '@playwright/test'

/**
 * Browser tests (`npm run test:browser`). They run against BASE_URL: a deployed preview in CI, or
 * `npm run dev` locally (the default). `npx playwright install chromium` once before the first run.
 * With E2E_PORT set they start their own dev server on that port (the CI job `sweep` runs
 * e2e/mobile.spec.ts that way, 2026-11-23).
 */
const E2E_PORT = process.env.E2E_PORT

export default defineConfig({
  testDir: 'e2e',
  // The board games' sweep has its own config and server (playwright.sweep.config.ts): it takes minutes
  testIgnore: 'smoke-games.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${E2E_PORT ?? 5175}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer:
    E2E_PORT && !process.env.BASE_URL
      ? {
          command: `npx vite --port ${E2E_PORT} --strictPort`,
          url: `http://localhost:${E2E_PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : undefined,
})
