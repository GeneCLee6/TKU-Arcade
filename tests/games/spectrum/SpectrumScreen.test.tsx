import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { spectrum } from '../../../shared/games/spectrum/rules.ts'
import type {
  SpectrumAction,
  SpectrumOptions,
  SpectrumState,
} from '../../../shared/games/spectrum/types.ts'
import { isGameError, type Actor, type GameProjection } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import SpectrumScreen from '../../../src/games/spectrum/SpectrumScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

// The screen against the real rules: every view here is what the room would send that seat

const NAMES = ['Al', 'Bo', 'Cy', 'Di']
const OPTIONS: SpectrumOptions = { mode: 'extremes', duplicates: false, twoRounds: false, clock: true }

const start = (options: Partial<SpectrumOptions> = {}) =>
  spectrum.init(makeSeats(4), { ...OPTIONS, ...options }, createRng(7))

function act(state: SpectrumState, action: SpectrumAction, actor: Actor): SpectrumState {
  const next = spectrum.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

/** Every answerer answers, so that the answers lock */
const answered = (state: SpectrumState) =>
  state.answerers.reduce(
    (current, answerer, index) =>
      act(current, { type: 'submitAnswer', text: ['rice', 'soup', 'noodles'][index] }, answerer.seat),
    state,
  )

const projection = (state: SpectrumState, seat: number | null): GameProjection => ({
  view: spectrum.view(state, seat ?? 'spectator') as unknown as JsonValue,
  legal: (seat === null ? [] : spectrum.legalActions(state, seat)) as unknown as JsonValue[],
  over: spectrum.isOver(state),
  result: spectrum.isOver(state) ? spectrum.result(state) : null,
  chatLocked: spectrum.chatLocked?.(state) ?? false,
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
      room: { id: 'room', gameId: 'spectrum', status, options: {}, minPlayers: 4, maxSeats: 11 },
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
function show(state: SpectrumState, seat: number | null) {
  const room = parts(seat === null ? 'Ed' : NAMES[seat], spectrum.isOver(state) ? 'ended' : 'playing')
  const game = projection(state, seat)
  render(
    <MemoryRouter>
      <ToastProvider>
        <SpectrumScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
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

describe('answering', () => {
  it('shows the topic, its two ends and the round', () => {
    const state = start()
    show(state, state.answerers[0].seat)
    const card = screen.getByTestId('topic-card')
    expect(within(card).getByRole('heading')).toHaveTextContent(state.topic.topic)
    expect(within(card).getByText(state.topic.low)).toBeInTheDocument()
    expect(within(card).getByText(state.topic.high)).toBeInTheDocument()
    expect(screen.getAllByText('Round 1/4').length).toBeGreaterThan(0)
    expect(screen.getByText('The topics are only in Chinese for now.')).toBeInTheDocument()
  })

  it('gives an answerer their own number, which they can hide', () => {
    const state = start()
    const { seat, number } = state.answerers[0]
    show(state, seat)
    expect(screen.getByTestId('secret-number')).toHaveTextContent(String(number))
    fireEvent.click(screen.getByRole('button', { name: 'Hide my number' }))
    expect(screen.getByTestId('secret-number')).toHaveTextContent('Hidden')
    expect(screen.getByTestId('secret-number')).not.toHaveTextContent(String(number))
    fireEvent.click(screen.getByRole('button', { name: 'Show my number' }))
    expect(screen.getByTestId('secret-number')).toHaveTextContent(String(number))
  })

  it('sends the answer as typed, and warns of a number before the room refuses it', () => {
    const state = start()
    const room = show(state, state.answerers[0].seat)
    const input = screen.getByRole('textbox', { name: 'Your answer' })
    const sendButton = screen.getByRole('button', { name: 'Send answer' })
    expect(sendButton).toBeDisabled()
    fireEvent.change(input, { target: { value: 'two bowls 2' } })
    expect(screen.getByRole('alert')).toHaveTextContent('No numbers in the answer')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: 'a bowl of rice' } })
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    fireEvent.click(sendButton)
    expect(room.act).toHaveBeenCalledWith({ type: 'submitAnswer', text: 'a bowl of rice' })
  })

  it('lets an answerer change a sent answer, and says it is in', () => {
    const start0 = start()
    const seat = start0.answerers[0].seat
    const state = act(start0, { type: 'submitAnswer', text: 'rice' }, seat)
    show(state, seat)
    expect(screen.getByText(/^Sent: “rice”/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change answer' })).toBeDisabled()
    expect(screen.getByText('1/3 in')).toBeInTheDocument()
  })

  it('shows the guesser who has answered, never what or any number', () => {
    const begun = start()
    const state = act(begun, { type: 'submitAnswer', text: 'rice' }, begun.answerers[0].seat)
    show(state, state.guesser)
    expect(screen.getByRole('heading', { name: 'This round you are the guesser' })).toBeInTheDocument()
    expect(screen.queryByTestId('secret-number')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull()
    expect(screen.queryByText('rice')).toBeNull()
    expect(screen.getAllByText('Answered')).toHaveLength(1)
    expect(screen.getAllByText('Thinking')).toHaveLength(2)
  })

  it('says chat is closed while answering', () => {
    const state = start()
    show(state, state.guesser)
    expect(
      screen.getByText('Chat is closed while the answers are written and guessed.'),
    ).toBeInTheDocument()
  })

  it('lets a spectator watch with nothing to press', () => {
    show(start(), null)
    expect(screen.getByText("You're watching this game.")).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull()
    expect(screen.queryByTestId('secret-number')).toBeNull()
  })
})

describe('guessing', () => {
  it('lets the guesser pick the largest and the smallest, then sends them', () => {
    const state = answered(start())
    const room = show(state, state.guesser)
    const [first, second] = state.answerers
    const confirm = screen.getByRole('button', { name: 'Confirm guess' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: `Largest: ${NAMES[first.seat]}` }))
    // The same answer cannot be both: picking it as the smallest moves it
    fireEvent.click(screen.getByRole('button', { name: `Smallest: ${NAMES[first.seat]}` }))
    expect(screen.getByRole('button', { name: `Largest: ${NAMES[first.seat]}` })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: `Largest: ${NAMES[second.seat]}` }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(room.act).toHaveBeenCalledWith({ type: 'guessExtremes', max: second.seat, min: first.seat })
  })

  it('shows an answerer every answer, their own number, and who is guessing', () => {
    const state = answered(start())
    const own = state.answerers[1]
    show(state, own.seat)
    for (const text of ['rice', 'soup', 'noodles']) expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByTestId('secret-number')).toHaveTextContent(`Your number: ${own.number}`)
    expect(
      screen.getByText(`${NAMES[state.guesser]} is picking the largest and the smallest.`),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Largest:/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirm guess' })).toBeNull()
  })

  it('lets the guesser order every answer in the full-order mode', () => {
    const state = answered(start({ mode: 'order' }))
    const room = show(state, state.guesser)
    const seats = state.answerers.map((answerer) => answerer.seat)
    fireEvent.click(
      screen.getByRole('button', { name: `${NAMES[seats[0]]}: move towards 10` }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm guess' }))
    expect(room.act).toHaveBeenCalledWith({
      type: 'guessOrder',
      seats: [seats[1], seats[0], seats[2]],
    })
  })
})

describe('the reveal', () => {
  const revealed = () => {
    const state = answered(start())
    const [first, second] = state.answerers
    return act(state, { type: 'guessExtremes', max: first.seat, min: second.seat }, state.guesser)
  }

  it('puts every number on the line, with the verdicts and what each seat gained', () => {
    const state = revealed()
    show(state, state.answerers[2].seat)
    const reveal = screen.getByTestId('round-reveal')
    for (const answerer of state.answerers) {
      expect(within(reveal).getByTestId(`mark-${answerer.seat}`)).toHaveTextContent(
        String(answerer.number),
      )
    }
    expect(within(reveal).getByText(/^Largest: .+\. Guessed (right|wrong)$/)).toBeInTheDocument()
    expect(within(reveal).getByText(/^Smallest: .+\. Guessed (right|wrong)$/)).toBeInTheDocument()
    const gained = state.reveal?.points.reduce((sum, points) => sum + points, 0) ?? 0
    if (gained === 0) expect(within(reveal).getByText('Nobody scored this round.')).toBeInTheDocument()
    else expect(within(reveal).getByText(/\+\d/)).toBeInTheDocument()
    expect(screen.queryByText('Chat is closed while the answers are written and guessed.')).toBeNull()
  })

  it('gives only the guesser the button to the next round', () => {
    const state = revealed()
    const room = show(state, state.guesser)
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }))
    expect(room.act).toHaveBeenCalledWith({ type: 'next' })
  })

  it('tells the others who starts the next round', () => {
    const state = revealed()
    show(state, state.answerers[0].seat)
    expect(screen.queryByRole('button', { name: 'Next round' })).toBeNull()
    expect(
      screen.getByText(`Waiting for ${NAMES[state.guesser]} to start the next round.`),
    ).toBeInTheDocument()
  })

  it('says why a round with no guess scored nothing', () => {
    const state = act(answered(start()), { type: 'timeUp' }, 'system')
    show(state, state.guesser)
    expect(
      screen.getByText('The guesser ran out of time: no points this round.'),
    ).toBeInTheDocument()
  })

  it('ends with the scoreboard and the result', () => {
    let state = start()
    for (let round = 1; round <= 4; round++) {
      state = answered(state)
      const [first, second] = state.answerers
      state = act(state, { type: 'guessExtremes', max: first.seat, min: second.seat }, state.guesser)
      if (round < 4) state = act(state, { type: 'next' }, state.guesser)
    }
    show(state, 0)
    expect(screen.getByRole('region', { name: 'Results' })).toBeInTheDocument()
    const scores = screen.getByRole('region', { name: 'Scores' })
    expect(within(scores).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getAllByText('Round 4/4').length).toBeGreaterThan(0)
  })
})
