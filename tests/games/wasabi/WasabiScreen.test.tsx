import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import { wasabi } from '../../../shared/games/wasabi/rules.ts'
import type { WasabiAction, WasabiDisc, WasabiState } from '../../../shared/games/wasabi/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import WasabiScreen from '../../../src/games/wasabi/WasabiScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']

function act(state: WasabiState, action: WasabiAction, actor: Actor): WasabiState {
  const next = wasabi.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

/** Seat 0 opens; each hides `opening[seat]` */
function opened(opening: WasabiDisc[]): WasabiState {
  let state: WasabiState = { ...wasabi.init(makeSeats(3), { goal: 2 }, createRng(1)), starter: 0, current: 0 }
  opening.forEach((disc, seat) => {
    state = act(state, { type: 'place', disc }, seat)
  })
  return state
}

const projection = (state: WasabiState, seat: number | null): GameProjection => ({
  view: wasabi.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : wasabi.legalActions(state, seat)) as unknown as JsonValue[],
  over: wasabi.isOver(state),
  result: wasabi.isOver(state) ? wasabi.result(state) : null,
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
      room: { id: 'room', gameId: 'wasabi', status, options: {}, minPlayers: 3, maxSeats: 6 },
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

function show(state: WasabiState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], wasabi.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <WasabiScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

const firstButton = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]

vi.setConfig({ testTimeout: 30_000 })
beforeAll(() => stubDialog())
beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('the opening', () => {
  it('asks everyone to hide one, plain or wasabi', () => {
    const state = wasabi.init(makeSeats(3), { goal: 2 }, createRng(1))
    const room = show(state, 1)
    expect(screen.getAllByText('Everyone hides one dumpling in their steamer.')[0]).toBeInTheDocument()
    fireEvent.click(firstButton('Hide the wasabi'))
    expect(room.act).toHaveBeenCalledWith({ type: 'place', disc: 'wasabi' })
  })
})

describe('the table', () => {
  it('shows your own steamer’s dumplings and only hidden ones of the others', () => {
    show(opened(['wasabi', 'plain', 'plain']), 0)
    expect(within(screen.getByTestId('steamer-0')).getByRole('img', { name: 'Wasabi dumpling' })).toBeInTheDocument()
    expect(within(screen.getByTestId('steamer-1')).getByRole('img', { name: 'Hidden dumpling' })).toBeInTheDocument()
    expect(within(screen.getByTestId('steamer-1')).queryByRole('img', { name: 'Plain dumpling' })).toBeNull()
  })

  it('bids from the ladder, and passes', () => {
    let state = opened(['plain', 'plain', 'plain'])
    const room = show(state, 0)
    fireEvent.click(within(screen.getByTestId('ladder')).getByRole('button', { name: 'Eat 2' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'bid', count: 2 })
    state = act(state, { type: 'bid', count: 2 }, 0)
    document.body.innerHTML = ''
    const next = show(state, 1)
    expect(within(screen.getByTestId('ladder')).getByRole('button', { name: 'Eat 2' })).toBeDisabled()
    expect(screen.getByText('Al can eat 2')).toBeInTheDocument()
    fireEvent.click(firstButton('I’m full'))
    expect(next.act).toHaveBeenCalledWith({ type: 'pass' })
  })

  it('eats from a steamer, and flips the dumpling face up for everyone', () => {
    let state = opened(['plain', 'plain', 'plain'])
    state = act(state, { type: 'bid', count: 2 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    const room = show(state, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Eat from Al' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'eat', seat: 0 })
    state = act(state, { type: 'eat', seat: 0 }, 0)
    document.body.innerHTML = ''
    show(state, 2)
    expect(within(screen.getByTestId('steamer-0')).getByRole('img', { name: 'Plain dumpling' })).toBeInTheDocument()
  })

  it('lets the wasabi’s owner take a dumpling blind', () => {
    let state = opened(['plain', 'wasabi', 'plain'])
    state = act(state, { type: 'bid', count: 2 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'eat', seat: 0 }, 0)
    state = act(state, { type: 'eat', seat: 1 }, 0)
    const room = show(state, 1)
    expect(screen.getAllByTestId('take')).toHaveLength(4)
    fireEvent.click(screen.getAllByTestId('take')[2])
    expect(room.act).toHaveBeenCalledWith({ type: 'take', index: 2 })
  })

  it('tells the bidder alone what they lost', () => {
    let state = opened(['wasabi', 'plain', 'plain'])
    state = act(state, { type: 'bid', count: 1 }, 0)
    state = act(state, { type: 'pass' }, 1)
    state = act(state, { type: 'pass' }, 2)
    state = act(state, { type: 'eat', seat: 0 }, 0)
    state = act(state, { type: 'discard', disc: 'plain' }, 0)
    show(state, 0)
    expect(screen.getByTestId('round-end')).toHaveTextContent('You lost a plain dumpling.')
    document.body.innerHTML = ''
    show(state, 1)
    expect(screen.getByTestId('round-end')).toHaveTextContent('Al bit their own wasabi and loses a dumpling.')
    expect(screen.getByTestId('round-end')).not.toHaveTextContent('You lost')
  })
})
