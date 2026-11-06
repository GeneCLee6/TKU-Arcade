import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloseCode, type RoomSummary } from '../../shared/protocol.ts'
import { initLanguage, setLanguage } from '../../src/i18n/t.ts'
import { RoomPage } from '../../src/pages/RoomPage.tsx'
import { FakeWebSocket, TOKEN_A, TOKEN_B, welcome } from '../lib/fakeWebSocket.ts'

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
    <MemoryRouter initialEntries={[`/r/${id}`]}>
      <Routes>
        <Route path="/" element={<p>the lobby</p>} />
        <Route path="/r/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>
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

  it('shows the server’s name, keeps the typed one, and saves the token', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubSummary()
    renderRoom()
    await summaryLoaded()
    socketOpens()

    serverSays(welcome({ name: 'Al (2)', seat: 1 }, { token: TOKEN_B }))

    expect(screen.getByText('You joined as Al (2)')).toBeInTheDocument()
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_B)
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('Al')
  })

  it('shows the seat counted from one', async () => {
    await joined({ seat: 2 })
    expect(screen.getByText('Your seat: 3')).toBeInTheDocument()
    expect(backLink()).toBeInTheDocument()
  })

  it('shows a spectator as one', async () => {
    await joined({ seat: null })
    expect(screen.getByText("You're spectating")).toBeInTheDocument()
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
    expect(screen.getByText('你以「Al」的名字加入')).toBeInTheDocument()
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
    expect(screen.getByText('You joined as Al')).toBeInTheDocument()
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

  it('after welcome: disconnected, and retry comes back with the token', async () => {
    await joined()
    serverCloses(1006)
    expect(screen.getByRole('alert')).toHaveTextContent('Disconnected from the room.')
    expect(FakeWebSocket.instances).toHaveLength(1)

    fireEvent.click(retryButton()!)

    socketOpens()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  it('replaced: another tab has it, and nothing retries', async () => {
    await joined()
    serverCloses(CloseCode.replaced)
    expect(screen.getByRole('alert')).toHaveTextContent('opened in another tab')
    expect(retryButton()).not.toBeInTheDocument()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
