import { expect, test, type Page } from '@playwright/test'

// 2026-11-22 (#100; docs/ARCHITECTURE.md §4.63): a phone held upright in an item race against the
// computer. The item slot is in the middle of the screen again, clear of the place, the clock, the
// map and the touch buttons (#89, #95, #100's rules); and the BOOST button shows a boost burning and
// the charges held. The player's kart drives itself (`?autopilot`), so that it boosts. Headless
// Chromium draws with a software renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })

type Box = { x: number; y: number; width: number; height: number }
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function box(page: Page, testId: string): Promise<Box> {
  const found = await page.getByTestId(testId).boundingBox()
  if (!found) throw new Error(`${testId} is not on the screen`)
  return found
}

for (const [width, height] of [
  [390, 844],
  [360, 740],
]) {
  test.describe(`a phone held upright, ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true })

    test('the item slot in the middle, clear of everything; BOOST shows the boost', async ({
      page,
    }, testInfo) => {
      test.setTimeout(300_000)
      await page.addInitScript(() => {
        localStorage.setItem('tku-arcade.kart.quality', 'low')
        localStorage.setItem('tku-arcade.language', 'zh-TW')
      })
      await page.goto('/kart?autopilot')
      await page.getByTestId('kart-menu').tap()
      await page.getByTestId('kart-bots-open').tap()
      const setup = page.getByTestId('kart-bots-setup')
      await expect(setup).toBeVisible()
      await setup.getByTestId('kart-bots-track').selectOption('riverside')
      await setup.getByTestId('kart-bots-count').selectOption('1')
      await setup.getByTestId('kart-bots-difficulty').selectOption('easy')
      await setup.getByTestId('kart-bots-mode').selectOption('items')
      // Three laps: time for the autopilot to fill its gauge and fire a charge
      await setup.getByTestId('kart-bots-laps').selectOption('3')
      await setup.getByTestId('kart-bots-start').tap()

      await expect(page.getByTestId('kart-race')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('kart-touch')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('kart-item')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('kart-intro')).toBeHidden({ timeout: 60_000 })

      // In the middle, and clear of the place, the clock, the map, the HUD and every button; the
      // map clear of them too
      const clear = async () => {
        const slot = await box(page, 'kart-item')
        expect(Math.abs(slot.x + slot.width / 2 - width / 2), 'centred').toBeLessThan(6)
        expect(slot.y + slot.height).toBeLessThan(height / 2)
        const map = await box(page, 'kart-minimap')
        const others: [string, Box][] = [
          ['place', await box(page, 'kart-place')],
          ['clock', await box(page, 'kart-race-clock')],
          ['hud', await box(page, 'kart-hud')],
        ]
        for (const id of [
          'kart-touch-left',
          'kart-touch-right',
          'kart-touch-gas',
          'kart-touch-brake',
          'kart-touch-drift',
          'kart-touch-boost',
          'kart-touch-item',
          'kart-touch-reset',
          'kart-touch-settings',
        ]) {
          others.push([id, await box(page, id)])
        }
        expect(overlap(slot, map), 'the item slot over the map').toBe(false)
        for (const [name, other] of others) {
          expect(overlap(slot, other), `the item slot over ${name}`).toBe(false)
          // The HUD's row is as wide as the screen; what it draws is its panels, on the right
          if (name !== 'hud') expect(overlap(map, other), `the map over ${name}`).toBe(false)
        }
        for (const panel of await page.getByTestId('kart-hud').locator(':scope > *').all()) {
          const drawn = await panel.boundingBox()
          if (drawn) expect(overlap(map, drawn), 'the map over the HUD').toBe(false)
        }
        expect(map.x).toBeGreaterThanOrEqual(0)
      }
      await clear()

      // The autopilot drifts and fires its charges: the button shows the boost burning
      const boost = page.getByTestId('kart-touch-boost')
      await expect(boost).toHaveAttribute('data-boost', 'burning', { timeout: 150_000 })
      await expect(boost).toContainText('噴射中')
      await expect(page.getByTestId('kart-touch-boost-cells').locator('i')).toHaveCount(2)
      // From the second lap on the clock has four rows: still clear
      await expect(page.getByTestId('kart-race-clock')).toContainText('上一圈', { timeout: 150_000 })
      await clear()
      const shot = testInfo.outputPath(`portrait-${width}-zh.png`)
      await page.screenshot({ path: shot })
      await testInfo.attach(`portrait-${width}-zh`, { path: shot, contentType: 'image/png' })
    })
  })
}
