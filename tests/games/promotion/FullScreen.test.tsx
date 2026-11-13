// The full edition's screen with the second rules (C8): the board after its data loads, a decision
// asked of its seat over the board, what everyone else sees meanwhile, and the answers it sends.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAction, makeSeats, startMatch, type Match } from '../../../shared/games/match.ts'
import { promotion } from '../../../shared/games/promotion/rules.ts'
import type { PromotionFullState, PromotionFullView } from '../../../shared/games/promotion/types.ts'
import type { GameProjection, Rng } from '../../../shared/games/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import { loadFullData } from '../../../src/games/promotion/full/fullData.ts'
import FullScreen from '../../../src/games/promotion/full/FullScreen.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { MemoryRouter } from '../../../src/lib/router.tsx'
import { stubDialog } from '../../lib/stubDialog.ts'

vi.setConfig({ testTimeout: 30_000 })

const member = (id: string, seat: number | null, host = false): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host,
  online: true,
  absent: false,
})

/** An Rng whose dice come from a list of pips */
function dice(pips: readonly number[]): Rng {
  const queue = [...pips]
  return {
    float: () => 0,
    int: (max: number) => (max === 6 ? (queue.shift() as number) - 1 : 0),
    pick: <T,>(items: readonly T[]) => items[0],
    shuffle: <T,>(items: readonly T[]) => [...items],
  }
}

const OPTIONS = {
  edition: 'full',
  dice: 'six-sided',
  turnLimit: 60,
  decisionSeconds: 30,
  buying: true,
  endAtDahe: false,
} as const

/** Seat 0 on `cell`, then the dice it throws: a decision waits */
function asked(cell: string, pips: number[]): PromotionFullState {
  const start = promotion.init(makeSeats(2), OPTIONS, dice([])) as PromotionFullState
  const placed: PromotionFullState = {
    ...start,
    players: start.players.map((p, at) => ({ ...p, cell: at === 0 ? cell : 'zhixian', rank: at === 0 ? 2 : 12, origin: 'baiding' })),
  }
  return promotion.reduce(placed, { type: 'roll' }, 0, dice(pips)) as PromotionFullState
}

function parts(you: string, actSpy = vi.fn()): RoomParts {
  const members = [member('Al', 0, true), member('Bo', 1), member('Cy', null)]
  return {
    view: {
      room: { id: 'room', gameId: 'promotion', status: 'playing', options: {}, minPlayers: 2, maxSeats: 6 },
      members: Object.fromEntries(members.map((m) => [m.id, m])),
      game: null,
      coverable: [],
    },
    you,
    timers: [{ id: 'decide-1', deadline: performance.now() + 30_000, totalMs: 30_000 }],
    onSit: vi.fn(),
    onCover: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onDissolve: vi.fn(),
    onReopen: vi.fn(),
    onRematch: vi.fn(),
    act: actSpy,
    chat: { messages: [], locked: false, onSend: vi.fn(), draftStore: new ChatDraft() },
  }
}

function projection(state: PromotionFullState, viewer: number | 'spectator'): GameProjection {
  return {
    view: promotion.view(state, viewer) as unknown as JsonValue,
    legal: viewer === 'spectator' ? [] : (promotion.legalActions(state, viewer) as unknown as JsonValue[]),
    over: promotion.isOver(state),
    result: promotion.isOver(state) ? promotion.result(state) : null,
    chatLocked: false,
  }
}

function show(state: PromotionFullState, viewer: number | 'spectator', you: string, actSpy = vi.fn()) {
  const view = promotion.view(state, viewer) as PromotionFullView
  const game: GameProjection = {
    view: view as unknown as JsonValue,
    legal: viewer === 'spectator' ? [] : (promotion.legalActions(state, viewer) as unknown as JsonValue[]),
    over: false,
    result: null,
    chatLocked: false,
  }
  const room = parts(you, actSpy)
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FullScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  stubDialog()
  await loadFullData()
})

beforeEach(() => {
  setLanguage('en')
  localStorage.clear()
})

describe('a decision on the full board (C8)', () => {
  it('asks the deciding seat over the board, with what each answer does and a countdown', async () => {
    const send = vi.fn()
    const { container } = show(asked('shengyuan', [2, 2, 3, 5]), 0, 'Al', send)
    await act(async () => {})
    expect(container.querySelectorAll('[data-cell]').length).toBe(236)
    expect(container.querySelector('[data-pending-cell="fanglue-tenglu"]')).not.toBeNull()
    expect(container.querySelector('[data-choice="offer"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-grade]')).toHaveLength(14)
    const prompt = screen.getByRole('region', { name: /Accept the post of Fanglueguan Tenglu/ })
    expect(prompt).toHaveTextContent(/Decline: stay at Shengyuan/)
    expect(prompt).toHaveTextContent(/If time runs out: decline/)
    expect(screen.getByRole('timer', { name: 'Time left to decide' })).toBeInTheDocument()
    const accept = screen.getByRole('button', { name: 'Accept' })
    expect(accept).toHaveFocus()
    expect(screen.getByText('Your choice: answer on the board')).toBeInTheDocument()
    fireEvent.click(accept)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'accept' })
    // Sent once: a second press before the room answers does nothing
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('offers each office with its price, and taking the minor post', async () => {
    const send = vi.fn()
    show(asked('jiansheng', [2, 2, 3, 5]), 0, 'Al', send)
    await act(async () => {})
    expect(screen.getByRole('region', { name: /Buy an office instead of Tianwensheng/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Zhixian\s*·\s*30 silver$/ }))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'buy', cell: 'zhixian' })
    expect(screen.getByRole('button', { name: 'Take Tianwensheng' })).toBeInTheDocument()
  })

  it('shows everyone else who is deciding what, with nothing to press', async () => {
    show(asked('shengyuan', [2, 2, 3, 5]), 'spectator', 'Cy')
    await act(async () => {})
    expect(screen.getAllByText('Al is deciding whether to accept Fanglueguan Tenglu')).toHaveLength(2)
    expect(screen.getByText('Al is deciding…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Accept the post/ })).toBeNull()
  })
})

describe('the settlement (C7, fixed in C8)', () => {
  it('shows again for the next game after a rematch in the same room', async () => {
    let match: Match<PromotionFullState> = startMatch(promotion, makeSeats(2), OPTIONS, 3) as Match<PromotionFullState>
    const fresh = match.state
    while (!promotion.isOver(match.state)) {
      const state = match.state
      const seat = state.pending?.seat ?? (state.turn as number)
      match = applyAction(promotion, match, promotion.legalActions(state, seat)[0], seat) as Match<PromotionFullState>
    }
    const room = parts('Al')
    const at = (state: PromotionFullState) => {
      const game = projection(state, 0)
      return (
        <MemoryRouter>
          <ToastProvider>
            <FullScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
          </ToastProvider>
        </MemoryRouter>
      )
    }
    const { rerender } = render(at(match.state))
    await act(async () => {})
    while (screen.queryByRole('button', { name: 'Next step' })) {
      fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Settlement' })).toBeNull()
    rerender(at(fresh))
    rerender(at(match.state))
    expect(screen.getByRole('region', { name: 'Settlement' })).toBeInTheDocument()
  })
})
