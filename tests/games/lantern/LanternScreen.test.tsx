import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { lantern } from '../../../shared/games/lantern/rules.ts'
import type { LanternAction, LanternOptions, LanternState } from '../../../shared/games/lantern/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import LanternScreen from '../../../src/games/lantern/LanternScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']
const OPTIONS: LanternOptions = { lives: 0, levelTable: 'standard' }

const start = () => lantern.init(makeSeats(NAMES.length), OPTIONS, createRng(5))

function act(state: LanternState, action: LanternAction, actor: Actor): LanternState {
  const next = lantern.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

function withHands(hands: number[][], extra: Partial<LanternState> = {}): LanternState {
  const state = start()
  return {
    ...state,
    phase: 'play',
    level: 2,
    players: state.players.map((player, index) => ({ ...player, hand: hands[index], ready: true })),
    ...extra,
  }
}

const projection = (state: LanternState, seat: number | null): GameProjection => ({
  view: lantern.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : lantern.legalActions(state, seat)) as unknown as JsonValue[],
  over: lantern.isOver(state),
  result: lantern.isOver(state) ? lantern.result(state) : null,
  chatLocked: lantern.chatLocked?.(state) ?? false,
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
      room: { id: 'room', gameId: 'lantern', status, options: {}, minPlayers: 2, maxSeats: 6 },
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
function show(state: LanternState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], lantern.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <LanternScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('the focus', () => {
  it('asks for a hand up, and shows who has raised one', () => {
    const state = act(start(), { type: 'ready' }, 1)
    const room = show(state, 0)
    expect(screen.getByText('Level 1: focus')).toBeInTheDocument()
    expect(within(screen.getByTestId('seat-1')).getByText('Hand up')).toBeInTheDocument()
    expect(within(screen.getByTestId('seat-2')).getByText('Focusing')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No numbers out loud')
    fireEvent.click(screen.getByRole('button', { name: 'Hand up' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('tells a seat whose hand is up how many are still focusing', () => {
    show(act(start(), { type: 'ready' }, 1), 1)
    expect(screen.getByText('Waiting for 2 more to raise a hand.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hand up' })).toBeNull()
  })
})

describe('a level', () => {
  it('shows your own lanterns, everyone’s counts and one big button for your lowest', () => {
    const state = withHands([[8, 61], [22, 40], [90, 95]])
    const room = show(state, 0)
    const hand = within(screen.getByTestId('hand'))
    expect(hand.getAllByTestId('hand-lantern').map((item) => item.textContent)).toEqual(['8', '61'])
    expect(hand.getByText('lowest')).toBeInTheDocument()
    expect(screen.queryByText('22')).toBeNull()
    expect(within(screen.getByTestId('seat-1')).getByText('2 left')).toBeInTheDocument()
    expect(screen.getByText('Unlit: 6')).toBeInTheDocument()
    expect(screen.getByText('Matches: 3')).toBeInTheDocument()
    expect(screen.getByText('Clear it: +1 moonlight')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Light 8' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'light', card: 8 })
    // Waiting for the room's answer: no second lantern on a double tap
    expect(screen.getByRole('button', { name: 'Light 8' })).toBeDisabled()
  })

  it('shows the avenue and what an early lantern burned', () => {
    const state = act(withHands([[8, 61], [22, 40], [90, 95]]), { type: 'light', card: 22 }, 1)
    show(state, 2)
    expect(screen.getByTestId('top-lantern')).toHaveTextContent('22')
    expect(screen.getByLabelText('22, lit too early by Bo')).toBeInTheDocument()
    expect(screen.getByLabelText('8, burned in Al’s hand')).toBeInTheDocument()
    const news = screen.getByTestId('news')
    expect(news).toHaveTextContent('Bo lit 22 too early. One match gone.')
    expect(news).toHaveTextContent('Burned: 8 (Al).')
    expect(screen.getByText('Matches: 2')).toBeInTheDocument()
  })

  it('counts the moonlight votes, and lets a vote be taken back', () => {
    const state = act(withHands([[8, 61], [22, 40], [90, 95]]), { type: 'moon', on: true }, 1)
    const room = show(state, 1)
    expect(within(screen.getByTestId('seat-1')).getByText('Wants moonlight')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Take back moonlight 1/3' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'moon', on: false })
  })

  it('tells a seat with no lanterns left to wait', () => {
    show(withHands([[], [22, 40], [90, 95]], { moons: 0 }), 0)
    expect(screen.getByText('You are out of lanterns. Wait for the others.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Light/ })).toBeNull()
  })

  it('shows a spectator no lanterns', () => {
    show(withHands([[8, 61], [22, 40], [90, 95]]), null)
    expect(screen.getByText('You are watching: the lanterns stay hidden until the end.')).toBeInTheDocument()
    expect(screen.queryByTestId('hand-lantern')).toBeNull()
    expect(screen.queryByText('61')).toBeNull()
  })
})

describe('the end', () => {
  it('shows what was left, and an unranked result', () => {
    const state = act(withHands([[8, 61], [22, 40], [90, 95]], { lives: 1 }), { type: 'light', card: 90 }, 2)
    show(state, 0)
    expect(screen.getAllByText('Out of matches on level 2 of 10.').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('95 (Cy)')).toBeInTheDocument()
    expect(screen.queryByText('#1')).toBeNull()
  })
})
