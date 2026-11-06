import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloseCode, HEARTBEAT_INTERVAL_MS, roomSocketPath } from '../../shared/protocol.ts'
import { joinRoom, type JoinHandlers } from '../../src/lib/joinRoom.ts'
import { FakeWebSocket, TOKEN_A, TOKEN_B, welcome } from './fakeWebSocket.ts'

const ROOM = 'abcdefghij'
const SEAT_KEY = `tku-arcade.seat.${ROOM}`

function handlers() {
  return { onWelcome: vi.fn(), onEnd: vi.fn() } satisfies JoinHandlers
}

beforeEach(() => {
  localStorage.clear()
  FakeWebSocket.install()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('joinRoom', () => {
  it('opens the room socket on this host, ws: on http', () => {
    joinRoom(ROOM, 'Al', handlers())
    expect(FakeWebSocket.last.url).toBe(`ws://${window.location.host}${roomSocketPath(ROOM)}`)
  })

  it('sends nothing until open, then join with the name and no token', () => {
    joinRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    expect(socket.sent).toEqual([])

    socket.open()

    expect(socket.joins).toEqual([{ t: 'join', name: 'Al', token: null }])
  })

  it('sends the token this room gave last time, and not another room’s', () => {
    localStorage.setItem(SEAT_KEY, TOKEN_A)
    localStorage.setItem('tku-arcade.seat.zzzzzzzzzz', TOKEN_B)
    joinRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.open()
    expect(FakeWebSocket.last.joins[0].token).toBe(TOKEN_A)
  })

  it('treats a malformed stored token as none', () => {
    localStorage.setItem(SEAT_KEY, 'not-a-token')
    joinRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.open()
    expect(FakeWebSocket.last.joins[0].token).toBeNull()
  })

  it('reports the server’s name, seat and member count, and saves the token per room', () => {
    const h = handlers()
    joinRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()

    socket.receive(welcome({ name: 'Al (2)', seat: 3 }, { token: TOKEN_B, others: 1 }))

    expect(h.onWelcome).toHaveBeenCalledExactlyOnceWith({ name: 'Al (2)', seat: 3, members: 2 })
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_B)
    // The nickname is what the person typed, not the name the room made of it
    expect(localStorage.getItem('tku-arcade.nickname')).toBeNull()
  })

  it('reports a spectator as having no seat', () => {
    const h = handlers()
    joinRoom(ROOM, 'Al', h)
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(welcome({ seat: null }))
    expect(h.onWelcome).toHaveBeenCalledWith({ name: 'Al', seat: null, members: 1 })
  })

  it('ignores pong, junk and anything other than welcome', () => {
    const h = handlers()
    joinRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()

    socket.receive('pong')
    socket.receive('not json')
    socket.receive(new ArrayBuffer(1))
    socket.receive(JSON.stringify({ t: 'timer', timers: [] }))

    expect(h.onWelcome).not.toHaveBeenCalled()
    expect(socket.closedByClient).toBe(false)
  })

  it('sends a heartbeat every interval while open, and stops when it closes', () => {
    vi.useFakeTimers()
    joinRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last

    // Not before open: send() throws on a connecting socket
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2)
    expect(socket.sent).toEqual([])

    socket.open()
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(1)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(2)

    socket.serverClose(1006)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(2)
  })

  it('stops the heartbeat and closes the socket on leaving', () => {
    vi.useFakeTimers()
    const leave = joinRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    socket.open()

    leave()

    expect(socket.closedByClient).toBe(true)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(0)
  })

  it('does not join from a socket it has already left (StrictMode’s first effect)', () => {
    const h = handlers()
    const leave = joinRoom(ROOM, 'Al', h)
    const stale = FakeWebSocket.last
    leave()
    joinRoom(ROOM, 'Al', h)
    const fresh = FakeWebSocket.last

    stale.open()
    fresh.open()

    expect(stale.sent).toEqual([])
    expect(fresh.joins).toHaveLength(1)
  })

  it('hears nothing more from a socket it has left', () => {
    const h = handlers()
    const leave = joinRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    leave()

    socket.receive(welcome({}))
    socket.serverClose(CloseCode.roomFull)

    expect(h.onWelcome).not.toHaveBeenCalled()
    expect(h.onEnd).not.toHaveBeenCalled()
    expect(localStorage.getItem(SEAT_KEY)).toBeNull()
  })

  it.each([
    [CloseCode.versionMismatch, 'versionMismatch'],
    [CloseCode.roomNotFound, 'notFound'],
    [CloseCode.roomFull, 'full'],
    [CloseCode.stale, 'connectionLost'],
    [CloseCode.badMessage, 'connectionLost'],
    [1006, 'connectionLost'],
  ])('reads close %i before welcome as %s', (code, end) => {
    const h = handlers()
    joinRoom(ROOM, 'Al', h)
    FakeWebSocket.last.serverClose(code)
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
  })

  it.each([
    [1006, 'disconnected'],
    [CloseCode.stale, 'disconnected'],
    [CloseCode.roomNotFound, 'disconnected'],
    [CloseCode.replaced, 'replaced'],
  ])('reads close %i after welcome as %s', (code, end) => {
    const h = handlers()
    joinRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    socket.receive(welcome({}))
    socket.serverClose(code)
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
  })

  it('opens no new socket by itself after a close', () => {
    joinRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.serverClose(1006)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
