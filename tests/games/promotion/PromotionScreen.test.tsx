import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProjection } from '../../../shared/games/types.ts'
import type { PromotionView } from '../../../shared/games/promotion/types.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import type { CoverableSeat, RoomMember, RoomStatus } from '../../../shared/protocol.ts'
import type { RoomParts } from '../../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../../src/components/Toast.tsx'
import PromotionScreen from '../../../src/games/promotion/PromotionScreen.tsx'
import { MOVE_MS, ROLL_MS } from '../../../src/games/promotion/useRollPlayback.ts'
import { en } from '../../../src/i18n/en.ts'
import { setLanguage } from '../../../src/i18n/t.ts'
import { ChatDraft } from '../../../src/lib/chatState.ts'
import { stubDialog } from '../../lib/stubDialog.ts'

const member = (id: string, seat: number | null, over: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...over,
})

const state = (over: Partial<PromotionView> = {}): PromotionView => ({
  players: [
    { seat: 0, cell: 'baiding', rolls: 0, demotions: 0 },
    { seat: 1, cell: 'baiding', rolls: 0, demotions: 0 },
  ],
  turn: 0,
  first: 0,
  round: 1,
  turnLimit: 60,
  dice: 'four-sided',
  last: null,
  ending: null,
  winner: null,
  you: 0,
  ...over,
})

const projection = (view: PromotionView, over: Partial<GameProjection> = {}): GameProjection => ({
  view: view as unknown as JsonValue,
  legal: view.turn === view.you && view.turn !== null ? [{ type: 'roll' }] : [],
  over: view.turn === null,
  result: null,
  chatLocked: false,
  ...over,
})

interface Setup {
  status?: RoomStatus
  you?: string
  members?: RoomMember[]
  coverable?: CoverableSeat[]
}

function parts({
  status = 'playing',
  you = 'Al',
  members = [member('Al', 0, { host: true }), member('Bo', 1)],
  coverable = [],
}: Setup = {}): RoomParts {
  return {
    view: {
      room: { id: 'room', gameId: 'promotion', status, options: {}, minPlayers: 2, maxSeats: 6 },
      members: Object.fromEntries(members.map((m) => [m.id, m])),
      game: null,
      coverable,
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
    chat: {
      messages: [],
      locked: false,
      onSend: vi.fn(),
      draftStore: new ChatDraft(),
    },
  }
}

const screenOf = (room: RoomParts, game: GameProjection) => (
  <MemoryRouter>
    <ToastProvider>
      {/* The room's view holds the same game as the one handed to the screen, as in RoomPage */}
      <PromotionScreen room={{ ...room, view: { ...room.view, game } }} game={game} />
    </ToastProvider>
  </MemoryRouter>
)

const rollButton = () => screen.queryByRole('button', { name: 'Roll' })

function stubCompact() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') || query.includes('portrait'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

// Role queries walk the whole page, and this page has all of the board's cells: slow on a busy machine
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

describe('the board', () => {
  it('draws all 79 cells and a piece for each seat', () => {
    const { container } = render(screenOf(parts(), projection(state())))
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(79)
    expect(container.querySelectorAll('[data-seat]')).toHaveLength(2)
    expect(container.querySelector('svg[role="group"]')?.getAttribute('aria-label')).toMatch(
      /Promotion board of 79 offices/,
    )
  })

  it('shows names from the current language', () => {
    setLanguage('zh-TW')
    const { container } = render(screenOf(parts(), projection(state())))
    expect(container.querySelector('[data-cell="baiding"]')).toHaveTextContent('白丁')
  })

  it('says the ladder is simplified', () => {
    render(screenOf(parts(), projection(state())))
    expect(screen.getByText(/simplified version/)).toBeInTheDocument()
  })

  it('has a piece for a seat nobody holds now, marked with its number', () => {
    const { container } = render(
      screenOf(parts({ members: [member('Al', 0, { host: true })] }), projection(state())),
    )
    expect(container.querySelector('[data-seat="1"]')).toHaveTextContent('2')
  })

  it('tells about a cell when it is tapped, and goes back when tapped again', () => {
    const { container } = render(screenOf(parts(), projection(state())))
    const juren = container.querySelector('[data-cell="juren"]') as Element
    fireEvent.click(juren)
    expect(screen.getByRole('heading', { name: /Juren \(Provincial Graduate\)/ })).toBeTruthy()
    fireEvent.click(juren)
    expect(screen.getByRole('heading', { name: /Baiding \(Commoner\)/ })).toBeTruthy()
  })

  it('gives a keyboard the same through the seat buttons', () => {
    const view = state()
    view.players[1] = { ...view.players[1], cell: 'juren' }
    render(screenOf(parts(), projection(view)))
    fireEvent.click(screen.getAllByRole('button', { name: 'Bo' })[0])
    expect(screen.getByRole('heading', { name: /Juren/ })).toBeTruthy()
  })
})

describe('whose turn', () => {
  it('says it is yours, and rolling asks the room', () => {
    const room = parts()
    render(screenOf(room, projection(state())))
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    fireEvent.click(rollButton() as HTMLElement)
    expect(room.act).toHaveBeenCalledWith({ type: 'roll' })
  })

  it('sends one roll however fast the taps come', () => {
    const room = parts()
    render(screenOf(room, projection(state())))
    fireEvent.click(rollButton() as HTMLElement)
    fireEvent.click(rollButton() as HTMLElement)
    expect(room.act).toHaveBeenCalledTimes(1)
    expect(rollButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('gives the button back if the room never answers', () => {
    vi.useFakeTimers()
    const room = parts()
    render(screenOf(room, projection(state())))
    fireEvent.click(rollButton() as HTMLElement)
    act(() => void vi.advanceTimersByTime(4000))
    expect(rollButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('says whose it is otherwise, and the button does nothing', () => {
    const room = parts()
    render(screenOf(room, projection(state({ turn: 1 }))))
    expect(screen.getByText("Bo's turn")).toBeInTheDocument()
    expect(rollButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(rollButton() as HTMLElement)
    expect(room.act).not.toHaveBeenCalled()
  })

  it('goes by what the server says is legal, not by working it out', () => {
    const room = parts()
    render(screenOf(room, projection(state(), { legal: [] })))
    expect(rollButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('marks the member in the side panel in words', () => {
    render(screenOf(parts(), projection(state())))
    const row = screen.getByText(en['room.turnBadge']).closest('li') as HTMLElement
    expect(within(row).getByText('Al')).toBeInTheDocument()
  })

  it('gives a spectator no button, and says they are watching', () => {
    const room = parts({
      you: 'Cy',
      members: [member('Al', 0), member('Bo', 1), member('Cy', null)],
    })
    render(screenOf(room, projection(state({ you: null }))))
    expect(rollButton()).toBeNull()
    expect(screen.getByText(en['room.spectating'])).toBeInTheDocument()
  })
})

describe('a roll arriving', () => {
  const rolled = state({
    turn: 1,
    you: 1,
    players: [
      { seat: 0, cell: 'shengyuan', rolls: 1, demotions: 0 },
      { seat: 1, cell: 'baiding', rolls: 0, demotions: 0 },
    ],
    last: { seat: 0, face: 'de', dice: null, from: 'baiding', to: 'shengyuan' },
  })
  const pieceAt = (container: HTMLElement, seat: number) =>
    (container.querySelector(`[data-seat="${seat}"]`) as SVGGElement).style.transform

  it('holds the piece and the result back until the top stops, then lands', () => {
    vi.useFakeTimers()
    const room = parts({ you: 'Bo' })
    const { container, rerender } = render(screenOf(room, projection(state({ you: 1 }))))
    const before = pieceAt(container, 0)

    rerender(screenOf(room, projection(rolled)))
    expect(screen.getByText('Al rolls…')).toBeInTheDocument()
    expect(pieceAt(container, 0)).toBe(before)
    expect(screen.queryByText(/Al rolled/)).toBeNull()
    expect(rollButton()).toHaveAttribute('aria-disabled', 'true')

    act(() => void vi.advanceTimersByTime(ROLL_MS))
    expect(pieceAt(container, 0)).not.toBe(before)
    expect(screen.getByText('Al rolled Virtue: Baiding → Shengyuan')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(MOVE_MS))
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    expect(rollButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('with reduced motion goes straight to the result', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const room = parts({ you: 'Bo' })
    const { rerender } = render(screenOf(room, projection(state({ you: 1 }))))
    rerender(screenOf(room, projection(rolled)))
    expect(screen.getByText('Al rolled Virtue: Baiding → Shengyuan')).toBeInTheDocument()
    expect(screen.getByText('Your turn')).toBeInTheDocument()
  })

  it('says so when graft at the bottom leaves someone where they were', () => {
    const view = state({
      turn: 1,
      last: { seat: 0, face: 'zang', dice: null, from: 'baiding', to: 'baiding' },
    })
    render(screenOf(parts(), projection(view)))
    expect(screen.getByText('Al rolled Graft and stays at Baiding')).toBeInTheDocument()
  })

  it('shows the four dice of a six-sided game with the 1 and the 4 in red', () => {
    const view = state({
      dice: 'six-sided',
      turn: 1,
      last: { seat: 0, face: 'cai', dice: [1, 2, 3, 4], from: 'baiding', to: 'tongsheng' },
    })
    const { container } = render(screenOf(parts(), projection(view)))
    // The dice's pips: 1 + 2 + 3 + 4
    expect(container.querySelectorAll('[aria-hidden="true"] svg circle')).toHaveLength(10)
  })
})

describe('sound', () => {
  it('is on by default, can be muted, and stays muted', () => {
    const first = render(screenOf(parts(), projection(state())))
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }))
    expect(screen.getByRole('button', { name: 'Sound off' })).toBeInTheDocument()
    first.unmount()
    render(screenOf(parts(), projection(state())))
    expect(screen.getByRole('button', { name: 'Sound off' })).toBeInTheDocument()
  })
})

describe('zoom', () => {
  const svgWidth = (container: HTMLElement) =>
    (container.querySelector('svg[role="group"]') as SVGElement).style.width

  it('goes up and back with the buttons, within its limits', () => {
    const { container } = render(screenOf(parts(), projection(state())))
    expect(svgWidth(container)).toBe('100%')
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(svgWidth(container)).toBe('150%')

    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(svgWidth(container)).toBe('100%')

    for (let i = 0; i < 6; i++) {
      const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
      if (!(zoomIn as HTMLButtonElement).disabled) fireEvent.click(zoomIn)
    }
    expect(svgWidth(container)).toBe('400%')
  })
})

describe('the room around the game', () => {
  it('keeps everything the placeholder had: members with host controls, end and dissolve', () => {
    render(screenOf(parts(), projection(state())))
    expect(screen.getByRole('button', { name: /Kick Bo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en['room.host.endGame'] })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en['room.host.dissolve'] })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: en['chat.messages'] })).toBeInTheDocument()
  })

  it('tells each member their office and grade', () => {
    render(screenOf(parts(), projection(state())))
    const row = screen
      .getAllByText('Bo')
      .map((name) => name.closest('li'))
      .find(Boolean) as HTMLElement
    expect(within(row).getByText('Baiding (Commoner) · Commoner')).toBeInTheDocument()
  })

  it('offers the host skip and proxy for a stuck seat', () => {
    const room = parts({ coverable: [{ seat: 1, skip: true, proxy: true }] })
    render(screenOf(room, projection(state({ turn: 1 }))))
    fireEvent.click(screen.getByRole('button', { name: /Skip.*2|2.*Skip/i }))
    expect(room.onCover).toHaveBeenCalledWith(1, 'skip')
  })

  it('does not say the screen is coming soon', () => {
    render(screenOf(parts(), projection(state())))
    expect(screen.queryByText(en['room.inProgress'])).toBeNull()
  })

  describe('when the game is over', () => {
    const over = state({
      turn: null,
      ending: 'retired',
      winner: 1,
      players: [
        { seat: 0, cell: 'juren', rolls: 3, demotions: 0 },
        { seat: 1, cell: 'ronggui', rolls: 3, demotions: 0 },
      ],
      last: { seat: 1, face: 'de', dice: null, from: 'taishi', to: 'ronggui' },
    })
    const ended = projection(over, {
      over: true,
      result: {
        summary: { key: 'games.promotion.result.retired', params: { rounds: 3 } },
        standings: [],
      },
    })

    it('says who won and how it ended, and offers no roll', () => {
      render(screenOf(parts({ status: 'ended' }), ended))
      expect(screen.getAllByText('Bo retires in glory').length).toBeGreaterThan(0)
      expect(screen.getByText(/after 3 rounds/)).toBeInTheDocument()
      expect(rollButton()).toBeNull()
    })

    it('names the office rather than the seniority number behind it', () => {
      const withStandings = projection(over, {
        over: true,
        result: {
          summary: { key: 'games.promotion.result.retired', params: { rounds: 3 } },
          standings: [
            { seat: 1, rank: 1, score: 24, note: { key: 'games.promotion.note.retired', params: { rolls: 3 } } },
            { seat: 0, rank: 2, score: 3, note: { key: 'games.promotion.note.student', params: { rolls: 3 } } },
          ],
        },
      })
      render(screenOf(parts({ status: 'ended' }), withStandings))
      const rows = within(screen.getByRole('region', { name: en['room.result.heading'] })).getAllByRole(
        'listitem',
      )
      expect(rows[0]).toHaveTextContent('Bo')
      expect(rows[0]).toHaveTextContent('Retired in glory after 3 rolls.')
      expect(rows[1]).toHaveTextContent(/Juren/)
      expect(screen.queryByText(/Score:/)).toBeNull()
    })

    it('at the round limit names whoever tied at the top', () => {
      const limit = state({ turn: null, ending: 'turnLimit', winner: null })
      const tied = projection(limit, {
        over: true,
        result: {
          summary: { key: 'games.promotion.result.turnLimit', params: { rounds: 60 } },
          standings: [
            { seat: 0, rank: 1, score: 0, note: { key: 'games.promotion.note.commoner', params: { rolls: 1 } } },
            { seat: 1, rank: 1, score: 0, note: { key: 'games.promotion.note.commoner', params: { rolls: 1 } } },
          ],
        },
      })
      render(screenOf(parts({ status: 'ended' }), tied))
      expect(screen.getByText('Al and Bo ended the most senior')).toBeInTheDocument()
    })

    it('waits for the last move to land before giving the result away', () => {
      vi.useFakeTimers()
      try {
        const before = state({
          players: [
            { seat: 0, cell: 'juren', rolls: 3, demotions: 0 },
            { seat: 1, cell: 'taishi', rolls: 2, demotions: 0 },
          ],
          turn: 1,
        })
        const heading = () => screen.queryByRole('heading', { name: en['room.result.heading'] })
        const { rerender } = render(screenOf(parts(), projection(before)))
        rerender(screenOf(parts({ status: 'ended' }), ended))
        expect(heading()).toBeNull()
        // Nor does the host get the actions anywhere else in the meantime
        expect(screen.queryByRole('button', { name: en['room.host.rematch'] })).toBeNull()
        act(() => vi.advanceTimersByTime(ROLL_MS))
        expect(heading()).toBeNull()
        act(() => vi.advanceTimersByTime(MOVE_MS))
        expect(heading()).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it("keeps the host's rematch and the way to the waiting room", () => {
      const room = parts({ status: 'ended' })
      render(screenOf(room, ended))
      fireEvent.click(screen.getByRole('button', { name: en['room.host.rematch'] }))
      expect(room.onRematch).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: en['room.host.reopen'] })).toBeInTheDocument()
    })

    it('still lets a spectator take a free seat', () => {
      const room = parts({
        status: 'ended',
        you: 'Cy',
        members: [member('Al', 0, { host: true }), member('Bo', 1), member('Cy', null)],
      })
      render(screenOf(room, ended))
      fireEvent.click(screen.getByRole('button', { name: 'Sit in seat 3' }))
      expect(room.onSit).toHaveBeenCalledWith(2)
    })

    it('on a phone shows all of that on the page, not in the drawer', () => {
      stubCompact()
      render(screenOf(parts({ status: 'ended' }), ended))
      expect(screen.getByRole('button', { name: en['room.host.rematch'] })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: en['room.panel.members'] })).toBeNull()
    })
  })

  describe('on a phone', () => {
    beforeEach(() => stubCompact())

    it('lays the board out for a portrait screen', () => {
      const { container } = render(screenOf(parts(), projection(state())))
      const viewBox = (container.querySelector('svg[role="group"]') as SVGElement).getAttribute(
        'viewBox',
      ) as string
      const [, , width, height] = viewBox.split(' ').map(Number)
      expect(height).toBeGreaterThan(width)
    })

    it('keeps members and chat in the drawer until asked for', () => {
      render(screenOf(parts(), projection(state())))
      expect(screen.queryByRole('log')).toBeNull()
      expect(screen.queryByRole('button', { name: en['room.host.endGame'] })).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: en['room.panel.members'] }))
      expect(screen.getByRole('button', { name: en['room.host.endGame'] })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: en['chat.heading'] }))
      expect(screen.getByRole('log')).toBeInTheDocument()
    })

    it('keeps a stuck seat out of the drawer, on the page where the host sees it', () => {
      const room = parts({ coverable: [{ seat: 1, skip: true, proxy: true }] })
      render(screenOf(room, projection(state({ turn: 1 }))))
      expect(screen.getByText(en['room.cover.heading'])).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: en['room.panel.members'] }))
      // Once, not again in the drawer
      expect(screen.getAllByText(en['room.cover.heading'])).toHaveLength(1)
    })
  })
})
