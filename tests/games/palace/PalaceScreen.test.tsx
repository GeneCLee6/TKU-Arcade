import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { palace } from '../../../shared/games/palace/rules.ts'
import type { PalaceAction, PalaceRole, PalaceState } from '../../../shared/games/palace/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import PalaceScreen from '../../../src/games/palace/PalaceScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']

function rigged(hands: PalaceRole[][], turn = 0): PalaceState {
  const base = palace.init(makeSeats(hands.length), { window: 15 }, createRng(1))
  return {
    ...base,
    turn,
    players: base.players.map((player, seat) => ({
      ...player,
      silver: 2,
      hidden: hands[seat].map((role, index) => ({ id: `card-s${seat}-${index}`, role })),
    })),
    log: [{ k: 'start', seat: turn }],
  }
}

const HANDS: PalaceRole[][] = [
  ['treasurer', 'guard'],
  ['dowager', 'eunuch'],
  ['strategist', 'eunuch'],
]

function act(state: PalaceState, action: PalaceAction, actor: Actor): PalaceState {
  const next = palace.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const projection = (state: PalaceState, seat: number | null): GameProjection => ({
  view: palace.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : palace.legalActions(state, seat)) as unknown as JsonValue[],
  over: palace.isOver(state),
  result: palace.isOver(state) ? palace.result(state) : null,
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
      room: { id: 'room', gameId: 'palace', status, options: {}, minPlayers: 2, maxSeats: 6 },
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
function show(state: PalaceState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], palace.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <PalaceScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('your cards and the court', () => {
  it('shows your own backers and only card backs of everyone else', () => {
    show(rigged(HANDS), 1)
    const hand = screen.getByTestId('hand')
    expect(within(hand).getByText('Empress Dowager')).toBeInTheDocument()
    expect(within(hand).getByText('Chief Eunuch')).toBeInTheDocument()
    const court = screen.getByTestId('court')
    expect(within(court).queryByText('Treasurer')).toBeNull()
    expect(within(court).getAllByText('2 face down')).toHaveLength(3)
    expect(screen.getByTestId('silver-0')).toHaveTextContent('2 silver')
  })

  it('shows a spectator no cards at all', () => {
    show(rigged(HANDS), null)
    expect(screen.queryByTestId('hand')).toBeNull()
    expect(screen.getByText('Everyone’s backers stay face down until they are lost.')).toBeInTheDocument()
    expect(screen.queryByText('Treasurer')).toBeNull()
  })
})

describe('your turn', () => {
  it('lists the actions, marks a bluff, and asks for a target', () => {
    const room = show(rigged(HANDS), 0)
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('Your turn: pick an action.')
    const picker = screen.getByTestId('action-picker')
    const levy = within(picker).getByRole('button', { name: /Levy/ })
    expect(levy).not.toHaveTextContent('Bluff')
    expect(within(picker).getByRole('button', { name: /Extort/ })).toHaveTextContent('Bluff')
    // Arrest needs 3 silver
    expect(within(picker).queryByRole('button', { name: /Arrest/ })).toBeNull()
    fireEvent.click(levy)
    expect(room.act).toHaveBeenCalledWith({ type: 'act', act: 'levy', target: null })
  })

  it('sends a targeted action once a target is picked', () => {
    const room = show(rigged(HANDS), 0)
    fireEvent.click(within(screen.getByTestId('action-picker')).getByRole('button', { name: /Extort/ }))
    expect(screen.getByText('Against whom?')).toBeInTheDocument()
    fireEvent.click(buttonNamed('Cy'))
    expect(room.act).toHaveBeenCalledWith({ type: 'act', act: 'extort', target: 2 })
  })

  it('shows somebody else’s turn as a line in the dock', () => {
    show(rigged(HANDS), 2)
    expect(screen.queryByTestId('action-picker')).toBeNull()
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('Al is picking an action.')
  })
})

describe('the windows', () => {
  it('asks the others to challenge a claim, with the claim on the table and in the log', () => {
    const state = act(rigged(HANDS), { type: 'act', act: 'levy', target: null }, 0)
    const room = show(state, 1)
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('Al claims the Treasurer. Challenge, or let it pass?')
    expect(screen.getByTestId('now')).toHaveTextContent('Claims Treasurer')
    expect(screen.getByTestId('action-log')).toHaveTextContent('Al claims the Treasurer and levies taxes.')
    fireEvent.click(buttonNamed('Challenge'))
    expect(room.act).toHaveBeenCalledWith({ type: 'challenge' })
  })

  it('tells whoever passed that they are waiting', () => {
    const state = act(act(rigged(HANDS), { type: 'act', act: 'levy', target: null }, 0), { type: 'pass' }, 1)
    show(state, 1)
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('You let it pass. Waiting for the others.')
    expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull()
  })

  it('offers the target a block, marked as a bluff when they do not hold the role', () => {
    let state = act(rigged(HANDS), { type: 'act', act: 'extort', target: 1 }, 0)
    state = act(act(state, { type: 'pass' }, 1), { type: 'pass' }, 2)
    const room = show(state, 1)
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('Block Al’s Extort?')
    expect(buttonNamed('Block as Chief Eunuch')).toBeInTheDocument()
    fireEvent.click(buttonNamed('Block as Strategist · Bluff'))
    expect(room.act).toHaveBeenCalledWith({ type: 'block', role: 'strategist' })
  })
})

describe('choosing cards', () => {
  it('lets you pick which backer to lose', () => {
    const state = act(act(rigged(HANDS), { type: 'act', act: 'levy', target: null }, 0), { type: 'challenge' }, 1)
    const room = show(state, 1)
    expect(screen.getByTestId('palace-prompt')).toHaveTextContent('You lose a backer: pick which one to turn face up.')
    fireEvent.click(buttonNamed('Chief Eunuch'))
    expect(room.act).toHaveBeenCalledWith({ type: 'lose', card: 'card-s1-1' })
  })

  it('lets a schemer keep two of four', () => {
    let state = act(rigged(HANDS, 2), { type: 'act', act: 'scheme', target: null }, 2)
    state = act(act(state, { type: 'pass' }, 0), { type: 'pass' }, 1)
    const room = show(state, 2)
    const cards = screen.getAllByTestId('keep-card')
    expect(cards).toHaveLength(4)
    const keep = buttonNamed('Keep these')
    expect(keep).toBeDisabled()
    fireEvent.click(cards[0])
    fireEvent.click(cards[3])
    expect(keep).toBeEnabled()
    fireEvent.click(keep)
    const drawn = state.phase.kind === 'exchange' ? state.phase.drawn : []
    expect(room.act).toHaveBeenCalledWith({ type: 'keep', cards: ['card-s2-0', drawn[1].id] })
  })
})

describe('in Chinese', () => {
  it('names the roles and the log in Chinese', () => {
    setLanguage('zh-TW')
    const state = act(rigged(HANDS), { type: 'act', act: 'levy', target: null }, 0)
    show(state, 1)
    expect(screen.getByTestId('action-log')).toHaveTextContent('Al 自稱戶部尚書，徵稅。')
    expect(within(screen.getByTestId('hand')).getByText('太后')).toBeInTheDocument()
  })
})
