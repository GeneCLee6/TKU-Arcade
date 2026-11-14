import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { tiles } from '../../../shared/games/tiles/rules.ts'
import type { TileId, TilesAction, TilesState } from '../../../shared/games/tiles/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import TilesScreen from '../../../src/games/tiles/TilesScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']
const T = (suit: number, number: number, copy = 0): TileId => suit * 26 + (number - 1) * 2 + copy

/** Seat 0's turn, with these racks and table */
function setUp(parts: Partial<TilesState> & { racks: TileId[][] }): TilesState {
  const base = tiles.init(makeSeats(parts.racks.length), { clock: 90, rounds: 1 }, createRng(5))
  return { ...base, turn: 0, table: [], draft: null, pool: [T(3, 13)], melded: parts.racks.map(() => false), ...parts }
}

function act(state: TilesState, action: TilesAction, actor: Actor): TilesState {
  const next = tiles.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const projection = (state: TilesState, seat: number | null): GameProjection => ({
  view: tiles.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : tiles.legalActions(state, seat)) as unknown as JsonValue[],
  over: tiles.isOver(state),
  result: tiles.isOver(state) ? tiles.result(state) : null,
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

function parts(you: string, seats: number, status: RoomStatus = 'playing'): RoomParts {
  const members = [...NAMES.slice(0, seats).map((name, seat) => member(name, seat)), member('Zoe', null)]
  return {
    view: {
      room: { id: 'room', gameId: 'tiles', status, options: {}, minPlayers: 2, maxSeats: 4 },
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

function show(state: TilesState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], state.players.length, tiles.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <TilesScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

const rack = () => within(screen.getByTestId('rack'))
const tileButton = (name: string) => rack().getByRole('button', { name })
const rackTiles = () => rack().getAllByRole('button').filter((button) => button.hasAttribute('data-tile'))

vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('your turn', () => {
  const racks = [
    [T(0, 10), T(1, 10), T(2, 10), T(3, 2), 104],
    [T(1, 1), T(1, 2)],
  ]

  it('shows your rack, sorted, and asks for the first play', () => {
    show(setUp({ racks }), 0)
    expect(screen.getByText('Your turn. Your first play must be 30 points from your rack alone.')).toBeInTheDocument()
    expect(screen.getByText('First play: 0 of 30 points')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    expect(rackTiles().map((button) => button.getAttribute('aria-label'))).toEqual([
      '2 of clubs',
      '10 of spades',
      '10 of hearts',
      '10 of diamonds',
      'Wildcard',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'By suit' }))
    expect(rackTiles()[0]).toHaveAccessibleName('10 of spades')
  })

  it('puts selected tiles in a new set and sends the draft, then Done sends the table', () => {
    const room = show(setUp({ racks }), 0)
    fireEvent.click(tileButton('10 of spades'))
    fireEvent.click(tileButton('10 of hearts'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('new-set'))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'arrange', sets: [[T(0, 10), T(1, 10)]] })
    const set = screen.getByRole('group', { name: 'Set 1, not a group or a run yet' })
    expect(within(set).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Every set must be a group or a run.')).toBeInTheDocument()

    fireEvent.click(tileButton('10 of diamonds'))
    fireEvent.click(screen.getByRole('button', { name: 'Put the selected tiles in set 1' }))
    expect(screen.getByRole('group', { name: 'Set 1' })).toBeInTheDocument()
    expect(screen.getByText('First play: 30 of 30 points')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'commit', sets: [[T(0, 10), T(1, 10), T(2, 10)]] })
  })

  it('undoes one move at a time, and resets the turn', () => {
    const room = show(setUp({ racks }), 0)
    fireEvent.click(tileButton('10 of spades'))
    fireEvent.click(screen.getByTestId('new-set'))
    fireEvent.click(tileButton('10 of hearts'))
    fireEvent.click(screen.getByRole('button', { name: 'Put the selected tiles in set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'arrange', sets: [[T(0, 10)]] })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'reset' })
    expect(screen.queryByTestId('table-set')).toBeNull()
    fireEvent.click(tileButton('10 of spades'))
    fireEvent.click(screen.getByTestId('new-set'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset turn' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'reset' })
    expect(rackTiles()).toHaveLength(5)
  })

  it('sends a tile laid this turn back to the rack', () => {
    const room = show(setUp({ racks }), 0)
    fireEvent.click(tileButton('2 of clubs'))
    fireEvent.click(screen.getByTestId('new-set'))
    fireEvent.click(within(screen.getByTestId('table')).getByRole('button', { name: '2 of clubs, just laid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to rack' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'reset' })
  })

  it('keeps the table’s sets out of reach before the first play', () => {
    show(setUp({ racks, table: [[T(1, 4), T(1, 5), T(1, 6)]] }), 0)
    const set = screen.getByRole('group', { name: 'Set 1' })
    expect(within(set).queryAllByRole('button')).toHaveLength(0)
    fireEvent.click(tileButton('2 of clubs'))
    expect(screen.queryByRole('button', { name: 'Put the selected tiles in set 1' })).toBeNull()
  })

  it('lets you pick up table tiles once you have opened', () => {
    show(setUp({ racks, table: [[T(1, 4), T(1, 5), T(1, 6)]], melded: [true, false] }), 0)
    const set = screen.getByRole('group', { name: 'Set 1' })
    expect(within(set).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByText(/First play/)).toBeNull()
  })

  it('draws', () => {
    const room = show(setUp({ racks }), 0)
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'draw' })
  })

  it('says Pass when the pool is empty', () => {
    show(setUp({ racks, pool: [] }), 0)
    expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument()
    expect(screen.getByText('Pool empty: passes in a row 0 of 2')).toBeInTheDocument()
  })
})

describe('watching', () => {
  const racks = [
    [T(0, 10), T(1, 10), T(2, 10)],
    [T(1, 1), T(1, 2)],
    [T(2, 1)],
  ]

  it('shows the others the draft as it happens, the new tiles marked', () => {
    const state = act(setUp({ racks }), { type: 'arrange', sets: [[T(0, 10), T(1, 10)]] }, 0)
    show(state, 1)
    expect(screen.getByText('Al is moving tiles.')).toBeInTheDocument()
    const table = within(screen.getByTestId('table'))
    expect(table.getByRole('img', { name: '10 of spades, just laid' })).toBeInTheDocument()
    expect(screen.getByTestId('table-set')).toHaveAttribute('data-valid', 'false')
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(rackTiles()).toHaveLength(0)
    expect(rack().getAllByRole('img')).toHaveLength(2)
  })

  it('shows a spectator the counts of tiles, never a rack', () => {
    show(setUp({ racks }), null)
    expect(screen.queryByTestId('rack')).toBeNull()
    expect(screen.getAllByText('3 tiles').length).toBeGreaterThan(0)
    expect(screen.getByText('Al’s turn.')).toBeInTheDocument()
  })

  it('says what the last player did', () => {
    const state = act(setUp({ racks }), { type: 'draw' }, 0)
    show(state, 2)
    expect(screen.getByTestId('event')).toHaveTextContent('Al drew a tile.')
  })
})

describe('between rounds', () => {
  it('shows every rack and the score, and anyone can deal the next round', () => {
    const state = setUp({
      racks: [[T(0, 4), T(0, 5), T(0, 6)], [T(1, 13), 104]],
      table: [[T(3, 7), T(3, 8), T(3, 9)]],
      melded: [true, true],
      totalRounds: 2,
    })
    const scored = act(state, { type: 'commit', sets: [...state.table, [T(0, 4), T(0, 5), T(0, 6)]] }, 0)
    const room = show(scored, 1)
    expect(screen.getByText('Al emptied their rack.')).toBeInTheDocument()
    const rows = screen.getAllByTestId('score-row')
    expect(rows[0]).toHaveTextContent('+43 this round')
    expect(rows[1]).toHaveTextContent('Rack: 43 points')
    expect(within(rows[1]).getByRole('img', { name: 'Wildcard' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }))
    expect(room.act).toHaveBeenLastCalledWith({ type: 'next' })
  })
})
