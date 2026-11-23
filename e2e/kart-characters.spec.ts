import { writeFileSync } from 'node:fs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

// 2026-11-23 (docs/KART-WORLD.md §3): the four drivers each their own, on the GPU this runs on (this
// machine's own where it has one; the software renderer otherwise). Every picture is attached to the
// report: each driver in each of their three outfits from in front, and their win at three moments
// (the draw, the middle, the end). The garage's driver card picks an outfit, kept after a reload.
test.use({
  launchOptions: {
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
    ],
  },
  viewport: { width: 960, height: 540 },
  locale: 'en-US',
})
test.setTimeout(240_000)

function watchConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** Attached to the report; also kept in test-results/ with KART_CHARACTER_SHOTS=1, to look at */
async function keep(info: TestInfo, name: string, png: Buffer) {
  await info.attach(name, { body: png, contentType: 'image/png' })
  if (process.env.KART_CHARACTER_SHOTS)
    writeFileSync(`test-results/kart-character-${name}.png`, png)
}

const framesOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __kartSpike?: { frames: number } }).__kartSpike?.frames ?? 0,
  )

const set = (page: Page, values: Record<string, unknown>) =>
  page.evaluate((wanted) => {
    Object.assign(
      (window as unknown as { __kartSpike: Record<string, unknown> }).__kartSpike,
      wanted,
    )
  }, values)

// Close on the driver from ahead and a little to the side
const FRONT = { orbit: 2.75, back: 1.8, up: 1.45 }

for (const driver of ['spade', 'heart', 'diamond', 'club'] as const) {
  test(`${driver}: three outfits, and their own win`, async ({ page }, info) => {
    const errors = watchConsole(page)
    const shots = new Set<string>()
    for (const outfit of ['race', 'street', 'campus'] as const) {
      await page.addInitScript(
        ([who, wear]) => {
          localStorage.setItem('tku-arcade.kart.driver', who)
          localStorage.setItem(`tku-arcade.kart.outfit.${who}`, wear)
          localStorage.setItem('tku-arcade.kart.body', 'tide')
          localStorage.setItem('tku-arcade.kart.quality', 'high')
        },
        [driver, outfit],
      )
      await page.goto('/kart/spike?track=riverside')
      await expect(page.locator('canvas')).toBeVisible()
      await page.addStyleTag({
        content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important }',
      })
      await expect.poll(() => framesOf(page), { timeout: 60_000 }).toBeGreaterThan(5)
      await set(page, { pose: { steer: 0, drift: 0 }, gesture: null, view: FRONT })
      await page.waitForTimeout(900)
      const png = await page.locator('canvas').screenshot()
      shots.add(png.toString('base64'))
      await keep(info, `${driver}-${outfit}`, png)
      if (outfit !== 'race') continue
      // The win: the draw (or the kiss, the visor, the curl), its middle, its end
      await set(page, { gesture: 'cheer' })
      let since = 0
      for (const at of [550, 1500, 3000]) {
        await page.waitForTimeout(at - since)
        since = at
        const moment = await page.locator('canvas').screenshot()
        shots.add(moment.toString('base64'))
        await keep(info, `${driver}-win-${at}`, moment)
      }
      await set(page, { gesture: null })
    }
    // Every picture its own: the outfits differ, and the win moves
    expect(shots.size).toBe(6)
    expect(errors).toEqual([])
  })
}

test.describe('the garage', () => {
  // Wide enough that the garage's button is in the top row, not folded into the menu
  test.use({ viewport: { width: 1280, height: 720 } })
  test("the garage's driver card: a profile, an outfit picked and kept", async ({ page }, info) => {
    const errors = watchConsole(page)
    await page.goto('/kart')
    await expect(page.locator('canvas')).toBeVisible()
    await page.getByTestId('kart-garage-open').click()
    await page.getByRole('radio', { name: 'Hartie' }).click()
    const card = page.getByTestId('kart-driver-profile')
    await expect(card).toHaveAttribute('data-driver', 'heart')
    await expect(card).toContainText('Fisherman’s Wharf')
    await expect(page.getByTestId('kart-driver-relations').locator('li')).toHaveCount(3)
    await page.getByTestId('kart-outfits').getByRole('radio', { name: 'Hoodie' }).click()
    await expect(page.getByTestId('kart-preview')).toHaveAttribute('data-outfit', 'street')
    await page.getByTestId('kart-play-win').click()
    await expect(page.getByTestId('kart-play-win')).toHaveAttribute('aria-pressed', 'true')
    // The preview turns to the driver's front and closes in while the win plays
    await page.waitForTimeout(1500)
    await keep(info, 'garage-win', await page.getByTestId('kart-preview').screenshot())
    await keep(info, 'garage-card', await card.screenshot())
    await page.getByRole('button', { name: 'Close the garage' }).click()
    await page.reload()
    await page.getByTestId('kart-garage-open').click()
    await expect(
      page.getByTestId('kart-outfits').getByRole('radio', { name: 'Hoodie' }),
    ).toHaveAttribute('aria-checked', 'true')
    // Another driver wears what they wore last: the suit
    await page.getByRole('radio', { name: 'Dee' }).click()
    await expect(
      page.getByTestId('kart-outfits').getByRole('radio', { name: 'Race suit' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(errors).toEqual([])
  })
})
