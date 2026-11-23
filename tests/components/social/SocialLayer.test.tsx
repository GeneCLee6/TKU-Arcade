// 2026-11-23 (src/components/social/): the room's emotes, phrases and player cards
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomMember, RoomView } from '../../../shared/protocol.ts'
import { EMOTE_COUNT, REACTION_RATE } from '../../../shared/social.ts'
import { setCardShared } from '../../../src/achievements/cardPrefs.ts'
import { save } from '../../../src/achievements/store.ts'
import { NameButton } from '../../../src/components/social/NameButton.tsx'
import { ReactionGate } from '../../../src/components/social/reactionGate.ts'
import SocialLayer from '../../../src/components/social/SocialLayer.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import type { FloatingReaction } from '../../../src/lib/reactions.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

const member = (id: string, over: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat: null,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...over,
})

const card = {
  title: 'kart-first-finish',
  unlocked: 9,
  total: 90,
  games: 12,
  boardWins: 4,
  kartWins: 2,
  kart: 'heron',
  driver: 'club',
  lap: { track: 'riverside', ms: 61_234 },
}

function viewOf(
  members: RoomMember[],
  gameId = 'promotion',
  status: RoomView['room']['status'] = 'waiting',
): RoomView {
  return {
    room: { id: 'room', gameId, status, options: {}, minPlayers: 2, maxSeats: 4 },
    members: Object.fromEntries(members.map((one) => [one.id, one])),
    game: null,
    coverable: [],
  }
}

function layer(view: RoomView, reactions: FloatingReaction[] = [], you = 'Al') {
  const onReact = vi.fn()
  const onSendProfile = vi.fn()
  const result = render(
    <MemoryRouter>
      <SocialLayer
        view={view}
        you={you}
        reactions={reactions}
        onReact={onReact}
        onSendProfile={onSendProfile}
      />
      {Object.values(view.members).map((one) => (
        <NameButton key={one.id} member={one.id} name={one.name} />
      ))}
    </MemoryRouter>,
  )
  return { onReact, onSendProfile, ...result }
}

beforeAll(stubDialog)

beforeEach(() => {
  localStorage.clear()
  setLanguage('en')
})

describe('the emote panel', () => {
  it('sends an emote or a phrase by its number, and closes', () => {
    const { onReact } = layer(viewOf([member('Al'), member('Bo')]))
    const toggle = screen.getByRole('button', { name: 'Reactions' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Party' }))
    expect(onReact).toHaveBeenCalledWith(6)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000)
    fireEvent.click(screen.getByRole('button', { name: 'GG' }))
    expect(onReact).toHaveBeenLastCalledWith(EMOTE_COUNT + 1)
    vi.restoreAllMocks()
  })

  it('has twelve emotes and eight phrases, and says so when they come too fast', () => {
    const { onReact } = layer(viewOf([member('Al')]))
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }))
    const panel = screen.getByRole('group', { name: 'Reactions' })
    expect(within(panel).getAllByRole('button')).toHaveLength(20)
    fireEvent.click(within(panel).getByRole('button', { name: 'Applause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Applause' }))
    expect(onReact).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Easy there')
  })

  it("keeps the room's limits on the sender's side too", () => {
    const gate = new ReactionGate()
    let now = 1_000_000
    let sent = 0
    for (let tries = 0; tries < 20; tries++, now += 600) if (gate.take(now)) sent++
    // 20 tries 600 ms apart span 11.4 s: one window's worth, then more as the first ones leave it
    expect(sent).toBeGreaterThanOrEqual(REACTION_RATE.count)
    expect(sent).toBeLessThan(20)
    expect(gate.take(now + REACTION_RATE.windowMs)).toBe(true)
  })

  it('offers "show emotes during races" only in the race room', () => {
    layer(viewOf([member('Al')], 'kart'))
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }))
    const box = screen.getByRole('checkbox', { name: 'Show emotes during races' })
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(localStorage.getItem('tku-arcade.social.raceEmotes')).toBe('off')
  })
})

describe('the bubbles', () => {
  it("float each member's latest reaction, read once to screen readers", () => {
    layer(viewOf([member('Al'), member('Bo')]), [
      { id: 1, member: 'Bo', reaction: 0 },
      { id: 2, member: 'Bo', reaction: EMOTE_COUNT },
      { id: 3, member: 'Al', reaction: 5 },
    ])
    const bubbles = screen.getAllByTestId('emote-bubble')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]).toHaveTextContent('Nice one!')
    expect(bubbles[0]).toHaveTextContent('Bo: Nice one!')
  })

  it('stay away during a race when turned off', () => {
    localStorage.setItem('tku-arcade.social.raceEmotes', 'off')
    layer(viewOf([member('Al'), member('Bo', { seat: 1 })], 'kart', 'playing'), [
      { id: 1, member: 'Bo', reaction: 0 },
    ])
    expect(screen.queryByTestId('emote-bubble')).toBeNull()
  })
})

describe('player cards', () => {
  it("open from a name with what that member's browser sent", async () => {
    layer(viewOf([member('Al'), member('Bo', { profile: card })]))
    fireEvent.click(screen.getByRole('button', { name: "Open Bo's player card" }))
    const shown = await screen.findByTestId('player-card')
    expect(within(shown).getByTestId('player-card-name')).toHaveTextContent('Bo')
    expect(within(shown).getByTestId('player-card-achievements')).toHaveTextContent('9 of 90 (10%)')
    expect(shown).toHaveTextContent('1:01.234')
    expect(shown).toHaveTextContent('12')
    expect(within(shown).queryByRole('checkbox')).toBeNull()
  })

  it("say so when a member's card is private, and a computer has none", async () => {
    layer(viewOf([member('Al'), member('Bo')]))
    fireEvent.click(screen.getByRole('button', { name: "Open Bo's player card" }))
    expect(await screen.findByTestId('player-card-empty')).toHaveTextContent(
      'Bo keeps their card private.',
    )
  })

  it("sends one's own card, and takes it away from one's own card", async () => {
    save({ stats: { n: { 'platform.games': 3 }, t: {} }, unlocked: {} })
    const { onSendProfile, rerender } = layer(viewOf([member('Al'), member('Bo')]))
    await act(() => new Promise((done) => setTimeout(done, 5)))
    expect(onSendProfile).toHaveBeenCalledWith(expect.objectContaining({ games: 3 }))
    const sent = onSendProfile.mock.calls[0][0]
    const view = viewOf([member('Al', { profile: sent }), member('Bo')])
    rerender(
      <MemoryRouter>
        <SocialLayer
          view={view}
          you="Al"
          reactions={[]}
          onReact={vi.fn()}
          onSendProfile={onSendProfile}
        />
        <NameButton member="Al" name="Al" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: "Open Al's player card" }))
    const mine = await screen.findByTestId('player-card')
    fireEvent.click(within(mine).getByRole('checkbox', { name: 'Show my card to rooms' }))
    expect(onSendProfile).toHaveBeenLastCalledWith(null)
    setCardShared(true)
  })
})
