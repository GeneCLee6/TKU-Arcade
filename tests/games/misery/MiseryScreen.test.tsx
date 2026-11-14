import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { fits, misery } from '../../../shared/games/misery/rules.ts'
import type { MiseryAction, MiseryCard, MiseryOptions, MiseryState } from '../../../shared/games/misery/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import MiseryScreen from '../../../src/games/misery/MiseryScreen.tsx'
import { attemptText, gapText, miseryBand } from '../../../src/games/misery/screenState.ts'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy']
const OPTIONS: MiseryOptions = { target: 10, startCards: 3, steals: true, clock: 60 }

/** A start whose card on the table has a wrong gap in the first guesser's line */
function start(options: Partial<MiseryOptions> = {}): MiseryState {
  for (let seed = 1; ; seed++) {
    const state = misery.init(makeSeats(NAMES.length), { ...OPTIONS, ...options }, createRng(seed))
    if (gapsOf(state, false).length > 0) return state
  }
}

function act(state: MiseryState, action: MiseryAction, actor: Actor): MiseryState {
  const next = misery.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const lineOf = (state: MiseryState, seat: number) => state.lines.find((line) => line.seat === seat)?.cards ?? []

function gapsOf(state: MiseryState, right: boolean): number[] {
  const cards = lineOf(state, state.guesser)
  return Array.from({ length: cards.length + 1 }, (_, gap) => gap).filter(
    (gap) => fits(cards, gap, state.current as MiseryCard) === right,
  )
}

const projection = (state: MiseryState, seat: number | null): GameProjection => ({
  view: misery.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : misery.legalActions(state, seat)) as unknown as JsonValue[],
  over: misery.isOver(state),
  result: misery.isOver(state) ? misery.result(state) : null,
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
      room: { id: 'room', gameId: 'misery', status, options: {}, minPlayers: 2, maxSeats: 10 },
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
function show(state: MiseryState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], misery.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <MiseryScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('the card on the table', () => {
  it('shows everyone what happened, never its index', () => {
    const state = start()
    show(state, null)
    const table = screen.getByTestId('table-card')
    expect(within(table).getByTestId('table-title')).toHaveTextContent(state.current?.title as string)
    expect(within(table).getByRole('img', { name: 'Misery index hidden' })).toBeInTheDocument()
    expect(screen.queryByText(`Misery index ${state.current?.index}`)).toBeNull()
    expect(screen.getByText('The cards are in Chinese only for now.')).toBeInTheDocument()
  })

  it('gives the guesser a slot in every gap of their line, and sends the one they press', () => {
    const state = start()
    const room = show(state, state.guesser)
    expect(screen.getAllByText('Your card. Pick the gap in your line where it belongs.').length).toBeGreaterThan(0)
    const line = screen.getByTestId('your-line')
    expect(within(line).getAllByTestId(/^gap-/)).toHaveLength(4)
    const [first, , last] = lineOf(state, state.guesser)
    expect(within(line).getByRole('button', { name: `Put it below ${first.index}` })).toBeInTheDocument()
    expect(within(line).getByRole('button', { name: `Put it above ${last.index}` })).toBeInTheDocument()
    fireEvent.click(within(line).getByTestId('gap-2'))
    expect(room.act).toHaveBeenCalledWith({ type: 'place', gap: 2 })
  })

  it('gives the others no slots, and says who is placing', () => {
    const state = start()
    const other = (state.guesser + 1) % 3
    show(state, other)
    expect(screen.queryByTestId('gap-0')).toBeNull()
    expect(screen.getByText(`${NAMES[state.guesser]} is placing the card.`)).toBeInTheDocument()
  })

  it('turns to the next player as a steal after a wrong try, showing the try', () => {
    const state = start()
    const wrong = act(state, { type: 'place', gap: gapsOf(state, false)[0] }, state.guesser)
    show(wrong, wrong.guesser)
    expect(screen.getAllByText('Your chance to steal it. Pick the gap in your own line.').length).toBeGreaterThan(0)
    const table = screen.getByTestId('table-card')
    expect(within(table).getByText('Wrong')).toBeInTheDocument()
    expect(within(table).getByText(new RegExp(`^${NAMES[state.guesser]}: `))).toBeInTheDocument()
    expect(within(table).getByText(`Next to steal: ${NAMES[(wrong.guesser + 1) % 3]}`)).toBeInTheDocument()
  })
})

describe('the reveal', () => {
  it('shows the index, who kept the card, and the next player’s button', () => {
    const state = start()
    const kept = act(state, { type: 'place', gap: gapsOf(state, true)[0] }, state.guesser)
    const next = (state.turn + 1) % 3
    const room = show(kept, next)
    expect(screen.getByTestId('reveal-index')).toHaveTextContent(`Misery index ${state.current?.index}`)
    expect(screen.getByTestId('reveal-outcome')).toHaveTextContent(`${NAMES[state.guesser]} keeps it.`)
    fireEvent.click(screen.getByRole('button', { name: 'Draw a card' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'next' })
  })

  it('says when nobody got it', () => {
    let state = start({ steals: false })
    state = act(state, { type: 'place', gap: gapsOf(state, false)[0] }, state.guesser)
    show(state, state.turn)
    expect(screen.getByTestId('reveal-outcome')).toHaveTextContent('Nobody got it. Into the bin.')
    expect(screen.getByText('No steals')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draw a card' })).toBeNull()
  })
})

describe('everyone’s lines', () => {
  it('lists the other players with their counts', () => {
    const state = start()
    show(state, 0)
    const lines = screen.getByTestId('all-lines')
    expect(within(lines).getByText('Bo')).toBeInTheDocument()
    expect(within(lines).queryByText('Al')).toBeNull()
    expect(within(lines).getAllByText('3 / 10')).toHaveLength(2)
  })
})

describe('what the screen says', () => {
  it('words a try and a gap by the indexes either side', () => {
    expect(attemptText({ seat: 0, gap: 1, low: 12, high: 40, right: false }, 'Al')).toEqual({
      key: 'games.misery.ui.try.between',
      params: { name: 'Al', low: 12, high: 40 },
    })
    expect(attemptText({ seat: 0, gap: null, low: null, high: null, right: false }, 'Al').key).toBe(
      'games.misery.ui.try.none',
    )
    const cards = [{ id: 1, category: 'x', title: 'y', index: 30 }]
    expect(gapText(cards, 0)).toEqual({ key: 'games.misery.ui.gapBelow', params: { high: 30 } })
    expect(gapText(cards, 1)).toEqual({ key: 'games.misery.ui.gapAbove', params: { low: 30 } })
  })

  it('puts an index in one of five meter bands', () => {
    expect([1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(miseryBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})
