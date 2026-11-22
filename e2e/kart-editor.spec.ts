import { expect, test } from '@playwright/test'
import { joinRoom, newPerson } from './helpers.ts'

// e10-t07, e10-t08: the track editor. A simple track laid from the piece library and closed with
// "Close the loop", its link shared and opened for a time trial the autopilot drives to the end
// (the record kept under the track's own hash); then the same link pasted into a race room, where
// two people race a lap on it, the room judging the laps. Headless Chromium draws with a software
// renderer (the flag lets it): slow, but the physics keeps time.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } })
test.setTimeout(300_000)

/** Lays a short track in the editor and returns its share link */
async function layTrack(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/kart/editor')
  const editor = page.getByTestId('kart-editor')
  await expect(editor).toBeVisible()
  // The starter loop is legal; take it down to its first straight
  await expect(page.getByTestId('kart-editor-ok')).toBeVisible()
  const pieces = page.getByTestId('kart-editor-pieces').locator('li')
  await pieces.last().getByRole('button').click()
  while ((await pieces.count()) > 1) await page.getByTestId('kart-editor-remove').click()
  await expect(page.getByTestId('kart-editor-problems')).toBeVisible()
  // A hairpin, the back straight, then the editor closes the loop
  await page.getByTestId('kart-editor-add-hairpinRight').click()
  await page.getByTestId('kart-editor-add-straightLong').click()
  await expect(page.getByTestId('kart-editor-problems')).toContainText('not closed')
  await page.getByTestId('kart-editor-close').click()
  await expect(page.getByTestId('kart-editor-ok')).toBeVisible()
  await page.getByTestId('kart-editor-name').fill('Test Loop')
  await page.getByTestId('kart-editor-save').click()
  await page.getByTestId('kart-editor-share').click()
  const link = await page.getByTestId('kart-editor-link').inputValue()
  expect(link).toMatch(/\/kart\?custom=[A-Za-z0-9_-]+$/)
  return link
}

test('a track laid in the editor, shared and driven in a time trial', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('tku-arcade.kart.quality', 'low')
    localStorage.setItem('tku-arcade.language', 'en')
  })
  const link = await layTrack(page)
  // The save is in the list
  await page.getByTestId('kart-editor-saves').click()
  await expect(page.getByTestId('kart-editor-saves-panel')).toContainText('Test Loop')

  // A friend opens the link: the time trial is on that track, and the autopilot drives it
  await page.goto(`${new URL(link).pathname}${new URL(link).search}&autopilot`)
  await expect(page.getByTestId('kart-course')).toHaveValue('custom')
  await expect(page.getByTestId('kart-course').locator('option:checked')).toHaveText('Test Loop')
  await expect(page.getByTestId('kart-minimap')).toBeVisible()
  await expect(page.getByTestId('kart-results')).toBeVisible({ timeout: 240_000 })
  // The best run is kept under the track's hash and the physics' revision (CUSTOM_REVISION). Since
  // §4.40 localStorage keeps the record and IndexedDB the ghost
  const keys = await page.evaluate(() => Object.keys(localStorage))
  expect(keys.some((key) => /^tku-arcade\.kart\.bestRun\.custom-[a-z0-9]+@\d+$/.test(key))).toBe(true)
})

test('a race room on a track from the editor: pasted by the host, raced by two', async ({
  browser,
}) => {
  const viewport = { width: 1024, height: 700 }
  const ann = await newPerson(browser, { viewport })
  const bob = await newPerson(browser, { viewport })
  for (const page of [ann, bob]) {
    await page.addInitScript(() => localStorage.setItem('tku-arcade.kart.quality', 'low'))
  }
  const link = await layTrack(ann)
  const response = await ann.request.post('/api/rooms', {
    data: { gameId: 'kart', options: { track: 'riverside', laps: 1, mode: 'race' } },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(ann, `/r/${id}?autopilot`, 'Ann')
  await joinRoom(bob, `/r/${id}?autopilot`, 'Bob')
  // The host picks a custom track and pastes the link; a bad one is refused on the spot
  // (2026-11-22: the room's options are in the waiting room's Room settings)
  await ann.getByTestId('kart-lobby-settings').click()
  await bob.getByTestId('kart-lobby-settings').click()
  await ann.getByRole('combobox', { name: 'Track' }).selectOption('custom')
  await ann.getByTestId('kart-custom-paste').fill('https://example.com/kart?custom=nope')
  await ann.getByTestId('kart-custom-use').click()
  await expect(ann.getByText('That is not a working track link.')).toBeVisible()
  await ann.getByTestId('kart-custom-paste').fill(link)
  await ann.getByTestId('kart-custom-use').click()
  // Everyone sees which track it is
  for (const page of [ann, bob]) {
    await expect(page.getByTestId('kart-custom-summary').first()).toContainText('Test Loop')
    await page.getByRole('button', { name: 'Close' }).click()
  }
  // 2026-11-21: the race waits for everyone to be ready (shared/protocol.ts 8.)
  await bob.getByTestId('kart-lobby-ready').click()
  await expect(ann.getByTestId('kart-lobby-waiting')).toHaveText('Everyone is ready')
  await ann.getByRole('button', { name: 'Start game' }).click()
  for (const page of [ann, bob]) await expect(page.getByTestId('kart-race')).toBeVisible()
  for (const page of [ann, bob]) {
    await expect(page.getByText('Race over')).toBeVisible({ timeout: 180_000 })
  }
  // The room judged both laps on the custom track
  await expect(
    ann.getByRole('region', { name: 'Results' }).getByText(/Finished in \d:\d\d\.\d{3}/),
  ).toHaveCount(2)
})
