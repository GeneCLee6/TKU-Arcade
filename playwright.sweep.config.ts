import { defineConfig } from '@playwright/test'

/**
 * The board games' sweep (e2e/smoke-games.spec.ts, docs/QA-SWEEP-2026-11.md): every board game from
 * the waiting room to its result and a rematch, through the real Worker and RoomDO on Vite's dev
 * server. `npm run test:sweep` runs every screen size; the CI job `sweep` runs the light version
 * (desktop only, axe on the desktop): SWEEP_SCREENS=desktop. Pick games with SWEEP_GAMES=a,b.
 * One worker: each test is a table of two to four browsers already.
 */
const PORT = Number(process.env.SWEEP_PORT ?? 5198)

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'smoke-games.spec.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
