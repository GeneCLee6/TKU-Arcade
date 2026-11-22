import { expect, test, type Page } from '@playwright/test'

// 2026-11-20 (docs/ARCHITECTURE.md §4.46, §4.47): a night track's lights fall on the road, the
// track's own song starts with the first key, and the music and effects volumes are kept. Headless
// Chromium draws with a software renderer here: the headlights are the pools there (no spot light),
// which is what medium draws on a phone.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] }, viewport: { width: 1280, height: 720 }, locale: 'en-US' })

interface Reading {
  frames: number
  music?: string
}

const reading = (page: Page): Promise<Reading | undefined> =>
  page.evaluate(() => (window as unknown as { __kartSpike?: Reading }).__kartSpike)

function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function openNight(page: Page, quality: 'low' | 'medium') {
  await page.addInitScript((level) => {
    localStorage.setItem('tku-arcade.kart.quality', level)
  }, quality)
  await page.goto('/kart?track=danhai')
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect.poll(async () => (await reading(page))?.frames ?? 0, { timeout: 30_000 }).toBeGreaterThan(20)
}

/** The mean brightness, 0 to 255, of the road just ahead of the kart (the canvas's middle, low down) */
async function roadAhead(page: Page): Promise<number> {
  const png = (await page.locator('canvas').first().screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    // Decoded here, not fetched: the site's CSP (connect-src 'self') blocks fetch() of a data: URL
    const blob = new Blob([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], { type: 'image/png' })
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const x = Math.round(bitmap.width * 0.42)
    const y = Math.round(bitmap.height * 0.5)
    const pixels = context.getImageData(x, y, Math.round(bitmap.width * 0.16), Math.round(bitmap.height * 0.08)).data
    let sum = 0
    for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3
    return sum / (pixels.length / 4)
  }, png)
}

test('on a night track the headlights light the road ahead, and low quality turns them off', async ({
  page,
}, testInfo) => {
  const errors = watchConsole(page)
  await openNight(page, 'medium')
  const lit = await roadAhead(page)
  await testInfo.attach('danhai-medium', { body: await page.screenshot(), contentType: 'image/png' })
  await page.close()
  const dark = await page.context().newPage()
  await openNight(dark, 'low')
  const unlit = await roadAhead(dark)
  await testInfo.attach('danhai-low', { body: await dark.screenshot(), contentType: 'image/png' })
  await dark.close()
  expect(lit).toBeGreaterThan(unlit + 8)
  expect(errors).toEqual([])
})

test("the first key starts the track's own song, the intro on the grid", async ({ page }) => {
  const errors = watchConsole(page)
  await openNight(page, 'low')
  await page.keyboard.press('KeyQ')
  await expect.poll(async () => (await reading(page))?.music, { timeout: 10_000 }).toMatch(/^neon:(intro|race)$/)
  expect(errors).toEqual([])
})

test('the music and effects volumes are set in the controls panel and kept', async ({ page }) => {
  await openNight(page, 'low')
  await page.getByRole('button', { name: 'Controls' }).click()
  const music = page.getByTestId('kart-volume-music')
  await expect(music).toHaveValue('0.7')
  await music.fill('0.2')
  await page.getByTestId('kart-volume-effects').fill('0.5')
  await page.reload()
  await expect.poll(async () => (await reading(page))?.frames ?? 0, { timeout: 30_000 }).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Controls' }).click()
  await expect(page.getByTestId('kart-volume-music')).toHaveValue('0.2')
  await expect(page.getByTestId('kart-volume-effects')).toHaveValue('0.5')
})
