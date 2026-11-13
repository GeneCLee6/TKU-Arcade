import { expect, test } from '@playwright/test'
import { createRoom, newPerson } from './helpers.ts'

// Owner, 2026-11-13: a room's four-digit number in the waiting room, typed in the lobby to join;
// the installed app puts that box first and remembers the nickname; the site is installable.

test('a friend joins by typing the room number, and the nickname is remembered', async ({ browser }) => {
  const host = await newPerson(browser)
  await createRoom(host, 'Ann')
  const code = host.getByTestId('room-code')
  await expect(code).toHaveText(/^[1-9]\d{3}$/)
  await expect(host.getByText('Room number', { exact: true })).toBeVisible()
  const number = (await code.textContent()) ?? ''

  const guest = await newPerson(browser)
  await guest.goto('/')
  await guest.getByLabel('Got a room number or a link?').fill(number)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest).toHaveURL(host.url())
  await guest.getByRole('textbox', { name: 'Nickname' }).fill('Bob')
  await guest.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(host.getByText('Bob').first()).toBeVisible()

  // Next time the same phone joins a room, it is not asked for a name again
  await guest.goto('/')
  await guest.getByLabel('Got a room number or a link?').fill(number)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest.getByRole('heading', { name: 'Seats' })).toBeVisible()
  await expect(guest.getByRole('textbox', { name: 'Nickname' })).toHaveCount(0)

  await host.context().close()
  await guest.context().close()
})

test('a number no open room has is answered in place', async ({ page }) => {
  await page.goto('/')
  // 1000 to 9999 are numbers; a room for each is not expected on a preview
  const box = page.getByLabel('Got a room number or a link?')
  for (const tried of ['1000', '9999']) {
    await box.fill(tried)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    const alert = page.getByRole('alert')
    // Either nobody has it (the usual), or by chance someone does and we are in their room
    await expect(alert.or(page.getByRole('heading', { name: 'Seats' }))).toBeVisible()
    if (await alert.isVisible()) {
      await expect(alert).toHaveText('No open room has that number. It may have closed.')
      return
    }
    await page.goto('/')
  }
})

test('the installed app opens with the number box first, on a number pad', async ({ browser }) => {
  const person = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await person.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      query === '(display-mode: standalone)'
        ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
        : real(query)
  })
  await person.goto('/?app=1')
  const box = person.getByLabel('Room number')
  await expect(box).toBeVisible()
  await expect(box).toHaveAttribute('inputmode', 'numeric')
  await expect(box).toBeInViewport({ ratio: 1 })
  await expect(person.getByRole('button', { name: 'Join', exact: true })).toBeInViewport({ ratio: 1 })
  // Big digits must not widen the page: nothing sideways on a phone
  expect(await person.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(person.getByLabel('Got a room number or a link?')).toHaveCount(0)
  await expect(person.getByRole('heading', { name: 'Install as an app' })).toHaveCount(0)
  await person.context().close()
})

test('the site is installable: a manifest, its icons and the offline page are served', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const { icons, display } = (await manifest.json()) as { icons: { src: string }[]; display: string }
  expect(display).toBe('standalone')
  for (const icon of icons) {
    const response = await request.get(icon.src)
    expect(response.ok(), icon.src).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  for (const path of ['/offline.html', '/sw.js']) expect((await request.get(path)).ok(), path).toBe(true)
})
