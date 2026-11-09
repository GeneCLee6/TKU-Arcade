import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloseCode, type RoomSummary } from '../../shared/protocol.ts'
import { resetAccountForTests } from '../../src/lib/account.ts'
import { CHAT_ACK_TIMEOUT_MS } from '../../src/lib/chatState.ts'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { en } from '../../src/i18n/en.ts'
import { initLanguage, setLanguage } from '../../src/i18n/t.ts'
import { zhTW } from '../../src/i18n/zh-TW.ts'
import { RoomPage } from '../../src/pages/RoomPage.tsx'
import { FakeWebSocket, TOKEN_A, TOKEN_B, welcome } from '../lib/fakeWebSocket.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const ROOM = 'abcdefghij'
const NICKNAME_KEY = 'tku-arcade.nickname'
const SEAT_KEY = `tku-arcade.seat.${ROOM}`

const summary = (over: Partial<RoomSummary> = {}): RoomSummary => ({
  id: ROOM,
  gameId: 'promotion',
  status: 'waiting',
  members: 0,
  seated: 0,
  maxSeats: 6,
  ...over,
})

function stubSummary(over: Partial<RoomSummary> = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(summary(over))))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderRoom(id = ROOM, { strict = false } = {}) {
  const tree = (
    <ToastProvider>
      <MemoryRouter initialEntries={[`/r/${id}`]}>
        <Routes>
          <Route path="/" element={<p>the lobby</p>} />
          <Route path="/r/:id" element={<RoomPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

/** Lets the summary arrive, and with a stored name the socket gets made */
const summaryLoaded = async () => {
  await screen.findByRole('heading', { level: 1 })
  // The heading can appear before the effect that opens the socket has run
  await act(async () => {})
}

const serverSays = (data: string) => act(() => FakeWebSocket.last.receive(data))
const serverCloses = (code: number) => act(() => FakeWebSocket.last.serverClose(code))
const socketOpens = () => act(() => FakeWebSocket.last.open())

async function joined(me: Parameters<typeof welcome>[0] = {}) {
  localStorage.setItem(NICKNAME_KEY, 'Al')
  stubSummary()
  renderRoom()
  await summaryLoaded()
  socketOpens()
  serverSays(welcome(me))
}

const backLink = () => screen.getByRole('link', { name: 'Back to the lobby' })
const retryButton = () => screen.queryByRole('button', { name: 'Try again' })
const startButton = () => screen.getByRole('button', { name: en['room.waiting.start'] })

beforeAll(stubDialog)

beforeEach(() => {
  localStorage.clear()
  initLanguage()
  FakeWebSocket.install()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('before joining', () => {
  it('calls an id that cannot exist not found, without asking the server', () => {
    const fetchMock = stubSummary()
    renderRoom('nope')
    expect(screen.getByRole('heading', { name: 'Room not found' })).toBeInTheDocument()
    expect(backLink()).toHaveAttribute('href', '/')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('calls a 404 not found, and does not ask for a nickname', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }))),
    )
    renderRoom()
    expect(await screen.findByRole('heading', { name: 'Room not found' })).toBeInTheDocument()
    expect(backLink()).toBeInTheDocument()
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it.each([
    ['the network fails', () => Promise.reject(new TypeError('offline'))],
    ['the server errors', () => Promise.resolve(new Response('oops', { status: 500 }))],
    ['the answer is not JSON', () => Promise.resolve(new Response('<!doctype html>'))],
  ])('when %s says so apart from not found, and retries', async (_, failure) => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    const fetchMock = vi.fn<() => Promise<Response>>(failure as () => Promise<Response>)
    vi.stubGlobal('fetch', fetchMock)
    renderRoom()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the room.")
    expect(screen.queryByText('Room not found')).not.toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(0)

    fetchMock.mockImplementation(() => Promise.resolve(Response.json(summary())))
    fireEvent.click(retryButton()!)

    await summaryLoaded()
    expect(screen.getByRole('heading', { name: 'Promotion' })).toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('shows the game and how many are in the room', async () => {
    stubSummary({ members: 3 })
    renderRoom()
    expect(await screen.findByRole('heading', { name: 'Promotion' })).toBeInTheDocument()
    expect(screen.getByText('In the room: 3')).toBeInTheDocument()
  })

  it('shows a generic title for a game this page does not know', async () => {
    stubSummary({ gameId: 'from-the-future' })
    renderRoom()
    expect(await screen.findByRole('heading', { name: 'Game room' })).toBeInTheDocument()
  })

  it('asks for a nickname first, and opens no socket until it has one', async () => {
    stubSummary()
    renderRoom()
    const input = await screen.findByLabelText('Nickname')
    expect(FakeWebSocket.instances).toHaveLength(0)

    fireEvent.change(input, { target: { value: ' Bo ' } })
    fireEvent.submit(input.closest('form')!)

    expect(FakeWebSocket.instances).toHaveLength(1)
    socketOpens()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Bo', token: null }])
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('Bo')
  })
})

describe('joining', () => {
  it('sends join on open with the stored name and token', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    localStorage.setItem(SEAT_KEY, TOKEN_A)
    stubSummary()
    renderRoom()
    await summaryLoaded()
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
    expect(FakeWebSocket.last.sent).toEqual([])

    socketOpens()

    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
    expect(screen.getByRole('status')).toHaveTextContent('Joining…')
  })

  it('never asks a signed-in person for a nickname, and joins under the account name (e1-t13)', async () => {
    resetAccountForTests({ configured: true, account: { id: 'acct-amy', name: 'Amy' } })
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom()
    await summaryLoaded()
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
    socketOpens()
    // The room takes the name from the session anyway; this is only what the page sends
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Amy', token: null }])
  })

  it('offers signing in instead of a nickname, back to this room, only when configured (e1-t13)', async () => {
    stubSummary()
    renderRoom()
    await summaryLoaded()
    expect(screen.getByLabelText('Nickname')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in with Overtrick' })).not.toBeInTheDocument()
    cleanup()
    resetAccountForTests({ configured: true, account: null })
    renderRoom()
    await summaryLoaded()
    const link = screen.getByRole('link', { name: 'Sign in with Overtrick' })
    expect(link.getAttribute('href')).toBe(`/api/auth/start?return=%2Fr%2F${ROOM}`)
  })

  it('shows the server’s name, keeps the typed one, and saves the token', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom()
    await summaryLoaded()
    socketOpens()

    serverSays(welcome({ name: 'Al (2)', seat: 1 }, { token: TOKEN_B }))

    expect(screen.getByText('Al (2)')).toBeInTheDocument()
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_B)
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('Al')
  })

  it('shows the waiting room, the seat counted from one', async () => {
    await joined({ seat: 2 })
    const row = screen.getByText('Al').closest('li') as HTMLElement
    expect(within(row).getByText('Seat 3')).toBeInTheDocument()
    expect(startButton()).toBeInTheDocument()
    expect(backLink()).toBeInTheDocument()
  })

  it('shows a spectator as one', async () => {
    await joined({ seat: null })
    expect(screen.getByText(en['room.waiting.pickSeat'])).toBeInTheDocument()
  })

  it('counts this person in once joined, which the earlier summary could not', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary({ members: 0 })
    renderRoom()
    await summaryLoaded()
    expect(screen.getByText('In the room: 0')).toBeInTheDocument()
    socketOpens()
    serverSays(welcome({}, { others: 1 }))
    expect(screen.getByText('In the room: 2')).toBeInTheDocument()
  })

  it('keeps the socket when the language changes', async () => {
    await joined()
    act(() => setLanguage('zh-TW'))
    expect(screen.getByRole('heading', { name: zhTW['room.waiting.seats'] })).toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.last.closedByClient).toBe(false)
    act(() => setLanguage('en'))
  })

  it('closes the socket on leaving the page', async () => {
    await joined()
    const socket = FakeWebSocket.last
    fireEvent.click(backLink())
    expect(await screen.findByText('the lobby')).toBeInTheDocument()
    expect(socket.closedByClient).toBe(true)
  })

  it('in StrictMode opens two sockets but joins once', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom(ROOM, { strict: true })
    await summaryLoaded()

    // The double effect really ran, or this test would prove nothing
    expect(FakeWebSocket.instances).toHaveLength(2)
    const [first, second] = FakeWebSocket.instances
    expect(first.closedByClient).toBe(true)
    expect(second.closedByClient).toBe(false)

    act(() => {
      first.open()
      second.open()
    })

    expect(first.sent).toEqual([])
    expect(second.joins).toHaveLength(1)

    serverSays(welcome({}))
    expect(screen.getByText('Al')).toBeInTheDocument()
  })
})

describe('in the room', () => {
  const patch = (rev: number, path: string[], value: unknown) =>
    JSON.stringify({ t: 'patch', rev, ops: [{ op: 'set', path, value }] })
  const bo = (over = {}) => ({
    id: 'm2',
    name: 'Bo',
    seat: 1,
    ready: false,
    host: false,
    online: true,
    absent: false,
    ...over,
  })

  it('follows the patches: someone arrives', async () => {
    await joined()
    expect(screen.getByText('In the room: 1')).toBeInTheDocument()
    serverSays(patch(1, ['members', 'm2'], bo({ ready: true })))
    expect(screen.getByText('In the room: 2')).toBeInTheDocument()
    const row = screen.getByText('Bo').closest('li') as HTMLElement
    expect(within(row).getByText(en['room.waiting.badge.ready'])).toBeInTheDocument()
  })

  it('sends what the buttons say', async () => {
    await joined()
    const sent = () => FakeWebSocket.last.sent.map((data) => JSON.parse(data)).slice(1)
    fireEvent.click(screen.getByRole('button', { name: en['room.waiting.ready'] }))
    fireEvent.click(screen.getByRole('button', { name: en['room.waiting.standUp'] }))
    expect(sent()).toEqual([
      { t: 'ready', ready: true },
      { t: 'sit', seat: null },
    ])
  })

  it('starts only once enough are seated', async () => {
    await joined()
    expect(startButton()).toBeDisabled()
    serverSays(patch(1, ['members', 'm2'], bo()))
    expect(startButton()).toBeEnabled()
    fireEvent.click(startButton())
    expect(JSON.parse(FakeWebSocket.last.sent.at(-1) as string)).toEqual({ t: 'start' })
  })

  it('leaves the waiting room once the game is on', async () => {
    await joined()
    serverSays(patch(1, ['room', 'status'], 'playing'))
    expect(screen.getByRole('status')).toHaveTextContent(en['room.inProgress'])
    expect(screen.queryByRole('heading', { name: en['room.waiting.seats'] })).toBeNull()
    expect(backLink()).toBeInTheDocument()
  })

  it('tells of a refusal in a toast and stays in the room', async () => {
    await joined()
    serverSays(JSON.stringify({ t: 'error', code: 'seat_taken' }))
    expect(screen.getByText(en['room.error.seat_taken'])).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: en['room.waiting.seats'] })).toBeInTheDocument()
  })
})

describe('outside the waiting room', () => {
  const patch = (rev: number, path: string[], value: unknown) =>
    JSON.stringify({ t: 'patch', rev, ops: [{ op: 'set', path, value }] })
  const lastSent = () => JSON.parse(FakeWebSocket.last.sent.at(-1) as string)
  const button = (name: string) => screen.queryByRole('button', { name })
  const confirm = (title: string, name: string) =>
    fireEvent.click(
      within(screen.getByRole('dialog', { name: title })).getByRole('button', { name }),
    )

  /** Host or not, with `others` further seated members, the room in `status`; returns the next rev */
  async function inStatus(status: 'playing' | 'ended', { host = true, others = 1 } = {}) {
    await joined({ host })
    let rev = 1
    for (let i = 0; i < others; i++) {
      serverSays(
        patch(rev++, ['members', `m${i + 2}`], {
          id: `m${i + 2}`,
          name: i === 0 ? 'Bo' : `Other ${i}`,
          seat: i + 1,
          ready: false,
          host: false,
          online: true,
          absent: false,
        }),
      )
    }
    serverSays(patch(rev++, ['room', 'status'], status))
    FakeWebSocket.last.sent.length = 0
    return rev
  }

  describe.each(['playing', 'ended'] as const)('%s', (status) => {
    it('lists the members in seat order', async () => {
      await inStatus(status)
      const list = within(screen.getByRole('list')).getAllByRole('listitem')
      expect(list[0]).toHaveTextContent('Seat 1')
      expect(list[0]).toHaveTextContent('Al')
      expect(list[1]).toHaveTextContent('Seat 2')
      expect(list[1]).toHaveTextContent('Bo')
    })

    it('keeps the host’s row controls, behind their confirmations', async () => {
      await inStatus(status)
      expect(button('Make host: Bo')).toBeInTheDocument()
      fireEvent.click(button('Kick Bo')!)
      expect(FakeWebSocket.last.sent).toEqual([])
      confirm('Kick Bo?', 'Kick')
      expect(lastSent()).toEqual({ t: 'kick', member: 'm2' })
    })

    it('gives everyone else no row controls', async () => {
      await inStatus(status, { host: false })
      expect(button('Kick Bo')).toBeNull()
      expect(button('Make host: Bo')).toBeNull()
    })

    it('lets the host dissolve, after confirming', async () => {
      await inStatus(status)
      fireEvent.click(button('Dissolve room')!)
      expect(FakeWebSocket.last.sent).toEqual([])
      confirm('Dissolve this room?', 'Dissolve room')
      expect(lastSent()).toEqual({ t: 'dissolve' })
    })

    it('does not let anyone else dissolve', async () => {
      await inStatus(status, { host: false })
      expect(button('Dissolve room')).toBeNull()
    })
  })

  describe('playing', () => {
    it('keeps the placeholder text, and the host ends the game after confirming', async () => {
      await inStatus('playing')
      expect(screen.getByRole('status')).toHaveTextContent(en['room.inProgress'])

      fireEvent.click(button('End game')!)
      expect(FakeWebSocket.last.sent).toEqual([])
      confirm('End this game?', 'End game')
      expect(lastSent()).toEqual({ t: 'reopen' })
    })

    it('offers no rematch and no way back without ending the game', async () => {
      await inStatus('playing')
      expect(button('Rematch')).toBeNull()
      expect(button('Back to waiting room')).toBeNull()
    })

    it('does not let anyone else end the game', async () => {
      await inStatus('playing', { host: false })
      expect(screen.getByRole('status')).toHaveTextContent(en['room.inProgress'])
      expect(button('End game')).toBeNull()
    })

    it('drops an open End game when the game ends by itself, sending nothing', async () => {
      const rev = await inStatus('playing')
      fireEvent.click(button('End game')!)
      serverSays(patch(rev, ['room', 'status'], 'ended'))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(FakeWebSocket.last.sent).toEqual([])
    })
  })

  describe('ended', () => {
    it('says so in its own words, not as still in progress', async () => {
      await inStatus('ended', { host: false })
      expect(screen.getByRole('status')).toHaveTextContent(en['room.ended.waitForHost'])
      expect(screen.queryByText(en['room.inProgress'])).toBeNull()
    })

    it('gives the host a rematch, at once', async () => {
      await inStatus('ended')
      expect(screen.getByRole('status')).toHaveTextContent(en['room.ended.host'])
      fireEvent.click(button('Rematch')!)
      expect(lastSent()).toEqual({ t: 'rematch' })
    })

    it('disables the rematch with a hint below the minimum', async () => {
      await inStatus('ended', { others: 0 })
      expect(button('Rematch')).toBeDisabled()
      const hint = screen.getByText('Need at least 2 seated players to start')
      expect(button('Rematch')).toHaveAttribute('aria-describedby', hint.id)
    })

    it('goes back to the waiting room', async () => {
      await inStatus('ended')
      fireEvent.click(button('Back to waiting room')!)
      expect(lastSent()).toEqual({ t: 'reopen' })
    })

    it('gives everyone else neither', async () => {
      await inStatus('ended', { host: false })
      expect(button('Rematch')).toBeNull()
      expect(button('Back to waiting room')).toBeNull()
    })
  })

  describe('countdowns', () => {
    it('shows what is running, and stops showing it', async () => {
      await inStatus('playing')
      expect(screen.queryByRole('timer')).toBeNull()

      serverSays(
        JSON.stringify({
          t: 'timer',
          timers: [{ id: 'turn', remainingMs: 5_000, totalMs: 30_000 }],
        }),
      )
      expect(screen.getByRole('timer')).toHaveTextContent(/^5s/)

      serverSays(JSON.stringify({ t: 'timer', timers: [] }))
      expect(screen.queryByRole('timer')).toBeNull()
    })
  })
})

describe('host controls in the waiting room, over the wire', () => {
  const lastSent = () => JSON.parse(FakeWebSocket.last.sent.at(-1) as string)

  it('sends options from the form', async () => {
    await joined()
    const limit = screen.getByRole('spinbutton')
    fireEvent.change(limit, { target: { value: '77' } })
    fireEvent.blur(limit)
    expect(lastSent()).toEqual({
      t: 'set_options',
      options: { dice: 'four-sided', turnLimit: 77 },
    })
  })

  it('sends dissolve only after the confirmation', async () => {
    await joined()
    const before = FakeWebSocket.last.sent.length
    fireEvent.click(screen.getByRole('button', { name: 'Dissolve room' }))
    expect(FakeWebSocket.last.sent).toHaveLength(before)
    const dialog = screen.getByRole('dialog', { name: 'Dissolve this room?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dissolve room' }))
    expect(lastSent()).toEqual({ t: 'dissolve' })
  })
})

describe('losing the connection', () => {
  const banner = () => screen.queryByText(en['room.reconnecting'])

  async function droppedRoom() {
    await joined()
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    serverCloses(1006)
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('has no banner while connected', async () => {
    await joined()
    expect(banner()).toBeNull()
  })

  it('keeps showing the room under a polite banner', async () => {
    await droppedRoom()
    expect(banner()!.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Al')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('tells that a button did nothing while reconnecting', async () => {
    await droppedRoom()
    fireEvent.click(screen.getByRole('button', { name: en['room.waiting.ready'] }))
    expect(screen.getByText(en['room.reconnecting.notSent'])).toBeInTheDocument()
  })

  it('comes back as the same member, and the banner goes', async () => {
    await droppedRoom()
    act(() => vi.advanceTimersByTime(1_000))
    expect(FakeWebSocket.instances).toHaveLength(2)
    socketOpens()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])

    serverSays(welcome({}))

    expect(banner()).toBeNull()
    expect(screen.getAllByText('Al')).toHaveLength(1)
  })

  it('shows not found when the room is gone by the time it tries again', async () => {
    await droppedRoom()
    act(() => vi.advanceTimersByTime(1_000))
    serverCloses(CloseCode.roomNotFound)
    expect(screen.getByRole('heading', { name: 'Room not found' })).toBeInTheDocument()
    expect(retryButton()).toBeNull()
  })

  it('after giving up shows disconnected with Retry', async () => {
    await droppedRoom()
    for (let i = 0; i < 20 && !retryButton(); i++) {
      act(() => vi.advanceTimersByTime(30_000))
      serverCloses(1006)
    }
    expect(screen.getByRole('alert')).toHaveTextContent('Disconnected from the room.')
    expect(banner()).toBeNull()

    fireEvent.click(retryButton()!)

    socketOpens()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  it('leaves nothing running on leaving the page mid-backoff', async () => {
    await droppedRoom()
    const opened = FakeWebSocket.instances.length
    fireEvent.click(backLink())
    expect(screen.getByText('the lobby')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(600_000))

    expect(FakeWebSocket.instances).toHaveLength(opened)
  })
})

describe('in a room with a game, over the wire', () => {
  const patch = (rev: number, path: string[], value: unknown) =>
    JSON.stringify({ t: 'patch', rev, ops: [{ op: 'set', path, value }] })
  const lastSent = () => JSON.parse(FakeWebSocket.last.sent.at(-1) as string)

  it('sends a spectator’s sit while ended', async () => {
    await joined({ seat: null })
    serverSays(patch(1, ['room', 'status'], 'ended'))
    fireEvent.click(screen.getByRole('button', { name: 'Sit in seat 3' }))
    expect(lastSent()).toEqual({ t: 'sit', seat: 2 })
  })

  it('sends the host’s cover', async () => {
    await joined()
    serverSays(patch(1, ['room', 'status'], 'playing'))
    serverSays(patch(2, ['coverable'], [{ seat: 1, skip: true, proxy: true }]))
    fireEvent.click(screen.getByRole('button', { name: "Skip seat 2's turn" }))
    expect(lastSent()).toEqual({ t: 'cover', seat: 1, how: 'skip' })
  })

  it('tells a host whose cover came too late why, in a toast', async () => {
    await joined()
    serverSays(JSON.stringify({ t: 'error', code: 'cannot_cover' }))
    expect(screen.getByText(en['room.error.cannot_cover'])).toBeInTheDocument()
  })
})

describe('closes', () => {
  async function closedBeforeWelcome(code: number) {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom()
    await summaryLoaded()
    socketOpens()
    serverCloses(code)
  }

  it('version mismatch: reload, no retry', async () => {
    await closedBeforeWelcome(CloseCode.versionMismatch)
    expect(screen.getByRole('alert')).toHaveTextContent('Reload the page')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
  })

  it('room not found', async () => {
    await closedBeforeWelcome(CloseCode.roomNotFound)
    expect(screen.getByRole('heading', { name: 'Room not found' })).toBeInTheDocument()
    expect(backLink()).toBeInTheDocument()
  })

  it('room full: no retry', async () => {
    await closedBeforeWelcome(CloseCode.roomFull)
    expect(screen.getByRole('alert')).toHaveTextContent('This room is full.')
    expect(retryButton()).not.toBeInTheDocument()
    expect(backLink()).toBeInTheDocument()
  })

  it.each([1006, CloseCode.stale, CloseCode.badMessage])(
    'anything else before welcome (%i): connection lost, retry opens one new socket',
    async (code) => {
      await closedBeforeWelcome(code)
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't connect to the room.")
      expect(FakeWebSocket.instances).toHaveLength(1)

      fireEvent.click(retryButton()!)

      expect(FakeWebSocket.instances).toHaveLength(2)
      expect(screen.getByRole('status')).toHaveTextContent('Joining…')
      socketOpens()
      expect(FakeWebSocket.last.joins).toHaveLength(1)
    },
  )

  it('a protocol error after welcome: disconnected, retry comes back with the token', async () => {
    await joined()
    serverCloses(CloseCode.badMessage)
    expect(screen.getByRole('alert')).toHaveTextContent('Disconnected from the room.')
    expect(FakeWebSocket.instances).toHaveLength(1)

    fireEvent.click(retryButton()!)

    socketOpens()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  describe.each([
    ['kicked', CloseCode.kicked, 'The host removed you'],
    ['dissolved', CloseCode.dissolved, 'closed this room'],
  ])('%s', (_, code, text) => {
    it('after welcome: says so, with the lobby link and no retry', async () => {
      await joined()
      serverCloses(code)
      expect(screen.getByRole('alert')).toHaveTextContent(text)
      expect(retryButton()).not.toBeInTheDocument()
      expect(backLink()).toBeInTheDocument()
      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('before welcome: says the same', async () => {
      await closedBeforeWelcome(code)
      expect(screen.getByRole('alert')).toHaveTextContent(text)
      expect(retryButton()).not.toBeInTheDocument()
      expect(backLink()).toBeInTheDocument()
    })
  })

  it('kicked: keeps the seat token for the ban to recognise', async () => {
    await joined()
    serverCloses(CloseCode.kicked)
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_A)
  })

  it('replaced: another tab has it, and nothing retries', async () => {
    await joined()
    serverCloses(CloseCode.replaced)
    expect(screen.getByRole('alert')).toHaveTextContent('opened in another tab')
    expect(retryButton()).not.toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})

describe('chat', () => {
  const chatBox = () => screen.getByRole('textbox', { name: en['chat.inputLabel'] })
  const chatLog = () => screen.getByRole('log', { name: en['chat.messages'] })
  const game = (chatLocked: boolean) => ({
    view: {
      players: [{ seat: 0, cell: 'baiding', rolls: 0, demotions: 0 }],
      turn: 0,
      first: 0,
      round: 1,
      turnLimit: 60,
      dice: 'four-sided',
      last: null,
      ending: null,
      winner: null,
      you: 0,
    },
    legal: [],
    over: false,
    result: null,
    chatLocked,
  })
  const statusPatch = (rev: number, status: string, chatLocked = false) =>
    JSON.stringify({
      t: 'patch',
      rev,
      ops: [
        { op: 'set', path: ['room', 'status'], value: status },
        { op: 'set', path: ['game'], value: game(chatLocked) },
      ],
    })

  it('shows while waiting, playing and ended', async () => {
    await joined()
    expect(chatLog()).toBeInTheDocument()

    serverSays(statusPatch(1, 'playing'))
    expect(chatLog()).toBeInTheDocument()

    serverSays(statusPatch(2, 'ended'))
    expect(chatLog()).toBeInTheDocument()
  })

  it('a spectator can read and write too', async () => {
    await joined({ seat: null, host: false })
    serverSays(
      JSON.stringify({
        t: 'chat',
        messages: [{ id: 1, from: 'm2', name: 'Bo', text: 'hello all', at: 5 }],
        reset: true,
      }),
    )
    expect(within(chatLog()).getByText('hello all')).toBeInTheDocument()
    expect(chatBox()).toBeEnabled()
  })

  it('is not there before joining', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom()
    await summaryLoaded()
    expect(screen.queryByRole('log')).toBeNull()
  })

  it('locks and unlocks as the game says', async () => {
    await joined()
    serverSays(statusPatch(1, 'playing', true))
    expect(chatBox()).toBeDisabled()

    serverSays(statusPatch(2, 'playing', false))
    expect(chatBox()).toBeEnabled()
  })

  it('sends, clears when the room answers, marks it as yours', async () => {
    await joined()
    fireEvent.change(chatBox(), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: en['chat.send'] }))
    await act(async () => {})

    const sent = FakeWebSocket.last.sent.at(-1)
    expect(sent).toBe(JSON.stringify({ t: 'chat', text: 'hi' }))
    expect(chatBox()).toHaveValue('')

    serverSays(
      JSON.stringify({
        t: 'chat',
        messages: [{ id: 1, from: 'm1', name: 'Al', text: 'hi', at: 5 }],
      }),
    )
    await act(async () => {})

    expect(within(chatLog()).getByRole('listitem')).toHaveTextContent(en['chat.you'])
    expect(chatBox()).toHaveValue('')
  })

  it('puts a refused message back in the box, explained there and not as a toast too', async () => {
    await joined()
    fireEvent.change(chatBox(), { target: { value: 'too soon' } })
    fireEvent.click(screen.getByRole('button', { name: en['chat.send'] }))

    serverSays(JSON.stringify({ t: 'error', code: 'rate_limited' }))
    await act(async () => {})

    expect(chatBox()).toHaveValue('too soon')
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(en['room.error.rate_limited'])
  })

  it('keeps unsent text across a connection that ends and the retry', async () => {
    await joined()
    fireEvent.change(chatBox(), { target: { value: 'half a thought' } })

    serverCloses(CloseCode.badMessage)
    fireEvent.click(retryButton() as HTMLElement)
    socketOpens()
    serverSays(welcome({}))

    expect(chatBox()).toHaveValue('half a thought')
  })

  describe('through a reconnect', () => {
    async function comeBack() {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      socketOpens()
      serverSays(welcome({}))
    }

    beforeEach(async () => {
      await joined()
      vi.useFakeTimers()
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('keeps what is being typed, in the same box', async () => {
      const box = chatBox()
      fireEvent.change(box, { target: { value: 'half a thought' } })
      serverCloses(1006)
      await comeBack()
      expect(chatBox()).toBe(box)
      expect(box).toHaveValue('half a thought')
    })

    it('gives back a message lost with the socket, once it is clear no answer is coming', async () => {
      fireEvent.change(chatBox(), { target: { value: 'lost at sea' } })
      fireEvent.click(screen.getByRole('button', { name: en['chat.send'] }))
      await act(async () => {})
      expect(chatBox()).toHaveValue('')

      serverCloses(1006)
      await comeBack()
      serverSays(JSON.stringify({ t: 'chat', reset: true, messages: [] }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_ACK_TIMEOUT_MS)
      })

      expect(chatBox()).toHaveValue('lost at sea')
    })

    it('does not give back a message the history shows got through', async () => {
      fireEvent.change(chatBox(), { target: { value: 'made it' } })
      fireEvent.click(screen.getByRole('button', { name: en['chat.send'] }))
      await act(async () => {})

      serverCloses(1006)
      await comeBack()
      serverSays(
        JSON.stringify({
          t: 'chat',
          reset: true,
          messages: [{ id: 1, from: 'm1', name: 'Al', text: 'made it', at: 1 }],
        }),
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CHAT_ACK_TIMEOUT_MS)
      })

      expect(chatBox()).toHaveValue('')
    })
  })
})
