import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '../../../shared/games/rng.ts'
import { goalFor, secretScroll } from '../../../shared/games/secret-scroll/rules.ts'
import type { ScrollAction, ScrollCard, ScrollPlayer, ScrollState } from '../../../shared/games/secret-scroll/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import SecretScrollScreen from '../../../src/games/secret-scroll/SecretScrollScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']

function act(state: ScrollState, action: ScrollAction, actor: Actor): ScrollState {
  const next = secretScroll.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

/** Seat 0 to play with `hands[0]`; the others hold one card each */
function position(hands: ScrollCard[][], deck: ScrollCard[] = [1, 2, 3, 4]): ScrollState {
  const players: ScrollPlayer[] = hands.map((hand, seat) => ({ seat, hand, discards: [], out: false, shielded: false, tokens: 0 }))
  return {
    phase: 'turn',
    players,
    current: 0,
    round: 1,
    goal: goalFor('standard', hands.length),
    length: 'standard',
    beggars: false,
    deck,
    hidden: 5,
    faceUp: [],
    events: [],
    lastRound: null,
  }
}

const projection = (state: ScrollState, seat: number | null): GameProjection => ({
  view: secretScroll.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : secretScroll.legalActions(state, seat)) as unknown as JsonValue[],
  over: secretScroll.isOver(state),
  result: secretScroll.isOver(state) ? secretScroll.result(state) : null,
  chatLocked: false,
})

const member = (id: string, seat: number | null): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host: seat === 0,
  online: true,
  absent: false,
})

function parts(you: string, status: RoomStatus = 'playing'): RoomParts {
  const members = [...NAMES.map((name, seat) => member(name, seat)), member('Zoe', null)]
  return {
    view: {
      room: { id: 'room', gameId: 'secret-scroll', status, options: {}, minPlayers: 2, maxSeats: 6 },
      members: Object.fromEntries(members.map((m) => [m.id, m])),
      game: null,
      coverable: [],
    },
    you,
    timers: [],
    onSit: vi.fn(),
    onCover: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onDissolve: vi.fn(),
    onReopen: vi.fn(),
    onRematch: vi.fn(),
    act: vi.fn(),
    chat: { messages: [], locked: false, onSend: vi.fn(), draftStore: new ChatDraft() },
  }
}

function show(state: ScrollState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], secretScroll.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <SecretScrollScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

/** The dock may be drawn in two places (wide and phone); any copy will do */
const firstButton = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]

vi.setConfig({ testTimeout: 30_000 })
beforeAll(() => stubDialog())
beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('your hand', () => {
  it('shows your two cards with their texts, and only counts of the others', () => {
    show(position([[1, 4], [6], [2]]), 0)
    const hand = screen.getByTestId('your-hand')
    expect(within(hand).getByText('Constable')).toBeInTheDocument()
    expect(within(hand).getByText('Monk')).toBeInTheDocument()
    expect(within(screen.getByTestId('tile-1')).queryByText('Mask Maker')).toBeNull()
    expect(within(screen.getByTestId('tile-1')).getByLabelText('Cards in hand: 1')).toBeInTheDocument()
  })

  it('plays the Constable: card, then player, then the named card', () => {
    const room = show(position([[1, 4], [6], [2]]), 0)
    expect(firstButton('Play')).toBeDisabled()
    fireEvent.click(screen.getByTestId('hand-card-1'))
    const players = screen.getByRole('group', { name: 'Pick a player' })
    fireEvent.click(within(players).getByRole('button', { name: 'Bo' }))
    const guesses = screen.getByRole('group', { name: 'Name a card' })
    expect(within(guesses).queryByRole('button', { name: /Constable/ })).toBeNull()
    fireEvent.click(within(guesses).getByRole('button', { name: 'Mask Maker (6)' }))
    fireEvent.click(firstButton('Play'))
    expect(room.act).toHaveBeenCalledWith({ type: 'play', card: 1, target: 1, guess: 6 })
  })

  it('plays a card that picks nobody straight away', () => {
    const room = show(position([[4, 2], [6], [2]]), 0)
    fireEvent.click(screen.getByTestId('hand-card-4'))
    fireEvent.click(firstButton('Play'))
    expect(room.act).toHaveBeenCalledWith({ type: 'play', card: 4, target: null, guess: null })
  })

  it('warns before the Secret Scroll is thrown away, and forces the Strategist', () => {
    show(position([[8, 2], [6], [2]]), 0)
    fireEvent.click(screen.getByTestId('hand-card-8'))
    expect(screen.getAllByText('Playing the Secret Scroll puts you out.')[0]).toBeInTheDocument()
  })

  it('keeps the Strategist the only card to play beside the Drunkard', () => {
    show(position([[7, 5], [6], [2]]), 0)
    expect(screen.getByTestId('hand-card-5')).toBeDisabled()
    expect(screen.getByTestId('hand-card-7')).toBeEnabled()
    expect(screen.getByText('You must play the Strategist.')).toBeInTheDocument()
  })

  it('shows nothing to press when it is not your turn, and no hand to a spectator', () => {
    show(position([[1, 4], [6], [2]]), 1)
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.getAllByText('Al is playing.')[0]).toBeInTheDocument()
  })
})

describe('the log', () => {
  it('tells only the spy what they saw', () => {
    const state = act(position([[2, 4], [6], [3]]), { type: 'play', card: 2, target: 2, guess: null }, 0)
    show(state, 0)
    const log = screen.getByTestId('scroll-log')
    expect(within(log).getByText('Al played Spy (2) and looked at Cy’s card.')).toBeInTheDocument()
    expect(within(log).getByText('Only you saw: Cy holds Duelist (3).')).toBeInTheDocument()
  })

  it('does not tell the others', () => {
    const state = act(position([[2, 4], [6], [3]]), { type: 'play', card: 2, target: 2, guess: null }, 0)
    show(state, 1)
    expect(screen.queryByText(/Only you saw/)).toBeNull()
  })

  it('says who went out in a duel and with what', () => {
    const state = act(position([[3, 7], [5], [2]]), { type: 'play', card: 3, target: 1, guess: null }, 0)
    show(state, 2)
    const log = screen.getByTestId('scroll-log')
    expect(within(log).getByText('Al played Duelist (3) against Bo. Bo is out.')).toBeInTheDocument()
    expect(within(log).getByText('Bo is out with Drunkard (5).')).toBeInTheDocument()
  })
})

describe('the end of a round', () => {
  it('shows the winner and the next-round button to everyone at the table', () => {
    const state = act(position([[1, 4], [6]], [2, 3]), { type: 'play', card: 1, target: 1, guess: 6 }, 0)
    const room = show(state, 1)
    expect(screen.getByTestId('round-end')).toHaveTextContent('Round 1: Al')
    fireEvent.click(firstButton('Next round'))
    expect(room.act).toHaveBeenCalledWith({ type: 'next' })
  })
})

describe('in Chinese', () => {
  it('names the cards in Chinese', () => {
    setLanguage('zh-TW')
    show(position([[1, 8], [6], [2]]), 0)
    const hand = screen.getByTestId('your-hand')
    expect(within(hand).getByText('捕快')).toBeInTheDocument()
    expect(within(hand).getByText('祕笈')).toBeInTheDocument()
  })
})
