import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { bluff } from '../../../shared/games/bluff/rules.ts'
import type { BluffAction, BluffOptions, BluffState } from '../../../shared/games/bluff/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import BluffScreen from '../../../src/games/bluff/BluffScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy', 'Di']
const OPTIONS: BluffOptions = { twoRounds: false, readSeconds: 60, mole: true, hints: true, clock: true }

const start = (options: Partial<BluffOptions> = {}, players = 4) =>
  bluff.init(makeSeats(players), { ...OPTIONS, ...options }, createRng(7))

function act(state: BluffState, action: BluffAction, actor: Actor): BluffState {
  const next = bluff.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

/** Every reading done: the vote is open */
const toVote = (state: BluffState) =>
  state.order.reduce((current) => act(current, { type: 'doneReading' }, current.judge), act(state, { type: 'startReading' }, state.judge))

/** Everyone keeps their sticker and the judge votes for `vote` */
const revealed = (state: BluffState, vote: number) => {
  const voting = toVote(state)
  const kept = voting.order.reduce((current, seat) => act(current, { type: 'sticker', seat: null }, seat), voting)
  return act(kept, { type: 'vote', seat: vote }, voting.judge)
}

const projection = (state: BluffState, seat: number | null): GameProjection => ({
  view: bluff.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : bluff.legalActions(state, seat)) as unknown as JsonValue[],
  over: bluff.isOver(state),
  result: bluff.isOver(state) ? bluff.result(state) : null,
  chatLocked: bluff.chatLocked?.(state) ?? false,
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
  const members = [...NAMES.map((name, seat) => member(name, seat)), member('Ed', null)]
  return {
    view: {
      room: { id: 'room', gameId: 'bluff', status, options: {}, minPlayers: 3, maxSeats: 9 },
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

/** The screen as `seat` sees `state` (null: the spectator Ed) */
function show(state: BluffState, seat: number | null) {
  const room = parts(seat === null ? 'Ed' : NAMES[seat], bluff.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <BluffScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('the cards', () => {
  it('gives the honest reader the term and the real meaning, and nothing of the others', () => {
    const state = start()
    show(state, state.honest)
    const card = screen.getByTestId('role-card')
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(state.term.term)
    expect(within(card).getByTestId('role')).toHaveTextContent('You are the honest reader')
    expect(within(card).getByTestId('explanation')).toHaveTextContent(state.term.explanation)
    expect(within(card).queryByTestId('hint')).toBeNull()
    expect(within(card).queryByTestId('words')).toBeNull()
  })

  it('gives the mole three secret words, and never the meaning', () => {
    const state = start()
    expect(state.mole).not.toBeNull()
    show(state, state.mole)
    const card = screen.getByTestId('role-card')
    expect(within(card).getByTestId('role')).toHaveTextContent('You are the mole')
    for (const word of state.words) expect(within(card).getByTestId('words')).toHaveTextContent(word)
    expect(screen.queryByText(state.term.explanation)).toBeNull()
  })

  it('shows the judge and a spectator the term only', () => {
    const state = start()
    show(state, state.judge)
    expect(screen.getByTestId('role')).toHaveTextContent('You are the judge')
    expect(screen.queryByTestId('explanation')).toBeNull()
    expect(screen.queryByTestId('hint')).toBeNull()
    expect(screen.getByText(state.term.term)).toBeInTheDocument()
  })

  it('covers the card and shows it again', () => {
    const state = start()
    show(state, state.honest)
    fireEvent.click(buttonNamed('Cover my card'))
    expect(screen.queryByTestId('explanation')).toBeNull()
    expect(screen.getByText(/Card covered/)).toBeInTheDocument()
    fireEvent.click(buttonNamed('Show my card'))
    expect(screen.getByTestId('explanation')).toBeInTheDocument()
  })

  it('lets only the judge start the reading, and says chat is closed', () => {
    const state = start()
    const room = show(state, state.judge)
    expect(screen.getByRole('note')).toHaveTextContent('Chat is closed until the reveal')
    fireEvent.click(buttonNamed('Start reading'))
    expect(room.act).toHaveBeenCalledWith({ type: 'startReading' })
  })

  it('tells everyone else who starts', () => {
    const state = start()
    show(state, state.order[0])
    expect(screen.queryByRole('button', { name: 'Start reading' })).toBeNull()
    expect(
      screen.getAllByText(`Read your card. The judge, ${NAMES[state.judge]}, starts the reading.`).length,
    ).toBeGreaterThan(0)
  })
})

describe('reading', () => {
  it('calls out the reader and lets them end their own reading', () => {
    const state = act(start(), { type: 'startReading' }, start().judge)
    const reader = state.order[0]
    const room = show(state, reader)
    const order = screen.getByTestId('reading-order')
    expect(within(order).getByRole('status')).toHaveTextContent('Your turn: read aloud')
    expect(within(order).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    fireEvent.click(buttonNamed('Done reading'))
    expect(room.act).toHaveBeenCalledWith({ type: 'doneReading' })
  })

  it('lets the judge end anyone’s reading, and a bystander nothing', () => {
    const state = act(start(), { type: 'startReading' }, start().judge)
    show(state, state.judge)
    expect(buttonNamed('End this reading')).toBeInTheDocument()
  })

  it('gives a bystander no button', () => {
    const state = act(start(), { type: 'startReading' }, start().judge)
    show(state, state.order[1])
    expect(screen.queryByRole('button', { name: /reading/ })).toBeNull()
    expect(screen.getAllByText(`${NAMES[state.order[0]]} is reading.`).length).toBeGreaterThan(0)
  })
})

describe('voting', () => {
  it('lets the judge pick a reader and confirm the vote from the dock', () => {
    const state = toVote(start())
    const room = show(state, state.judge)
    const vote = screen.getByTestId('vote')
    const picks = within(vote).getAllByRole('button')
    expect(picks).toHaveLength(state.order.length)
    expect(buttonNamed('Pick a reader')).toBeDisabled()
    fireEvent.click(picks[1])
    expect(picks[1]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(buttonNamed(`Vote for ${NAMES[state.order[1]]}`))
    expect(room.act).toHaveBeenCalledWith({ type: 'vote', seat: state.order[1] })
  })

  it('lets a reader give a sticker to anyone but themselves, or keep it', () => {
    const state = toVote(start())
    const seat = state.order[0]
    const room = show(state, seat)
    const sticker = screen.getByTestId('sticker')
    const choices = within(sticker).getAllByRole('button')
    // Every other reader and "No sticker"
    expect(choices).toHaveLength(state.order.length)
    expect(within(sticker).queryByRole('button', { name: new RegExp(NAMES[seat]) })).toBeNull()
    fireEvent.click(within(sticker).getByRole('button', { name: 'No sticker' }))
    fireEvent.click(buttonNamed('Keep my sticker'))
    expect(room.act).toHaveBeenCalledWith({ type: 'sticker', seat: null })
  })

  it('shows who has decided, never what', () => {
    let state = toVote(start())
    const giver = state.order[0]
    const target = state.order[1]
    state = act(state, { type: 'sticker', seat: target }, giver)
    show(state, state.order[2])
    const decided = screen.getByTestId('decided')
    expect(within(decided).getByText(`1 of ${state.order.length + 1} decided`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`Sticker on|${NAMES[giver]} →`))).toBeNull()
  })

  it('tells the giver what they sent', () => {
    let state = toVote(start())
    const giver = state.order[0]
    state = act(state, { type: 'sticker', seat: state.order[1] }, giver)
    show(state, giver)
    expect(screen.getByText(`Your sticker is on ${NAMES[state.order[1]]}.`)).toBeInTheDocument()
    expect(screen.queryByTestId('sticker')).toBeNull()
  })
})

describe('the reveal', () => {
  it('shows the honest reader, the mole and words, the meaning, the verdict and the points', () => {
    const before = start()
    const state = revealed(before, before.honest)
    show(state, state.order[0])
    const reveal = screen.getByTestId('round-reveal')
    expect(within(reveal).getByTestId('honest-was')).toHaveTextContent(`The honest reader was ${NAMES[state.honest]}`)
    expect(within(reveal).getByTestId('mole-was')).toHaveTextContent(`The mole was ${NAMES[state.mole ?? 0]}`)
    for (const word of state.words) expect(within(reveal).getByText(word)).toBeInTheDocument()
    expect(within(reveal).getByText(state.term.explanation)).toBeInTheDocument()
    expect(within(reveal).getByText(`${NAMES[state.judge]} found the honest reader`)).toBeInTheDocument()
    expect(within(reveal).getByText('Nobody gave a sticker.')).toBeInTheDocument()
    // Judge +2, honest +2, the mole unstuck +2
    expect(within(reveal).getByText(new RegExp(`${NAMES[state.judge]} \\+2`))).toBeInTheDocument()
    expect(screen.queryByTestId('role-card')).toBeNull()
  })

  it('says who the judge wrongly picked', () => {
    const before = start()
    const wrong = before.order.find((seat) => seat !== before.honest) as number
    const state = revealed(before, wrong)
    show(state, null)
    expect(screen.getByText(`${NAMES[state.judge]} picked ${NAMES[wrong]}, who was bluffing`)).toBeInTheDocument()
  })

  it('gives the judge the next round, and tells the others to wait', () => {
    const before = start()
    const state = revealed(before, before.honest)
    const room = show(state, state.judge)
    fireEvent.click(buttonNamed('Next round'))
    expect(room.act).toHaveBeenCalledWith({ type: 'next' })
  })

  it('shows minus points for a sticker on the honest reader', () => {
    let state = toVote(start())
    const giver = state.order.find((seat) => seat !== state.honest && seat !== state.mole) as number
    state = act(state, { type: 'sticker', seat: state.honest }, giver)
    state = state.order
      .filter((seat) => seat !== giver)
      .reduce((current, seat) => act(current, { type: 'sticker', seat: null }, seat), state)
    state = act(state, { type: 'vote', seat: state.honest }, state.judge)
    show(state, giver)
    expect(screen.getByText(`${NAMES[giver]} → ${NAMES[state.honest]}`)).toBeInTheDocument()
    expect(within(screen.getByTestId('scoreboard')).getByText('−1')).toBeInTheDocument()
  })
})

describe('in Chinese', () => {
  it('tells the mole their role and words in Chinese', () => {
    setLanguage('zh-TW')
    const state = start()
    show(state, state.mole)
    expect(screen.getByTestId('role')).toHaveTextContent('你是暗樁')
    expect(screen.getByText('你的任務詞')).toBeInTheDocument()
    expect(screen.queryByText('The terms are in Chinese only for now.')).toBeNull()
    setLanguage('en')
  })
})
