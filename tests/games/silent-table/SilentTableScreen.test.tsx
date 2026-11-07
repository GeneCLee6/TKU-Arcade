import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Reveal,
  SilentTableAction,
  SilentTablePlayerView,
  SilentTableView,
} from '../../../shared/games/silent-table/types.ts'
import type { GameProjection, GameResult } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import SilentTableScreen from '../../../src/games/silent-table/SilentTableScreen.tsx'
import { REVEAL_STEP_MS } from '../../../src/games/silent-table/useRevealPlayback.ts'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { stubDialog } from '../../lib/stubDialog.ts'

const member = (id: string, seat: number | null): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host: seat === 0,
  online: true,
  absent: false,
})

const player = (seat: number, over: Partial<SilentTablePlayerView> = {}): SilentTablePlayerView => ({
  seat,
  hole: seat === 0 ? ['As', 'Kh'] : null,
  chip: null,
  ready: false,
  movesLeft: 5,
  history: [],
  correctReads: 0,
  ...over,
})

const state = (over: Partial<SilentTableView> = {}): SilentTableView => ({
  players: [player(0), player(1), player(2)],
  community: ['2c', '7d', 'Ts'],
  phase: 'round',
  round: 1,
  level: 1,
  streak: 0,
  failures: 0,
  levelsToWin: 3,
  failureLimit: 3,
  allowTakeFromPlayers: true,
  spectatorsSeeAll: false,
  roundSeconds: 0,
  skin: 'plain',
  reveal: null,
  ending: null,
  you: 0,
  tableChips: [1, 2, 3],
  ...over,
})

const FREE: SilentTableAction[] = [
  { type: 'takeChip', chip: 1 },
  { type: 'takeChip', chip: 2 },
  { type: 'takeChip', chip: 3 },
]

const projection = (
  view: SilentTableView,
  legal: SilentTableAction[] = [],
  over: Partial<GameProjection> = {},
): GameProjection => ({
  view: view as unknown as JsonValue,
  legal,
  over: false,
  result: null,
  chatLocked: view.phase === 'round',
  ...over,
})

function parts(status: RoomStatus = 'playing', you = 'Al'): RoomParts {
  const members = [member('Al', 0), member('Bo', 1), member('Cy', 2), member('Di', null)]
  return {
    view: {
      room: { id: 'room', gameId: 'silent-table', status, options: {}, minPlayers: 3, maxSeats: 6 },
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

const screenOf = (room: RoomParts, game: GameProjection) => (
  <MemoryRouter>
    <ToastProvider>
      <SilentTableScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
    </ToastProvider>
  </MemoryRouter>
)

const chipButton = (name: string) => screen.getByRole('button', { name })
const readyButton = () => screen.getByRole('button', { name: 'Ready' })

const REVEAL: Reveal = {
  passed: false,
  seats: [
    {
      seat: 0,
      hand: 'pair',
      best: ['As', 'Ad', 'Ts', '7d', '2c'],
      chip: 1,
      lowestCorrectChip: 3,
      highestCorrectChip: 3,
      correct: false,
    },
    {
      seat: 1,
      hand: 'highCard',
      best: ['Kd', 'Ts', '9c', '7d', '2c'],
      chip: 2,
      lowestCorrectChip: 1,
      highestCorrectChip: 2,
      correct: true,
    },
    {
      seat: 2,
      hand: 'highCard',
      best: ['Kc', 'Ts', '9d', '7d', '2c'],
      chip: 3,
      lowestCorrectChip: 1,
      highestCorrectChip: 2,
      correct: false,
    },
  ],
}

const revealed = (over: Partial<SilentTableView> = {}) =>
  state({
    phase: 'reveal',
    round: 3,
    community: ['2c', '7d', 'Ts', '9h', '3s'],
    reveal: REVEAL,
    players: [
      player(0, { hole: ['As', 'Ad'], chip: 1 }),
      player(1, { hole: ['Kd', '9c'], chip: 2 }),
      player(2, { hole: ['Kc', '9d'], chip: 3 }),
    ],
    ...over,
  })

// The first test also pays for loading the screen, which goes past 5 s on a busy machine
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the table', () => {
  it('shows your own cards face up, the shared ones, and empty places for those to come', () => {
    render(screenOf(parts(), projection(state(), FREE)))
    const yours = screen.getByRole('group', { name: 'Your cards' })
    expect(within(yours).getByRole('img', { name: 'Ace of spades' })).toBeInTheDocument()
    expect(within(yours).getByRole('img', { name: 'King of hearts' })).toBeInTheDocument()
    const shared = screen.getByRole('group', { name: 'Shared cards' })
    expect(within(shared).getAllByRole('img')).toHaveLength(3)
    expect(within(shared).getByRole('img', { name: '10 of spades' })).toBeInTheDocument()
  })

  it('never shows a card for a seat whose view has none', () => {
    render(screenOf(parts(), projection(state(), FREE)))
    const seats = screen.getByRole('list', { name: 'The table' })
    expect(within(seats).getByText('Bo')).toBeInTheDocument()
    expect(within(seats).queryByRole('img')).toBeNull()
  })

  it('lists a spectator every seat with no way to take a chip or say ready', () => {
    render(screenOf(parts('playing', 'Di'), projection(state({ you: null }))))
    expect(screen.getByText("You're watching this game.")).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Your cards' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull()
    expect(chipButton('Chip 1: on the table')).toBeDisabled()
    const seats = screen.getByRole('list', { name: 'The table' })
    expect(within(seats).getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows a spectator the hands the view hands over', () => {
    const shown = state({
      you: null,
      players: [player(0), player(1, { hole: ['3d', '4d'] }), player(2, { hole: null })],
    })
    render(screenOf(parts('playing', 'Di'), projection(shown)))
    const seats = screen.getByRole('list', { name: 'The table' })
    expect(within(seats).getByRole('img', { name: '3 of diamonds' })).toBeInTheDocument()
  })

  it('says that talking is off only while chat is locked', () => {
    const { unmount } = render(screenOf(parts(), projection(state(), FREE)))
    expect(screen.getByText(/No talking now/)).toBeInTheDocument()
    unmount()
    render(screenOf(parts(), projection(revealed())))
    expect(screen.queryByText(/No talking now/)).toBeNull()
  })

  it('shows the level, the round and how far both ends of the game are', () => {
    render(screenOf(parts(), projection(state({ level: 4, round: 2, streak: 1, failures: 2 }), FREE)))
    expect(screen.getByText('Level 4')).toBeInTheDocument()
    expect(screen.getByText('Round 2/3')).toBeInTheDocument()
    expect(screen.getByText('In a row 1/3')).toBeInTheDocument()
    expect(screen.getByText('Failed 2/3')).toBeInTheDocument()
  })

  it('wears the theme chosen, in words too', () => {
    render(screenOf(parts(), projection(revealed({ skin: 'diving' }), [{ type: 'ready' }])))
    expect(screen.getByText('Under water, signals are all you have.')).toBeInTheDocument()
  })

  it('falls back to the plain table for a game from before skins', () => {
    const old = revealed()
    delete (old as Partial<SilentTableView>).skin
    render(screenOf(parts(), projection(old)))
    expect(screen.getByText('No words at this table.')).toBeInTheDocument()
  })
})

describe('the chips', () => {
  it('takes one off the table', () => {
    const room = parts()
    render(screenOf(room, projection(state(), FREE)))
    fireEvent.click(chipButton('Take chip 2'))
    expect(room.act).toHaveBeenCalledWith({ type: 'takeChip', chip: 2 })
  })

  it('takes one from another seat, by their name', () => {
    const room = parts()
    const view = state({ players: [player(0), player(1, { chip: 3 }), player(2)], tableChips: [1, 2] })
    const legal: SilentTableAction[] = [
      { type: 'takeChip', chip: 1 },
      { type: 'takeChip', chip: 2 },
      { type: 'takeFrom', seat: 1 },
    ]
    render(screenOf(room, projection(view, legal)))
    fireEvent.click(chipButton('Take chip 3 from Bo'))
    expect(room.act).toHaveBeenCalledWith({ type: 'takeFrom', seat: 1 })
  })

  it('goes by what the server allows: no legal action, nothing sent', () => {
    const room = parts()
    const view = state({ players: [player(0, { chip: 1, movesLeft: 0 }), player(1, { chip: 3 }), player(2)] })
    render(screenOf(room, projection(view, [{ type: 'ready' }])))
    const held = chipButton('Chip 3: Bo holds it')
    expect(held).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(held)
    fireEvent.click(chipButton('Chip 2: on the table'))
    fireEvent.click(chipButton('Chip 1: you hold it'))
    expect(room.act).not.toHaveBeenCalled()
    expect(screen.getByText('Moves left: 0')).toBeInTheDocument()
  })

  it('says it when someone takes your chip', () => {
    const before = state({ players: [player(0, { chip: 2 }), player(1), player(2)], tableChips: [1, 3] })
    const after = state({ players: [player(0), player(1, { chip: 2 }), player(2)], tableChips: [1, 3] })
    const room = parts()
    const { rerender } = render(screenOf(room, projection(before)))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    rerender(screenOf(room, projection(after, FREE)))
    expect(screen.getByRole('status')).toHaveTextContent('Bo took your chip 2. Take another.')
    expect(screen.getByText('Take a chip')).toBeInTheDocument()
  })

  it('shows the trail of chips from earlier rounds', () => {
    const view = state({ round: 3, players: [player(0, { history: [1, 2] }), player(1, { history: [3, 3] }), player(2)] })
    render(screenOf(parts(), projection(view, FREE)))
    expect(screen.getByText('Earlier: 1 → 2')).toBeInTheDocument()
    expect(screen.getByText(/Earlier: 3 → 3/)).toBeInTheDocument()
  })
})

describe('ready', () => {
  it('is held back without a chip, and sends once however often it is pressed', () => {
    const room = parts()
    const { rerender } = render(screenOf(room, projection(state(), FREE)))
    expect(readyButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(readyButton())
    expect(room.act).not.toHaveBeenCalled()

    const holding = state({ players: [player(0, { chip: 1 }), player(1), player(2)] })
    rerender(screenOf(room, projection(holding, [{ type: 'ready' }])))
    fireEvent.click(readyButton())
    fireEvent.click(readyButton())
    expect(room.act).toHaveBeenCalledTimes(1)
    expect(room.act).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('comes back if the room never answers', () => {
    vi.useFakeTimers()
    const room = parts()
    const holding = state({ players: [player(0, { chip: 1 }), player(1), player(2)] })
    render(screenOf(room, projection(holding, [{ type: 'ready' }])))
    fireEvent.click(readyButton())
    expect(readyButton()).toHaveAttribute('aria-disabled', 'true')
    act(() => void vi.advanceTimersByTime(4000))
    expect(readyButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('counts who is ready and says so in words', () => {
    const view = state({
      players: [player(0, { chip: 1, ready: true }), player(1, { chip: 2, ready: true }), player(2, { chip: 3 })],
    })
    render(screenOf(parts(), projection(view)))
    expect(screen.getByText('2 of 3 ready')).toBeInTheDocument()
    expect(screen.getByText('Waiting for the others')).toBeInTheDocument()
    expect(screen.getByText(/Chip 2 · Ready/)).toBeInTheDocument()
    expect(screen.getByText(/Chip 3 · Deciding/)).toBeInTheDocument()
  })
})

describe('the reveal', () => {
  /** From a round into a reveal, as it happens at the table */
  function playIntoReveal(view: SilentTableView, room = parts(), legal: SilentTableAction[] = [{ type: 'ready' }]) {
    const { rerender } = render(screenOf(room, projection(state(), FREE)))
    rerender(screenOf(room, projection(view, legal)))
    return { room, rerender }
  }

  const step = () => act(() => void vi.advanceTimersByTime(REVEAL_STEP_MS))

  it('turns the hands over one at a time, weakest first, and gives the verdict last', () => {
    vi.useFakeTimers()
    playIntoReveal(revealed())
    const panel = screen.getByRole('region', { name: 'The cards' })
    expect(within(panel).queryByText('Wrong', { exact: false })).toBeNull()
    expect(within(panel).queryByRole('img')).toBeNull()

    step()
    const rows = within(panel).getAllByRole('listitem')
    // The two tied hands come first, in seat order; the pair, the strongest, last
    expect(within(rows[0]).getByText('Bo')).toBeInTheDocument()
    expect(within(rows[0]).getByText('High card')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Al')).toBeInTheDocument()
    expect(within(rows[2]).queryByText('Pair')).toBeNull()
    expect(within(panel).getByRole('status')).toBeEmptyDOMElement()

    step()
    step()
    expect(within(rows[2]).getByText('Pair')).toBeInTheDocument()
    expect(within(panel).getByRole('status')).toHaveTextContent('Level failed')
  })

  it('marks what was wrong in words, with the chip needed and the chip held; ties get a range', () => {
    vi.useFakeTimers()
    playIntoReveal(revealed())
    for (let index = 0; index < 3; index++) step()
    const rows = within(screen.getByRole('region', { name: 'The cards' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('✓ Right')
    expect(rows[0]).toHaveTextContent('Needed 1 to 2')
    expect(rows[0]).toHaveTextContent('Held 2')
    expect(rows[1]).toHaveTextContent('✕ Wrong')
    expect(rows[1]).toHaveTextContent('Needed 1 to 2')
    expect(rows[1]).toHaveTextContent('Held 3')
    expect(rows[2]).toHaveTextContent('✕ Wrong')
    expect(rows[2]).toHaveTextContent('Needed 3')
    expect(rows[2]).toHaveTextContent('Held 1')
  })

  it('does not play again for someone who comes back to it', () => {
    render(screenOf(parts(), projection(revealed(), [{ type: 'ready' }])))
    expect(screen.getByRole('region', { name: 'The cards' })).toHaveTextContent('Level failed')
  })

  it('shows it all at once to someone who asked for less motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    playIntoReveal(revealed())
    expect(screen.getByRole('region', { name: 'The cards' })).toHaveTextContent('Level failed')
  })

  it('asks for the next level once the hands are all up', () => {
    vi.useFakeTimers()
    const { room } = playIntoReveal(revealed())
    const next = screen.getByRole('button', { name: 'Next level' })
    expect(next).toHaveAttribute('aria-disabled', 'true')
    for (let index = 0; index < 3; index++) step()
    expect(next).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(next)
    expect(room.act).toHaveBeenCalledWith({ type: 'ready' })
    expect(screen.queryByRole('group', { name: 'Rank chips' })).toBeNull()
  })
})

describe('the result', () => {
  const result: GameResult = {
    summary: { key: 'games.silent-table.result.won', params: { levels: 3, failures: 1 } },
    standings: [0, 1, 2].map((seat) => ({
      seat,
      rank: 1,
      score: null,
      note: { key: 'games.silent-table.note.reads', params: { reads: 2, levels: 4 } },
    })),
  }

  const ended = revealed({ phase: 'over', ending: 'won', reveal: { ...REVEAL, passed: true } })
  const final = projection(ended, [], { over: true, result, chatLocked: false })

  it('says who won in words, with no places or scores for a table that shares one fate', () => {
    render(screenOf(parts('ended'), final))
    const panel = screen.getByRole('region', { name: 'Results' })
    expect(within(panel).getByText('The table wins')).toBeInTheDocument()
    expect(within(panel).getByText('The table wins: 3 in a row, 1 failed on the way.')).toBeInTheDocument()
    expect(within(panel).getAllByText('Levels read right: 2 of 4.')).toHaveLength(3)
    expect(within(panel).queryByText('1st')).toBeNull()
    expect(within(panel).queryByText(/Score/)).toBeNull()
  })

  it('waits for the last hand to turn over', () => {
    vi.useFakeTimers()
    const room = parts('ended')
    const { rerender } = render(screenOf(room, projection(state(), FREE)))
    rerender(screenOf(room, final))
    expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
    for (let index = 0; index < 3; index++) {
      act(() => void vi.advanceTimersByTime(REVEAL_STEP_MS))
    }
    expect(screen.getByRole('region', { name: 'Results' })).toBeInTheDocument()
  })

  it('says the table lost when it did', () => {
    const lost = revealed({ phase: 'over', ending: 'lost' })
    render(screenOf(parts('ended'), projection(lost, [], { over: true, result, chatLocked: false })))
    expect(within(screen.getByRole('region', { name: 'Results' })).getByText('The table loses')).toBeInTheDocument()
  })
})
