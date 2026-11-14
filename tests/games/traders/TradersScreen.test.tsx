import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { cardOf, traders } from '../../../shared/games/traders/rules.ts'
import type { TradersAction, TradersPlayer, TradersState } from '../../../shared/games/traders/types.ts'
import { isGameError, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import TradersScreen from '../../../src/games/traders/TradersScreen.tsx'
import { NOTHING, takeOf, tapGood } from '../../../src/games/traders/screenState.ts'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']

const start = () => traders.init(makeSeats(NAMES.length), { target: 15 }, createRng(4))
const first = (state: TradersState) => state.order[state.turn]

function act(state: TradersState, action: TradersAction): TradersState {
  const next = traders.reduce(state, action, first(state), createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

function withMe(state: TradersState, change: Partial<TradersPlayer>): TradersState {
  return { ...state, players: state.players.map((player, index) => (index === state.turn ? { ...player, ...change } : player)) }
}

const projection = (state: TradersState, seat: number | null): GameProjection => ({
  view: traders.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : traders.legalActions(state, seat)) as unknown as JsonValue[],
  over: traders.isOver(state),
  result: traders.isOver(state) ? traders.result(state) : null,
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
      room: { id: 'room', gameId: 'traders', status, options: {}, minPlayers: 2, maxSeats: 4 },
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

function show(state: TradersState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], traders.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <TradersScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })

vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('picking goods', () => {
  it('builds a take from taps: three different, or the only one tapped twice', () => {
    let selection = tapGood(NOTHING, 0)
    selection = tapGood(selection, 0)
    expect(selection).toEqual({ kind: 'goods', goods: [0, 0] })
    expect(takeOf([0, 0])).toEqual({ type: 'double', good: 0 })
    selection = tapGood(selection, 2)
    expect(selection).toEqual({ kind: 'goods', goods: [2] })
    selection = tapGood(tapGood(tapGood(selection, 4), 1), 3)
    expect(selection).toEqual({ kind: 'goods', goods: [2, 4, 1] })
    expect(takeOf([2, 4, 1])).toEqual({ type: 'take', goods: [1, 2, 4] })
    expect(tapGood(selection, 4)).toEqual({ kind: 'goods', goods: [2, 1] })
    expect(tapGood({ kind: 'goods', goods: [3, 3] }, 3)).toEqual(NOTHING)
  })

  it('sends a take only once it is legal', () => {
    const state = start()
    const room = show(state, first(state))
    expect(screen.getByText('Your turn: take goods, or tap a card to buy or reserve.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pile-0'))
    fireEvent.click(screen.getByTestId('pile-4'))
    expect(button('Take')).toBeDisabled()
    expect(screen.getByText('Not a legal take yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pile-2'))
    fireEvent.click(button('Take'))
    expect(room.act).toHaveBeenCalledWith({ type: 'take', goods: [0, 2, 4] })
  })

  it('lets nobody else pick', () => {
    const state = start()
    const other = state.order[1]
    show(state, other)
    expect(screen.getByTestId('pile-0')).toBeDisabled()
    expect(screen.getByText(`${NAMES[first(state)]} is playing.`)).toBeInTheDocument()
  })
})

describe('cards', () => {
  it('reserves a card it cannot buy, and buys one it can', () => {
    const base = start()
    const id = base.market[0][0] as string
    const room = show(base, first(base))
    fireEvent.click(screen.getByTestId(`card-${id}`))
    expect(button('Buy')).toBeDisabled()
    fireEvent.click(button('Reserve'))
    expect(room.act).toHaveBeenCalledWith({ type: 'reserve', card: id })
  })

  it('buys a card when the tokens are there, showing what it costs after the cards', () => {
    const base = start()
    const id = base.market[0][0] as string
    const state = withMe(base, { tokens: [...cardOf(id).cost, 0] })
    const room = show(state, first(state))
    fireEvent.click(screen.getByTestId(`card-${id}`))
    expect(screen.getByText('You pay:')).toBeInTheDocument()
    fireEvent.click(button('Buy'))
    expect(room.act).toHaveBeenCalledWith({ type: 'buy', card: id })
  })

  it('shows a face-down reservation to its owner only', () => {
    const state = act(start(), { type: 'reserveTop', tier: 2 })
    const owner = state.order[0]
    const hidden = state.players[0].reserved[0].id
    show(state, owner)
    expect(screen.getByTestId(`reserved-${hidden}`)).toBeInTheDocument()
  })

  it('shows the others the back of it', () => {
    const state = act(start(), { type: 'reserveTop', tier: 2 })
    const owner = state.order[0]
    show(state, state.order[1])
    const rival = screen.getByTestId(`rival-${owner}`)
    expect(within(rival).getByRole('img', { name: 'Face down' })).toBeInTheDocument()
    expect(within(rival).getByText('1 reserved')).toBeInTheDocument()
  })
})

describe('over ten tokens', () => {
  it('asks for tokens back by tapping them', () => {
    const base = withMe(start(), { tokens: [2, 2, 2, 2, 2, 0] })
    const state = act(base, { type: 'take', goods: [0, 1, 2] })
    const room = show(state, first(state))
    expect(screen.getByText('You hold 13 tokens: tap your tokens to put 3 back.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('return-1'))
    expect(room.act).toHaveBeenCalledWith({ type: 'return', good: 1 })
    expect(screen.getByTestId('pile-0')).toBeDisabled()
  })
})

describe('a spectator', () => {
  it('sees the table, every seat as a rival, and no stock of their own', () => {
    const state = start()
    show(state, null)
    expect(screen.queryByTestId('my-stock')).toBeNull()
    expect(within(screen.getByTestId('rivals')).getAllByRole('listitem', { name: /^Tea:/ })).toHaveLength(3)
    expect(screen.getAllByText("You're watching this game.").length).toBeGreaterThan(0)
  })
})
