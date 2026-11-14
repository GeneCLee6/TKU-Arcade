import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import { wordBridge } from '../../../shared/games/word-bridge/rules.ts'
import type { WbAction, WbDuoState, WbOptions, WbState, WbTeamsState } from '../../../shared/games/word-bridge/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import WordBridgeScreen from '../../../src/games/word-bridge/WordBridgeScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy', 'Di']
const OPTIONS: WbOptions = { mode: 'auto', clock: 0, turns: 10 }

const start = (seats = NAMES.length) => wordBridge.init(makeSeats(seats), OPTIONS, createRng(5))

function act<S extends WbState>(state: S, action: WbAction, actor: Actor): S {
  const next = wordBridge.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next as S
}

const projection = (state: WbState, seat: number | null): GameProjection => ({
  view: wordBridge.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : wordBridge.legalActions(state, seat)) as unknown as JsonValue[],
  over: wordBridge.isOver(state),
  result: wordBridge.isOver(state) ? wordBridge.result(state) : null,
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
      room: { id: 'room', gameId: 'word-bridge', status, options: {}, minPlayers: 2, maxSeats: 10 },
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

function show(state: WbState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], state.players.length, wordBridge.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <WordBridgeScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('setup', () => {
  it('shows both partnerships with their callers and lets you move or deal', () => {
    const room = show(start(), 2)
    const ns = screen.getByTestId('team-ns')
    expect(within(ns).getByText('Al')).toBeInTheDocument()
    expect(within(ns).getAllByText('Caller')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Deal the words' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Join East–West' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'join', team: 'ew' })
    // Waiting for the room's answer, nothing else can be pressed twice
    expect(screen.getByRole('button', { name: 'Deal the words' })).toBeDisabled()
  })

  it('lets three choose the key holders', () => {
    show(start(3), 2)
    expect(screen.getByTestId('wb-setup')).toHaveTextContent('Key holders')
    expect(screen.getAllByRole('button', { name: 'Hold this side' })).toHaveLength(2)
  })
})

describe('the team game', () => {
  const dealt = () => act(start() as WbTeamsState, { type: 'begin' }, 0)

  it('shows the caller the key and a clue form; partners see plain words', () => {
    const state = dealt()
    const giver = state.givers[state.active] as number
    const room = show(state, giver)
    const cells = screen.getAllByTestId('word-cell')
    expect(cells).toHaveLength(25)
    expect(cells.filter((cell) => cell.dataset.hint === 'mine')).toHaveLength(1)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your clue' }), { target: { value: 'kiwi' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'How many words' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Give the clue' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'clue', text: 'kiwi', count: 2 })
  })

  it('warns the caller of a clue on the grid before sending', () => {
    const state = dealt()
    show(state, state.givers[state.active] as number)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your clue' }), { target: { value: state.words[3] } })
    expect(screen.getByRole('alert')).toHaveTextContent(`Too close to “${state.words[3]}”`)
    expect(screen.getByRole('button', { name: 'Give the clue' })).toBeDisabled()
  })

  it('lets a partner select a word, then turn it from the dock', () => {
    let state = dealt()
    const giver = state.givers[state.active] as number
    state = act(state, { type: 'clue', text: 'kiwi', count: 1 }, giver)
    const picker = state.teams[state.active].find((seat) => seat !== giver) as number
    const room = show(state, picker)
    expect(screen.getByTestId('clue-banner')).toHaveTextContent('kiwi')
    expect(screen.getAllByTestId('word-cell').every((cell) => cell.dataset.hint === undefined)).toBe(true)
    fireEvent.click(screen.getAllByTestId('word-cell')[4])
    fireEvent.click(screen.getByRole('button', { name: `Turn “${state.words[4]}”` }))
    expect(room.act).toHaveBeenCalledWith({ type: 'pick', index: 4 })
  })
})

describe('co-op', () => {
  it('shows a key holder their side and the clues left', () => {
    const state = start(2) as WbDuoState
    show(state, state.holders[0])
    expect(screen.getByTestId('wb-score')).toHaveTextContent('To find: 15')
    expect(screen.getByTestId('wb-score')).toHaveTextContent('Clues left: 10')
    const hints = screen.getAllByTestId('word-cell').map((cell) => cell.dataset.hint)
    expect(hints.filter((hint) => hint === 'target')).toHaveLength(9)
    expect(hints.filter((hint) => hint === 'mine')).toHaveLength(3)
  })
})
