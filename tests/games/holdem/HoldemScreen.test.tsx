import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { holdem, startHand } from '../../../shared/games/holdem/rules.ts'
import type { HoldemAction, HoldemState } from '../../../shared/games/holdem/types.ts'
import { isGameError, type Actor, type GameProjection, type Rng } from '../../../shared/games/types.ts'
import { fullDeck, type Card } from '../../../shared/poker/hand.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import HoldemScreen from '../../../src/games/holdem/HoldemScreen.tsx'
import { seatSpots } from '../../../src/games/holdem/screenState.ts'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']
const cards = (text: string) => text.split(' ') as Card[]

/** Three players, button seat 0, with these cards: seat 0 opens before the flop */
function dealt(holes = ['Ac Ad', 'Kc Kd', '7h 2s'], board = '9c 9d 9h 3s 2c'): HoldemState {
  const base = holdem.init(makeSeats(3), { stack: 1000, blinds: 20, blindUp: 10, timer: 30 }, createRng(1))
  const chosen = [...holes.flatMap(cards), ...cards(board)]
  const deck = [...chosen, ...fullDeck().filter((card) => !chosen.includes(card))]
  const rng: Rng = { float: () => 0, int: () => 0, pick: (items) => items[0], shuffle: <T,>() => [...deck] as unknown as T[] }
  return startHand({ ...base, hand: 0, players: base.players.map((player) => ({ ...player, stack: 1000, bet: 0, committed: 0, hole: [] })), log: [], history: [] }, 0, rng)
}

function act(state: HoldemState, action: HoldemAction, actor: Actor): HoldemState {
  const next = holdem.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const projection = (state: HoldemState, seat: number | null): GameProjection => ({
  view: holdem.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : holdem.legalActions(state, seat)) as unknown as JsonValue[],
  over: holdem.isOver(state),
  result: holdem.isOver(state) ? holdem.result(state) : null,
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
      room: { id: 'room', gameId: 'holdem', status, options: {}, minPlayers: 2, maxSeats: 9 },
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

/** The screen as `seat` sees `state` (null: the spectator Zoe) */
function show(state: HoldemState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], holdem.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <HoldemScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

const buttonNamed = (name: string | RegExp) => screen.getByRole('button', { name })

vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('the table', () => {
  it('shows your own two cards big, and only card backs of the others', () => {
    show(dealt(), 1)
    const hand = screen.getByTestId('your-hand')
    expect(within(hand).getByRole('img', { name: 'King of clubs' })).toBeInTheDocument()
    expect(within(hand).getByRole('img', { name: 'King of diamonds' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Ace of clubs' })).toBeNull()
    expect(screen.getByTestId('pot')).toHaveTextContent('Pot 30')
    expect(screen.getByTestId('seat-2')).toHaveTextContent('980')
    expect(screen.getByTestId('bet-2')).toHaveTextContent('20')
    expect(screen.getByRole('img', { name: 'Dealer button' })).toBeInTheDocument()
    expect(screen.getByTestId('holdem-prompt')).toHaveTextContent('Waiting for Al.')
  })

  it('shows a spectator no cards at all', () => {
    show(dealt(), null)
    expect(screen.queryByTestId('your-hand')).toBeNull()
    expect(screen.queryByRole('img', { name: /of (clubs|diamonds|hearts|spades)/ })).toBeNull()
  })

  it('puts you at the bottom of the table and the others clockwise', () => {
    const spots = seatSpots([0, 1, 2, 3], 2)
    expect(spots[2].x).toBeCloseTo(50)
    expect(spots[2].y).toBeGreaterThan(90)
    expect(spots[3].x).toBeLessThan(50)
  })
})

describe('your turn', () => {
  it('offers fold, call with the amount, and raise', () => {
    const room = show(dealt(), 0)
    expect(screen.getByTestId('holdem-prompt')).toHaveTextContent('Your turn: 20 to call.')
    fireEvent.click(buttonNamed('Call 20'))
    expect(room.act).toHaveBeenCalledWith({ type: 'call' })
    expect(buttonNamed('Fold')).toBeDisabled()
  })

  it('raises with the quick sizes and the slider', () => {
    const room = show(dealt(), 0)
    fireEvent.click(buttonNamed('Raise'))
    const panel = screen.getByTestId('raise-panel')
    expect(within(panel).getByTestId('raise-amount')).toHaveTextContent('40')
    fireEvent.click(within(panel).getByRole('button', { name: 'Pot' }))
    // 30 in the pot and 20 to call: the pot raise goes to 20 + 50
    expect(within(panel).getByTestId('raise-amount')).toHaveTextContent('70')
    fireEvent.change(within(panel).getByRole('slider', { name: 'Amount' }), { target: { value: '333' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Raise to 333' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'raise', to: 333 })
  })

  it('names all in on the button that pushes every chip', () => {
    show(dealt(), 0)
    fireEvent.click(buttonNamed('Raise'))
    fireEvent.click(buttonNamed('All in'))
    expect(buttonNamed('All in: 1,000')).toBeInTheDocument()
  })

  it('offers a check, not a fold, when nobody has bet', () => {
    const state = act(act(dealt(), { type: 'call' }, 0), { type: 'call' }, 1)
    show(state, 2)
    expect(screen.getByTestId('holdem-prompt')).toHaveTextContent('Your turn: check or bet.')
    expect(screen.queryByRole('button', { name: 'Fold' })).toBeNull()
    expect(buttonNamed('Check')).toBeInTheDocument()
  })
})

describe('the end of a hand', () => {
  it('lights up the winning five, names the hand, and keeps a loser’s cards hidden', () => {
    // Everyone all in: every hand is shown
    let state = dealt()
    state = act(state, { type: 'raise', to: 1000 }, 0)
    state = act(state, { type: 'call' }, 1)
    state = act(state, { type: 'fold' }, 2)
    show(state, 2)
    const result = screen.getByTestId('hand-result')
    expect(result).toHaveTextContent('Main pot 2,020')
    expect(result).toHaveTextContent('Al wins 2,020')
    expect(result).toHaveTextContent('with Full house')
    const lit = screen.getAllByRole('img').filter((img) => img.getAttribute('data-win'))
    // Nines full of aces: Al's two aces and the three nines on the board
    expect(lit.map((img) => img.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Ace of clubs', 'Ace of diamonds', '9 of clubs', '9 of diamonds', '9 of hearts']),
    )
    // Seat 2 folded: its cards are nowhere
    expect(screen.queryByRole('img', { name: 'Seven of hearts' })).toBeNull()
    expect(screen.getByTestId('hand-log')).toHaveTextContent('Al wins 2,020 with Full house.')
  })

  it('names the hand in Chinese', () => {
    setLanguage('zh-TW')
    let state = dealt()
    state = act(state, { type: 'raise', to: 1000 }, 0)
    state = act(state, { type: 'call' }, 1)
    state = act(state, { type: 'fold' }, 2)
    show(state, 0)
    expect(screen.getByTestId('hand-result')).toHaveTextContent('葫蘆')
  })

  it('a hand won by folds shows nothing', () => {
    let state = dealt()
    state = act(state, { type: 'raise', to: 100 }, 0)
    state = act(state, { type: 'fold' }, 1)
    state = act(state, { type: 'fold' }, 2)
    show(state, 1)
    expect(screen.getByTestId('hand-result')).toHaveTextContent('Al wins 50: everyone else folded.')
    expect(screen.queryByRole('img', { name: 'Ace of clubs' })).toBeNull()
  })
})

describe('sitting out and stopping', () => {
  it('sends sit out and the vote to stop', () => {
    const room = show(dealt(), 1)
    fireEvent.click(buttonNamed('Sit out'))
    expect(room.act).toHaveBeenCalledWith({ type: 'away', away: true })
    fireEvent.click(buttonNamed('Stop after this hand'))
    expect(room.act).toHaveBeenCalledWith({ type: 'endVote', on: true })
  })
})
