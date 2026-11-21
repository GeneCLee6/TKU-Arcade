import { expect, test } from '@playwright/test'

// 2026-11-21 (docs/ARCHITECTURE.md §4.56): the site as an installed app. The manifest is there and
// says what Chrome needs to install; the service worker registers, keeps the build's shell and
// answers a page with the offline page only when there is no connection; the API is never answered
// from it. Only a built site has the worker (`npm run dev` has none): run against a preview
// (BASE_URL) or `npx vite preview`. Against the dev server the worker's tests are skipped.

test('the manifest is there, with what installing needs', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  const response = await request.get(href!)
  expect(response.ok()).toBe(true)
  const manifest = (await response.json()) as {
    name: string
    short_name: string
    start_url: string
    display: string
    icons: { src: string; sizes: string; purpose: string }[]
  }
  expect(manifest).toMatchObject({ short_name: 'TKU Arcade', display: 'standalone' })
  expect(manifest.name).toContain('淡江遊樂場')
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src)
    expect(image.ok(), icon.src).toBe(true)
    expect(image.headers()['content-type']).toContain('image/png')
  }
  expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true)
})

test.describe('the service worker', () => {
  test.beforeEach(async ({ request }) => {
    const worker = await request.get('/sw.js')
    const type = worker.headers()['content-type'] ?? ''
    test.skip(!worker.ok() || !type.includes('javascript'), 'only a built site has the service worker')
  })

  test('registers, keeps the shell, and shows the offline page without a connection', async ({ page, context }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    // Registered on load, and in charge of the page after a reload
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const kept = await page.evaluate(async () => {
      const names = await caches.keys()
      const urls: string[] = []
      for (const name of names) {
        for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname)
      }
      return { names, urls }
    })
    expect(kept.names.every((name) => name.startsWith('tku-arcade-'))).toBe(true)
    expect(kept.urls).toContain('/offline.html')
    expect(kept.urls.some((url) => /^\/assets\/index-.+\.js$/.test(url))).toBe(true)
    // Never a page, never the API
    expect(kept.urls).not.toContain('/')
    expect(kept.urls.some((url) => url.startsWith('/api/'))).toBe(false)

    // The offline page runs no script of its own: nothing for the site's policy to block
    const blocked: string[] = []
    page.on('console', (message) => {
      if (/Content.Security.Policy/i.test(message.text())) blocked.push(message.text())
    })
    await context.setOffline(true)
    await page.goto('/?offline-test').catch(() => {})
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You are offline')
    await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('button', { name: /Try again/ }).click()
    await expect(page.getByTestId('quick-play')).toBeVisible()
    expect(blocked).toEqual([])
  })

  test('the API always comes from the network, never from the worker', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload()
    const fromWorker: string[] = []
    page.on('response', (response) => {
      if (response.fromServiceWorker() && new URL(response.url()).pathname.startsWith('/api/')) {
        fromWorker.push(response.url())
      }
    })
    await page.evaluate(() => fetch('/api/lobby').then((response) => response.status))
    await page.waitForTimeout(500)
    expect(fromWorker).toEqual([])
  })
})
