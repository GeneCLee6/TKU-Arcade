// The kart's online races (2026-11-23, docs/ARCHITECTURE.md §4.83): the room list's states and
// filters, quick join (with computer karts for a new room) and a new room (named, private unless
// asked), against a stand-in for the API.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomListing } from '../../shared/protocol.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { RouterContext, type RouterValue } from '../../src/lib/useRouter.ts'
import OnlineView from '../../src/kart/online/OnlineView.tsx'
import { ALL_ROOMS, filterRooms, roomState } from '../../src/kart/online/roomList.ts'

vi.mock('../../src/kart/audio/useMenuMusic.ts', () => ({ useMenuMusic: () => {} }))

const room = (id: string, over: Partial<RoomListing> = {}): RoomListing => ({
  id,
  gameId: 'kart',
  host: `Host${id}`,
  seated: 2,
  maxSeats: 8,
  createdAt: 1,
  options: { track: 'harbour', mode: 'items', teams: 'solo', laps: 3 },
  ...over,
})

const ROOMS = [
  room('aaaaaaaaaa', { name: '週五夜跑', bots: 1 }),
  room('bbbbbbbbbb', { locked: true }),
  room('cccccccccc', { seated: 8 }),
  room('dddddddddd', { status: 'playing', options: { track: 'guanyin', mode: 'race', teams: 'teams', laps: 2 } }),
]

describe('roomList', () => {
  it("tells a room's state and filters by it, by mode and by password", () => {
    expect(ROOMS.map(roomState)).toEqual(['open', 'locked', 'full', 'racing'])
    expect(filterRooms(ROOMS, ALL_ROOMS)).toHaveLength(4)
    expect(filterRooms(ROOMS, { ...ALL_ROOMS, show: 'open' }).map((one) => one.id)).toEqual(['aaaaaaaaaa'])
    expect(filterRooms(ROOMS, { ...ALL_ROOMS, show: 'live' }).map((one) => one.id)).toEqual(['dddddddddd'])
    expect(filterRooms(ROOMS, { ...ALL_ROOMS, mode: 'race' }).map((one) => one.id)).toEqual(['dddddddddd'])
    expect(filterRooms(ROOMS, { ...ALL_ROOMS, locked: false })).toHaveLength(3)
  })
})

type Call = { url: string; body: unknown }

function setup(rooms: RoomListing[] = ROOMS, answers: Record<string, () => Response> = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.startsWith('/api/lobby')) return Response.json({ rooms })
      const answer = answers[url]
      return answer ? answer() : Response.json({ error: 'nope' }, { status: 500 })
    }),
  )
  const navigate = vi.fn()
  const router = { location: { pathname: '/kart', search: '?online', hash: '' }, navigate } as unknown as RouterValue
  render(
    <RouterContext.Provider value={router}>
      <OnlineView onExit={() => {}} />
    </RouterContext.Provider>,
  )
  return { calls, navigate }
}

beforeEach(() => setLanguage('en'))
afterEach(() => vi.unstubAllGlobals())

describe('OnlineView', () => {
  it('lists the rooms with their state, track, mode, people and password, and joins or watches', async () => {
    const { calls, navigate } = setup()
    const rows = await screen.findAllByTestId('kart-online-room')
    expect(calls[0]?.url).toBe('/api/lobby?game=kart')
    expect(rows.map((row) => row.dataset.state)).toEqual(['open', 'locked', 'full', 'racing'])
    const first = within(rows[0]!)
    expect(first.getByText('週五夜跑')).toBeTruthy()
    expect(first.getByText("Fisherman's Wharf")).toBeTruthy()
    expect(first.getByText('1 + 1 CPU')).toBeTruthy()
    expect(within(rows[1]!).getByTestId('kart-online-locked')).toBeTruthy()
    expect(within(rows[1]!).getByText("Hostbbbbbbbbbb's room")).toBeTruthy()
    expect(within(rows[3]!).getByText('Racing')).toBeTruthy()
    fireEvent.click(within(rows[3]!).getByRole('button', { name: "Watch Hostdddddddddd's room" }))
    expect(navigate).toHaveBeenLastCalledWith('/r/dddddddddd')
    fireEvent.click(first.getByRole('button', { name: 'Join 週五夜跑' }))
    expect(navigate).toHaveBeenLastCalledWith('/r/aaaaaaaaaa')
    expect(screen.getByTestId('kart-online-summary').textContent).toBe('4 rooms · 13 drivers')
  })

  it('filters to the rooms one can join', async () => {
    setup()
    await screen.findAllByTestId('kart-online-room')
    fireEvent.click(screen.getByTestId('kart-online-show-open'))
    expect(screen.getAllByTestId('kart-online-room')).toHaveLength(1)
  })

  it('quick joins, asking for computer karts in case a room opens', async () => {
    const { calls, navigate } = setup([], {
      '/api/rooms/quick': () => Response.json({ id: 'eeeeeeeeee', created: true }, { status: 201 }),
    })
    await screen.findByTestId('kart-online-empty')
    fireEvent.change(screen.getByTestId('kart-online-quick-bots'), { target: { value: '5' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('kart-online-quick'))
    })
    expect(calls.at(-1)).toEqual({
      url: '/api/rooms/quick',
      body: { gameId: 'kart', seatBots: { count: 5, level: 'normal' } },
    })
    expect(navigate).toHaveBeenCalledWith('/r/eeeeeeeeee')
  })

  it('opens a private room by default, named, and refuses a name a nickname could not have', async () => {
    const { calls, navigate } = setup([], {
      '/api/rooms': () => Response.json({ id: 'ffffffffff', code: '1234' }, { status: 201 }),
    })
    fireEvent.click(screen.getByTestId('kart-online-create-open'))
    const name = screen.getByTestId('kart-online-create-name')
    fireEvent.change(name, { target: { value: 'admin' } })
    expect(screen.getByTestId('kart-online-name-issue')).toBeTruthy()
    expect(screen.getByTestId('kart-online-create-go')).toBeDisabled()
    fireEvent.change(name, { target: { value: '  社辦  車隊 ' } })
    expect(screen.queryByTestId('kart-online-name-issue')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('kart-online-create-go'))
    })
    const sent = calls.at(-1)!
    expect(sent.url).toBe('/api/rooms')
    expect(sent.body).toMatchObject({ gameId: 'kart', name: '社辦 車隊', options: { mode: 'items', teams: 'solo' } })
    expect(sent.body).not.toHaveProperty('public')
    expect(navigate).toHaveBeenCalledWith('/r/ffffffffff')
  })

  it('says when the site owner paused the kart', async () => {
    setup([], { '/api/rooms/quick': () => Response.json({ error: 'game_disabled' }, { status: 403 }) })
    await act(async () => {
      fireEvent.click(screen.getByTestId('kart-online-quick'))
    })
    expect(screen.getByTestId('kart-online-problem').textContent).toContain('paused')
  })
})
