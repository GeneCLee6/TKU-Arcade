import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clueClash } from '../../../shared/games/clue-clash/rules.ts'
import type { CcAction, CcState } from '../../../shared/games/clue-clash/types.ts'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import ClueClashScreen from '../../../src/games/clue-clash/ClueClashScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy', 'Di']

const start = () => clueClash.init(makeSeats(NAMES.length), { clock: true }, createRng(5))

function act(state: CcState, action: CcAction, actor: Actor): CcState {
  const next = clueClash.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const giversOf = (state: CcState) => state.players.filter((seat) => seat !== state.guesser)

const projection = (state: CcState, seat: number | null): GameProjection => ({
  view: clueClash.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : clueClash.legalActions(state, seat)) as unknown as JsonValue[],
  over: clueClash.isOver(state),
  result: clueClash.isOver(state) ? clueClash.result(state) : null,
  chatLocked: clueClash.chatLocked?.(state) ?? false,
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
      room: { id: 'room', gameId: 'clue-clash', status, options: {}, minPlayers: 3, maxSeats: 7 },
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

function show(state: CcState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], clueClash.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <ClueClashScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('the clues', () => {
  it('shows a giver the word and a clue form', () => {
    const state = start()
    const room = show(state, giversOf(state)[0])
    expect(screen.getByTestId('mystery-word')).toHaveTextContent(state.word.word)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your clue' }), { target: { value: 'kiwi' } })
    fireEvent.click(within(screen.getByTestId('clue-form')).getByRole('button', { name: 'Send' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'clue', texts: ['kiwi'] })
  })

  it('warns a giver whose clue is the word', () => {
    const state = start()
    show(state, giversOf(state)[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Your clue' }), { target: { value: state.word.word } })
    expect(screen.getByRole('alert')).toHaveTextContent('Too close to the word itself.')
  })

  it('shows the guesser no word', () => {
    const state = start()
    show(state, state.guesser)
    expect(screen.queryByTestId('mystery-word')).toBeNull()
    expect(screen.queryByText(state.word.word)).toBeNull()
    expect(screen.getByTestId('guesser-note')).toHaveTextContent('You are guessing')
  })
})

describe('the review and the guess', () => {
  const reviewed = () => {
    let state = start()
    const [a, b, c] = giversOf(state)
    state = act(state, { type: 'clue', texts: ['kiwi'] }, a)
    state = act(state, { type: 'clue', texts: ['KIWI'] }, b)
    state = act(state, { type: 'clue', texts: ['oasis'] }, c)
    return state
  }

  it('strikes the clash and lets a giver cross out the rest', () => {
    const state = reviewed()
    const room = show(state, giversOf(state)[0])
    expect(screen.getAllByText('Clash')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Cross out' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'flag', index: 2, on: true })
  })

  it('shows the guesser only the clues left, and takes a guess', () => {
    let state = reviewed()
    for (const seat of giversOf(state)) state = act(state, { type: 'ready' }, seat)
    const room = show(state, state.guesser)
    const lines = screen.getAllByTestId('clue-line')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent('oasis')
    expect(screen.getByText('Cancelled: 2')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your guess' }), { target: { value: '沙漠' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guess' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'guess', text: '沙漠' })
  })

  it('reveals a wrong guess and lets a giver count it as right', () => {
    let state = reviewed()
    for (const seat of giversOf(state)) state = act(state, { type: 'ready' }, seat)
    state = act(state, { type: 'guess', text: 'kiwi' }, state.guesser)
    const room = show(state, giversOf(state)[0])
    expect(screen.getByTestId('cc-reveal')).toHaveTextContent('Not quite')
    expect(screen.getByTestId('mystery-word')).toHaveTextContent(state.word.word)
    fireEvent.click(screen.getByRole('button', { name: 'Count it as right' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'accept' })
  })
})
