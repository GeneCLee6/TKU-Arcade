// 2026-11-23 (src/components/social/): two people in a room trade emotes and phrases, look at each
// other's player card, and one hides theirs
import { expect, test } from '@playwright/test'
import { createRoom, joinRoom, newPerson } from './helpers.ts'

test('emotes, phrases and player cards between two browsers', async ({ browser }) => {
  test.setTimeout(90_000)
  const ann = await newPerson(browser)
  const bob = await newPerson(browser)
  await createRoom(ann, 'Ann')
  await joinRoom(bob, ann.url(), 'Bob')

  // Ann's emote floats by her name on Bob's screen
  await ann.getByRole('button', { name: 'Reactions' }).click()
  await ann.getByRole('button', { name: 'Party' }).click()
  const onBob = bob.getByTestId('emote-bubble')
  await expect(onBob).toHaveCount(1)
  await expect(onBob).toContainText('🎉')
  await expect(onBob).toHaveAttribute('data-anchored', '')

  // Bob's phrase, on Ann's
  await bob.getByRole('button', { name: 'Reactions' }).click()
  await bob.getByRole('button', { name: 'GG' }).click()
  await expect(ann.getByTestId('emote-bubble').filter({ hasText: 'GG' })).toBeVisible()

  // Bob opens Ann's card: her numbers, from her own browser
  await bob.getByRole('button', { name: "Open Ann's player card" }).first().click()
  const card = bob.getByTestId('player-card')
  await expect(card.getByTestId('player-card-name')).toHaveText('Ann')
  await expect(card.getByTestId('player-card-achievements')).toContainText('0 of')
  await bob.getByRole('button', { name: 'Close' }).click()
  await expect(card).toBeHidden()

  // Ann looks at her own and hides it; Bob then sees it is private
  await ann.getByRole('button', { name: "Open Ann's player card" }).first().click()
  const mine = ann.getByTestId('player-card')
  await expect(mine.getByText('You', { exact: true })).toBeVisible()
  await mine.getByRole('checkbox', { name: 'Show my card to rooms' }).uncheck()
  await ann.getByRole('button', { name: 'Close' }).click()

  await expect(async () => {
    await bob.getByRole('button', { name: "Open Ann's player card" }).first().click()
    await expect(bob.getByTestId('player-card-empty')).toHaveText('Ann keeps their card private.', {
      timeout: 1000,
    })
  }).toPass({ timeout: 10_000 })
  await bob.getByRole('button', { name: 'Close' }).click()

  await ann.context().close()
  await bob.context().close()
})
