import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { oddWord, wordOf } from '../../../shared/games/odd-word/rules.ts'
import type { OddWordAction, OddWordOptions, OddWordState } from '../../../shared/games/odd-word/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import OddWordScreen from '../../../src/games/odd-word/OddWordScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy', 'Di', 'Ed']
const OPTIONS: OddWordOptions = { undercovers: 0, blank: false, rounds: 2 }

const start = (options: Partial<OddWordOptions> = {}) =>
  oddWord.init(makeSeats(NAMES.length), { ...OPTIONS, ...options }, createRng(5))

function act(state: OddWordState, action: OddWordAction, actor: Actor): OddWordState {
  const next = oddWord.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const projection = (state: OddWordState, seat: number | null): GameProjection => ({
  view: oddWord.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : oddWord.legalActions(state, seat)) as unknown as JsonValue[],
  over: oddWord.isOver(state),
  result: oddWord.isOver(state) ? oddWord.result(state) : null,
  chatLocked: oddWord.chatLocked?.(state) ?? false,
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
      room: { id: 'room', gameId: 'odd-word', status, options: {}, minPlayers: 3, maxSeats: 12 },
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
function show(state: OddWordState, seat: number | null) {
  const room = parts(seat === null ? 'Zoe' : NAMES[seat], oddWord.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <OddWordScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return room
}

const buttonNamed = (name: string | RegExp) => screen.getByRole('button', { name })
const notHost = (state: OddWordState) => state.players.find((seat) => seat !== state.host) as number

vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => stubDialog())

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('the word', () => {
  it('shows each seat its own word, big, and nothing of the other', () => {
    const state = start()
    const odd = state.undercover[0]
    show(state, odd)
    expect(screen.getByTestId('word')).toHaveTextContent(state.pair.odd)
    expect(screen.queryByText(state.pair.common)).toBeNull()
    expect(screen.getByText('Odd ones out this round: 1')).toBeInTheDocument()
  })

  it('shows the blank that they have no word', () => {
    const state = start({ blank: true })
    show(state, state.blank)
    expect(screen.getByTestId('word')).toHaveTextContent('No word')
    expect(screen.getByText(/You are the blank/)).toBeInTheDocument()
    expect(screen.getByText('One of them has no word')).toBeInTheDocument()
  })

  it('shows a spectator no word', () => {
    const state = start()
    show(state, null)
    expect(screen.queryByTestId('word')).toBeNull()
    expect(screen.getByText('The words stay hidden until the reveal.')).toBeInTheDocument()
  })

  it('covers the word with a tap, and shows it again', () => {
    const state = start()
    const seat = notHost(state)
    show(state, seat)
    fireEvent.click(screen.getByTestId('word'))
    expect(screen.queryByTestId('word')).toBeNull()
    expect(screen.getByTestId('word-covered')).toHaveTextContent(/Word covered/)
    fireEvent.click(buttonNamed('Show my word'))
    expect(screen.getByTestId('word')).toHaveTextContent(wordOf(state, seat) as string)
  })
})

describe('the round host', () => {
  it('speaks first, and alone can reveal or deal new words', () => {
    const state = start()
    const room = show(state, state.host)
    const order = within(screen.getByTestId('speaking-order')).getAllByRole('listitem')
    expect(order).toHaveLength(NAMES.length)
    expect(order[0]).toHaveTextContent(`${NAMES[state.host]}`)
    expect(order[0]).toHaveTextContent('First · runs the round')
    expect(screen.getByText('You speak first. Reveal once everyone has described.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Chat is closed until the reveal')
    fireEvent.click(buttonNamed('New words'))
    expect(room.act).toHaveBeenCalledWith({ type: 'redeal' })
  })

  it('reveals for everyone; the others wait', () => {
    const state = start()
    const room = show(state, state.host)
    fireEvent.click(buttonNamed('Reveal'))
    expect(room.act).toHaveBeenCalledWith({ type: 'reveal' })
  })

  it('gives the others nothing to press', () => {
    const state = start()
    show(state, notHost(state))
    expect(screen.getByText(`${NAMES[state.host]} speaks first and reveals the words.`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New words' })).toBeNull()
  })
})

describe('the reveal', () => {
  it('shows both words, who was odd, and everyone’s word', () => {
    const state = act(start(), { type: 'reveal' }, start().host)
    const room = show(state, state.host)
    const reveal = screen.getByTestId('round-reveal')
    expect(within(reveal).getByTestId('common-word')).toHaveTextContent(state.pair.common)
    expect(within(reveal).getByTestId('odd-word')).toHaveTextContent(state.pair.odd)
    expect(within(reveal).getByTestId('odd-were')).toHaveTextContent(`Odd ones out: ${NAMES[state.undercover[0]]}`)
    expect(within(reveal).getAllByText('Odd one out')).toHaveLength(1)
    expect(screen.queryByTestId('word-card')).toBeNull()
    fireEvent.click(buttonNamed('Next round'))
    expect(room.act).toHaveBeenCalledWith({ type: 'next' })
  })

  it('ends with an unranked result after the last round', () => {
    let state = start()
    state = act(act(state, { type: 'reveal' }, state.host), { type: 'next' }, state.host)
    state = act(state, { type: 'reveal' }, state.host)
    show(state, 0)
    expect(screen.getAllByText('2 rounds played.').length).toBeGreaterThan(0)
    expect(screen.queryByText('#1')).toBeNull()
  })
})
