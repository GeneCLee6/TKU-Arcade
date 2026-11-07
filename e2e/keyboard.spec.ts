import { expect, test, type Page } from '@playwright/test'
import { createRoom, newPerson, playToResult, silentTablePlayers, startGame } from './helpers.ts'

// e7-t06 (AC-7.6): what a person with only a keyboard needs, in a real browser

/** Presses Tab until `target` has the focus: it must be reachable, and in a sane number of stops */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, limit = 40) {
  for (let stop = 0; stop < limit; stop++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`Not reached in ${limit} presses of Tab`)
}

test('every stop on the way through the lobby shows that it has the focus', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New room' }).first()).toBeVisible()
  for (let stop = 0; stop < 12; stop++) {
    await page.keyboard.press('Tab')
    const seen = await page.evaluate(() => {
      const element = document.activeElement
      if (!element || element === document.body) return 'end'
      return getComputedStyle(element).outlineStyle !== 'none' ? 'ring' : element.outerHTML
    })
    if (seen === 'end') break
    expect(seen).toBe('ring')
  }
})

test('a room can be made and a nickname given with the keyboard alone', async ({ page }) => {
  await page.goto('/')
  const newRoom = page.getByRole('button', { name: 'New room' }).first()
  await expect(newRoom).toBeVisible()
  await tabTo(page, newRoom)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Nickname' })).toBeFocused()
  await page.keyboard.type('Ann')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/r\//)
  await expect(page.getByRole('heading', { name: 'Seats' })).toBeVisible()
})

test('Esc closes the nickname dialog and gives the focus back', async ({ page }) => {
  await page.goto('/')
  const newRoom = page.getByRole('button', { name: 'New room' }).first()
  await expect(newRoom).toBeVisible()
  await tabTo(page, newRoom)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(newRoom).toBeFocused()
})

test('the board can be read and the die rolled with the keyboard alone', async ({ page, browser }) => {
  const guest = await newPerson(browser)
  await startGame(page, guest)

  // One Tab stop for the whole board, so the rest of the page stays near
  const cells = page.locator('[data-cell]')
  await expect(cells).toHaveCount(79)
  await expect(page.locator('[data-cell][tabindex="0"]')).toHaveCount(1)

  const stop = page.locator('[data-cell][tabindex="0"]')
  await tabTo(page, stop)
  const first = await stop.getAttribute('data-cell')
  const ring = await stop.locator('rect').evaluate((rect) => getComputedStyle(rect).strokeWidth)
  expect(ring).toBe('8px')

  // Up the left side, away from the piece, and read that cell
  await page.keyboard.press('ArrowUp')
  const moved = page.locator('[data-cell]:focus')
  const cell = await moved.getAttribute('data-cell')
  expect(cell).not.toBe(first)
  await page.keyboard.press('Enter')
  await expect(moved).toHaveAttribute('aria-pressed', 'true')
  const title = await moved.locator('title').textContent()
  await expect(page.getByRole('heading', { level: 3 })).toContainText(title ?? 'no title')

  // Enter again gives the choice back to the game
  await page.keyboard.press('Enter')
  await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('aria-pressed', 'false')

  // Who goes first is drawn by lot, so whoever it is rolls with the keyboard
  const yourTurn = await page.getByText('Your turn').isVisible()
  const roller = yourTurn ? page : guest
  const roll = roller.getByRole('button', { name: 'Roll', exact: true })
  await expect(roll).toHaveAttribute('aria-disabled', 'false')
  await tabTo(roller, roll)
  await roller.keyboard.press('Enter')
  await expect(roller.getByRole('status').filter({ hasText: /Ann|Bob/ })).toBeVisible({
    timeout: 10_000,
  })
  await guest.context().close()
})

test('the turn markers on the seat chips do not hide the focus ring', async ({ page, browser }) => {
  const guest = await newPerson(browser)
  await startGame(page, guest)
  const chip = page.getByRole('button', { name: /^(A|B)?(Ann|Bob)$/ }).first()
  await tabTo(page, chip)
  const outline = await chip.evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: style.outlineWidth }
  })
  expect(outline).toEqual({ style: 'solid', width: '2px' })
  await guest.context().close()
})

test('the rules can be reached from a game card, and the way back too', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'How to play Promotion' })
  await expect(link).toBeVisible()
  await tabTo(page, link)
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/games\/promotion\/rules/)
  const back = page.getByRole('link', { name: 'Back to the lobby' })
  await tabTo(page, back)
  await page.keyboard.press('Enter')
  await page.waitForURL((url) => url.pathname === '/')
})

test('how to play opens over the room and Esc gives the focus back', async ({ page }) => {
  await createRoom(page, 'Ann')
  const open = page.getByRole('button', { name: 'How to play' })
  await tabTo(page, open)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('table')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
})

test('a chip can be taken and ready said with the keyboard alone', async ({ browser }) => {
  const people = await silentTablePlayers(browser, ['Ann', 'Bob', 'Cy'])
  const [host, guest] = people
  await host.getByRole('button', { name: 'Start game' }).click()

  const chip = guest.getByRole('button', { name: 'Take chip 2', exact: true })
  await tabTo(guest, chip)
  await guest.keyboard.press('Enter')
  const mine = guest.getByRole('button', { name: 'Chip 2: you hold it' })
  await expect(mine).toBeVisible()
  // Still the same button: the focus does not fall off the page when a chip changes hands
  await expect(mine).toBeFocused()

  const ready = guest.getByRole('button', { name: 'Ready', exact: true })
  await tabTo(guest, ready)
  await guest.keyboard.press('Space')
  await expect(ready).toHaveAttribute('aria-disabled', 'true')
  await expect(ready).toBeFocused()
  for (const person of people) await person.context().close()
})

test('what comes after the result can be done with the keyboard', async ({ page, browser }) => {
  test.setTimeout(90_000)
  const guest = await newPerson(browser, { reducedMotion: 'reduce' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const result = await playToResult(page, guest)
  const rematch = result.getByRole('button', { name: 'Rematch' })
  await tabTo(page, rematch, 60)
  await page.keyboard.press('Enter')
  await expect(result).toBeHidden()
  await expect(page.getByRole('button', { name: 'Roll', exact: true })).toBeVisible()
  await guest.context().close()
})
