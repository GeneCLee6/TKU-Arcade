import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinRoom, newPerson, playToResult } from './helpers.ts'

// I3 through the real room: a room password (e1-t16), the public room filter (e1-t15) and a replay
// of a finished game (e2-t09)

const close = (people: readonly Page[]) =>
  Promise.all(people.map((person) => person.context().close()))

test('a room password: set by the host, asked of someone new, refused when wrong', async ({
  browser,
}) => {
  const ann = await newPerson(browser)
  await createRoom(ann, 'Ann')
  await ann.getByLabel('Room password (optional)').fill('tamsui')
  await ann.getByRole('button', { name: 'Set password' }).click()
  await expect(ann.getByText('Room password: tamsui')).toBeVisible()
  const bob = await newPerson(browser)
  await bob.goto(ann.url())
  await bob.getByRole('textbox', { name: 'Nickname' }).fill('Bob')
  await bob.getByRole('textbox', { name: 'Nickname' }).press('Enter')
  await expect(bob.getByRole('heading', { name: 'This room has a password' })).toBeVisible()
  await bob.getByLabel('Room password').fill('danshui')
  await bob.getByRole('button', { name: 'Enter' }).click()
  await expect(bob.getByRole('alert').filter({ hasText: 'That is not the password' })).toBeVisible()
  await bob.getByLabel('Room password').fill('tamsui')
  await bob.getByRole('button', { name: 'Enter' }).click()
  await expect(bob.getByRole('heading', { name: 'Seats' })).toBeVisible()
  await expect(bob.getByText('Room password: tamsui')).toBeVisible()
  // Back after a reload, by the seat token
  await bob.reload()
  await expect(bob.getByRole('heading', { name: 'Seats' })).toBeVisible()
  // Taken away: the next one walks in
  await ann.getByRole('button', { name: 'Remove the password' }).click()
  const cy = await newPerson(browser)
  await joinRoom(cy, ann.url(), 'Cy')
  await close([ann, bob, cy])
})

test('the public rooms filter by game and free seats, and one can be joined at random', async ({
  browser,
}) => {
  const host = await newPerson(browser)
  const response = await host.request.post('/api/rooms', {
    data: { gameId: 'bluff', public: true },
  })
  const { id } = (await response.json()) as { id: string }
  await joinRoom(host, `/r/${id}`, 'Hostess')
  const visitor = await newPerson(browser)
  await visitor.goto('/')
  await expect(visitor.getByRole('button', { name: "Join Hostess's room" })).toBeVisible({
    timeout: 20_000,
  })
  await visitor.getByLabel('Game', { exact: true }).selectOption({ label: 'Silent Table' })
  await expect(visitor.getByRole('button', { name: "Join Hostess's room" })).toHaveCount(0)
  await expect(visitor.getByText('No public room matches')).toBeVisible()
  await visitor.getByLabel('Game', { exact: true }).selectOption({ label: 'Bluff Reader' })
  await visitor.getByRole('button', { name: 'Join a random one' }).click()
  await visitor.waitForURL(/\/r\//)
  await close([host, visitor])
})

test('a finished game can be replayed step by step', async ({ browser }) => {
  test.setTimeout(180_000)
  const ann = await newPerson(browser, { reducedMotion: 'reduce' })
  const bob = await newPerson(browser, { reducedMotion: 'reduce' })
  const result = await playToResult(ann, bob)
  const id = new URL(ann.url()).pathname.split('/')[2]
  expect((await ann.request.get(`/api/rooms/${id}/replay`)).status()).toBe(200)
  await result.getByRole('link', { name: 'Watch the replay' }).click()
  await ann.waitForURL(/\/replay$/)
  const status = ann.getByRole('status').filter({ hasText: /^Step 0 of \d+/ })
  await expect(status).toBeVisible()
  const total = Number(/of (\d+)/.exec((await status.textContent()) ?? '')?.[1])
  expect(total).toBeGreaterThanOrEqual(10)
  await expect(ann.locator('[data-cell]').first()).toBeVisible()
  await ann.getByRole('button', { name: 'Next step' }).click()
  await expect(ann.getByText(/^Step 1 of \d+ · by (Ann|Bob)/)).toBeVisible()
  await ann.getByRole('button', { name: 'End', exact: true }).click()
  await expect(ann.getByText(new RegExp(`^Step ${total} of ${total}`))).toBeVisible()
  await close([ann, bob])
})

test('nothing to replay before a game has ended', async ({ browser }) => {
  const ann = await newPerson(browser)
  const response = await ann.request.post('/api/rooms', { data: { gameId: 'promotion' } })
  const { id } = (await response.json()) as { id: string }
  expect((await ann.request.get(`/api/rooms/${id}/replay`)).status()).toBe(404)
  await ann.goto(`/r/${id}/replay`)
  await expect(ann.getByText('There is no finished game to replay in this room.')).toBeVisible()
  await close([ann])
})

// e1-t14: only where the site can reach LongTalk (a PR preview or production, not `npm run dev`)
test('opens a LongTalk voice room and posts its link in the chat', async ({ browser, baseURL }) => {
  // The dev server has no service binding to LongTalk
  test.skip(baseURL?.includes('localhost') ?? true, 'no LongTalk binding on the dev server')
  const ann = await newPerson(browser)
  const status = await ann.request.get('/api/voice')
  const { available } = (await status.json()) as { available: boolean }
  test.skip(!available, 'no LongTalk here')
  await createRoom(ann, 'Ann')
  await ann.getByRole('button', { name: 'Open a voice room' }).click()
  await expect(
    ann
      .getByRole('log')
      .getByRole('link', { name: /^https:\/\/longtalk\..*\/r\/[1-9A-HJ-NP-Za-km-z]{10}$/ }),
  ).toBeVisible()
  await close([ann])
})
