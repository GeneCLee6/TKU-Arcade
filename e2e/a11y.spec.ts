import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinRoom, newPerson, playToResult, startGame } from './helpers.ts'

// e7-t06 (AC-7.6): the skeleton. A new screen gets a line here. Dev-only: nothing of axe reaches the
// site's bundle. "No serious errors" per DESIGN §6, so the two worst of axe's four levels fail a test.
const BLOCKING = new Set(['serious', 'critical'])

async function expectNoSeriousProblems(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target.join(' ')) }))
  expect(blocking).toEqual([])
}

test('the lobby in Traditional Chinese', async ({ browser }) => {
  const page = await newPerson(browser, { locale: 'zh-TW' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '建立房間' }).first()).toBeVisible()
  await expectNoSeriousProblems(page)
  await page.context().close()
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('the lobby', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'New room' }).first()).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the rules page', async ({ page }) => {
      await page.goto('/games/promotion/rules')
      await expect(page.getByRole('table')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('how to play, over the room', async ({ page }) => {
      await createRoom(page, 'Ann')
      await page.getByRole('button', { name: 'How to play' }).click()
      await expect(page.getByRole('dialog').getByRole('table')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the result', async ({ page, browser }) => {
      test.setTimeout(90_000)
      const guest = await newPerson(browser, { colorScheme: scheme, reducedMotion: 'reduce' })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await playToResult(page, guest)
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })

    test('the nickname dialog', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'New room' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoSeriousProblems(page)
    })

    test('the waiting room and joining it', async ({ page, browser }) => {
      await createRoom(page, 'Ann')
      await expectNoSeriousProblems(page)

      const guest = await newPerson(browser, { colorScheme: scheme })
      await guest.goto(page.url())
      await expect(guest.getByRole('textbox', { name: 'Nickname' })).toBeVisible()
      await expectNoSeriousProblems(guest)

      await joinRoom(guest, page.url(), 'Bob')
      await expectNoSeriousProblems(guest)
      // The host's view of someone else has more on it
      await expect(page.getByText('Bob')).toBeVisible()
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })

    test('a game of promotion', async ({ page, browser }) => {
      const guest = await newPerson(browser, { colorScheme: scheme })
      await startGame(page, guest)
      await expectNoSeriousProblems(page)
      await guest.context().close()
    })
  })
}
