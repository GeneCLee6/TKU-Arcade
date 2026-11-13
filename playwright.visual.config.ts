import { defineConfig } from '@playwright/test'

/**
 * Visual regression and axe (e7-t10, AC-7.8): pages that look the same every time (the lobby with
 * its API answered by fixtures, the rules pages, a missing page), screenshotted and scanned. The
 * baselines are made on Linux, in the CI job `visual` (.github/workflows/ci.yml), since fonts and
 * anti-aliasing differ between systems: compare locally only against baselines you made yourself.
 *
 * - `npm run test:visual` compares with e2e-visual/__screenshots__.
 * - A change meant to look different: the failed CI job uploads a `visual` artifact holding the
 *   diffs (test-results/) and a fresh set of baselines (e2e-visual/__screenshots__/). Check the
 *   diffs, then commit those baselines (`gh run download <run> -n visual`).
 */
const PORT = Number(process.env.VISUAL_PORT ?? 5199)

export default defineConfig({
  testDir: 'e2e-visual',
  testMatch: '*.visual.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    locale: 'en-US',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
