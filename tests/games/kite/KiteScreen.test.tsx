import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { kite } from '../../../shared/games/kite/rules.ts'
import type { KiteAction, KiteOptions, KiteState } from '../../../shared/games/kite/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import KiteScreen from '../../../src/games/kite/KiteScreen.tsx'
import { knownOf, logLine, otherHands } from '../../../src/games/kite/screenState.ts'
import { setLanguage, t } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']
const OPTIONS: KiteOptions = { rainbow: false, turnSeconds: 0 }

const start = (options: Partial<KiteOptions> = {}) =>
  kite.init(makeSeats(NAMES.length), { ...OPTIONS, ...options }, createRng(5))

function act(state: KiteState, action: KiteAction, actor: Actor): KiteState {
  const next = kite.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const projection = (state: KiteState, seat: number | null): GameProjection => ({
  view: kite.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : kite.legalActions(state, seat)) as unknown as JsonValue[],
  over: kite.isOver(state),
  result: kite.isOver(state) ? kite.result(state) : null,
  chatLocked: kite.chatLocked?.(state) ?? false,
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
      room: { id: 'room', gameId: 'kite', status, options: {}, minPlayers: 2, maxSeats: 5 },
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
function show(state: KiteState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], kite.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <KiteScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('the hands', () => {
  it('shows every other hand face up and your own as unknown', () => {
    const state = start()
    show(state, 1)
    const cy = screen.getByTestId('hand-2')
    const first = state.hands[2][0]
    expect(within(cy).getAllByRole('img')[0]).toHaveAccessibleName(
      `${t(`games.kite.suit.${first.suit}`)} ${first.rank}. Cy knows: Nothing known yet`,
    )
    const own = screen.getAllByTestId('own-card')
    expect(own).toHaveLength(5)
    expect(own[0]).toHaveAccessibleName('Your card 1: Nothing known yet')
    // Others come in turn order from the next player
    expect(otherHands(kite.view(state, 1)).map((hand) => hand.seat)).toEqual([2, 0])
  })

  it('writes what the notes told you on your own cards', () => {
    let state = start()
    const target = state.hands[1]
    state = act(state, { type: 'hintRank', to: 1, rank: target[0].rank }, 0)
    show(state, 1)
    expect(screen.getAllByTestId('own-card')[0]).toHaveAccessibleName(
      new RegExp(`^Your card 1: Known: ${target[0].rank}`),
    )
    expect(screen.getByTestId('log')).toHaveTextContent(`Al → Bo: ${target[0].rank}`)
  })

  it('shows a spectator no card', () => {
    show(start(), null)
    expect(screen.queryByTestId('own-hand')).toBeNull()
    expect(within(screen.getByTestId('hand-0')).getAllByRole('img')[0]).toHaveAccessibleName(/^Card 1, hidden/)
  })
})

describe('a note in two taps', () => {
  it('a friend, then a colour or a number', () => {
    const state = start()
    const room = show(state, 0)
    expect(screen.getByText(/Your turn: tap a friend/)).toBeInTheDocument()
    fireEvent.click(buttonNamed('Pass Bo a note'))
    expect(screen.getByText('A note for Bo: tap a colour or a number.')).toBeInTheDocument()
    const pad = screen.getByTestId('hint-pad')
    const rank = state.hands[1][0].rank
    fireEvent.click(within(pad).getByRole('button', { name: `Note: ${rank}` }))
    expect(room.act).toHaveBeenCalledWith({ type: 'hintRank', to: 1, rank })
  })

  it('offers only the colours and numbers in that hand', () => {
    const state = start()
    show(state, 0)
    fireEvent.click(buttonNamed('Pass Bo a note'))
    const pad = screen.getByTestId('hint-pad')
    for (const rank of [1, 2, 3, 4, 5]) {
      const has = state.hands[1].some((c) => c.rank === rank)
      expect(within(pad).getByRole('button', { name: `Note: ${rank}` })).toHaveProperty('disabled', !has)
    }
  })

  it('gives the others no buttons', () => {
    show(start(), 1)
    expect(screen.getByText('Al is taking their turn.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /a note$/ })).toBeNull()
  })
})

describe('your own kite in two taps', () => {
  it('the card, then fly it', () => {
    const state = start()
    const room = show(state, 0)
    fireEvent.click(screen.getAllByTestId('own-card')[2])
    expect(screen.getByText(/Your card 3: fly it/)).toBeInTheDocument()
    fireEvent.click(buttonNamed('Fly it'))
    expect(room.act).toHaveBeenCalledWith({ type: 'play', card: state.hands[0][2].id })
  })

  it('cannot set aside with all 8 notes in hand', () => {
    show(start(), 0)
    fireEvent.click(screen.getAllByTestId('own-card')[0])
    expect(buttonNamed('Set aside')).toBeDisabled()
  })
})

describe('the table', () => {
  it('shows the score, notes, burns and the discards', () => {
    let state = start()
    state = act(state, { type: 'hintRank', to: 1, rank: state.hands[1][0].rank }, 0)
    state = act(state, { type: 'discard', card: state.hands[1][0].id }, 1)
    show(state, 2)
    expect(screen.getByTestId('notes')).toHaveTextContent('Notes 8/8')
    expect(screen.getByTestId('burns')).toHaveTextContent('Snapped 0/3')
    expect(within(screen.getByTestId('discards')).getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('note')).toHaveTextContent('Chat is closed')
  })

  it('words the log', () => {
    const name = (seat: number) => NAMES[seat]
    expect(logLine(t, { kind: 'play', turn: 3, seat: 1, card: { suit: 'red', rank: 2 }, slot: 0, ok: false }, name)).toBe(
      'Bo flew Red 2 out of order: the line snapped.',
    )
    expect(
      logLine(t, { kind: 'hint', turn: 1, seat: 0, to: 2, hint: { kind: 'suit', suit: 'jade' }, cards: [4, 7], slots: [0, 3] }, name),
    ).toBe('Al → Cy: Jade, cards 1, 4')
    expect(knownOf({ suits: ['red'], ranks: [1, 2] }, ['red', 'gold'])).toEqual({
      suit: 'red',
      rank: null,
      notSuits: [],
      notRanks: [3, 4, 5],
    })
  })
})
