import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatchOp } from '../../shared/patch.ts'
import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  roomSocketPath,
  type RoomView,
} from '../../shared/protocol.ts'
import { connectRoom, type RoomHandlers } from '../../src/lib/roomConnection.ts'
import { FakeWebSocket, TOKEN_A, TOKEN_B, welcome } from './fakeWebSocket.ts'

const ROOM = 'abcdefghij'
const SEAT_KEY = `tku-arcade.seat.${ROOM}`

function handlers() {
  return { onView: vi.fn(), onError: vi.fn(), onEnd: vi.fn() } satisfies RoomHandlers
}

/** Connected and welcomed at rev 0; the handlers have heard nothing yet */
function welcomed() {
  const h = handlers()
  const connection = connectRoom(ROOM, 'Al', h)
  const socket = FakeWebSocket.last
  socket.open()
  socket.receive(welcome({}))
  h.onView.mockClear()
  socket.sent.length = 0
  return { h, connection, socket }
}

const READY: PatchOp = { op: 'set', path: ['members', 'm1', 'ready'], value: true }
const patch = (rev: number, ops: PatchOp[] = [READY]) => JSON.stringify({ t: 'patch', rev, ops })
const lastView = (h: ReturnType<typeof handlers>) => h.onView.mock.lastCall?.[1] as RoomView

beforeEach(() => {
  localStorage.clear()
  FakeWebSocket.install()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('joining', () => {
  it('opens the room socket on this host, ws: on http', () => {
    connectRoom(ROOM, 'Al', handlers())
    expect(FakeWebSocket.last.url).toBe(`ws://${window.location.host}${roomSocketPath(ROOM)}`)
  })

  it('sends nothing until open, then join with the name and no token', () => {
    connectRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    expect(socket.sent).toEqual([])

    socket.open()

    expect(socket.joins).toEqual([{ t: 'join', name: 'Al', token: null }])
  })

  it('sends the token this room gave last time, and not another room’s', () => {
    localStorage.setItem(SEAT_KEY, TOKEN_A)
    localStorage.setItem('tku-arcade.seat.zzzzzzzzzz', TOKEN_B)
    connectRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.open()
    expect(FakeWebSocket.last.joins[0].token).toBe(TOKEN_A)
  })

  it('treats a malformed stored token as none', () => {
    localStorage.setItem(SEAT_KEY, 'not-a-token')
    connectRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.open()
    expect(FakeWebSocket.last.joins[0].token).toBeNull()
  })

  it('reports who this is and the room, and saves the token per room', () => {
    const h = handlers()
    connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()

    socket.receive(welcome({ id: 'me', name: 'Al (2)', seat: 3 }, { token: TOKEN_B, others: 1 }))

    expect(h.onView).toHaveBeenCalledOnce()
    const [you, view] = h.onView.mock.calls[0] as [string, RoomView]
    expect(you).toBe('me')
    expect(view.members.me).toMatchObject({ name: 'Al (2)', seat: 3 })
    expect(Object.keys(view.members)).toHaveLength(2)
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_B)
    // The nickname is what the person typed, not the name the room made of it
    expect(localStorage.getItem('tku-arcade.nickname')).toBeNull()
  })

  it('ignores pong, junk, and what later batches handle', () => {
    const h = handlers()
    connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()

    socket.receive('pong')
    socket.receive('not json')
    socket.receive(new ArrayBuffer(1))
    socket.receive(JSON.stringify({ t: 'timer', timers: [] }))
    socket.receive(JSON.stringify({ t: 'chat', messages: [] }))

    expect(h.onView).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
    expect(socket.closedByClient).toBe(false)
  })

  it('ignores a patch or snapshot before welcome', () => {
    const h = handlers()
    connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    socket.sent.length = 0

    socket.receive(patch(1))
    socket.receive(
      JSON.stringify({ t: 'snapshot', rev: 1, state: { room: {}, members: {}, game: null } }),
    )

    expect(h.onView).not.toHaveBeenCalled()
    expect(socket.sent).toEqual([])
  })

  it('sends a heartbeat every interval while open, and stops when it closes', () => {
    vi.useFakeTimers()
    connectRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    const pings = () => socket.sent.filter((data) => data === 'ping')

    // Not before open: send() throws on a connecting socket
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2)
    expect(socket.sent).toEqual([])

    socket.open()
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1)
    expect(pings()).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(pings()).toHaveLength(1)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    expect(pings()).toHaveLength(2)

    socket.serverClose(1006)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3)
    expect(pings()).toHaveLength(2)
  })
})

describe('keeping the view', () => {
  it('applies the next patch and moves on', () => {
    const { h, socket } = welcomed()

    socket.receive(patch(1))
    expect(h.onView).toHaveBeenCalledOnce()
    expect(lastView(h).members.m1.ready).toBe(true)

    socket.receive(patch(2, [{ op: 'set', path: ['room', 'status'], value: 'playing' }]))
    expect(lastView(h).room.status).toBe('playing')
    // Still there: the second patch built on the first
    expect(lastView(h).members.m1.ready).toBe(true)
    expect(socket.sent).toEqual([])
  })

  it('moves rev on for an empty patch without telling anyone', () => {
    const { h, socket } = welcomed()

    socket.receive(patch(1, []))
    expect(h.onView).not.toHaveBeenCalled()

    socket.receive(patch(2))
    expect(h.onView).toHaveBeenCalledOnce()
    expect(socket.sent).toEqual([])
  })

  it('ignores a patch it already has', () => {
    const { h, socket } = welcomed()
    socket.receive(patch(1))
    h.onView.mockClear()

    socket.receive(patch(1, [{ op: 'set', path: ['room', 'status'], value: 'ended' }]))
    socket.receive(patch(0))

    expect(h.onView).not.toHaveBeenCalled()
    expect(socket.sent).toEqual([])
  })

  it('on a gap asks once for a snapshot, drops patches until then, and carries on from it', () => {
    const { h, socket } = welcomed()

    socket.receive(patch(2))
    socket.receive(patch(3))
    expect(socket.sent).toEqual([JSON.stringify({ t: 'resync' })])
    expect(h.onView).not.toHaveBeenCalled()

    const state = JSON.parse(welcome({ name: 'Fresh' })).state as RoomView
    socket.receive(JSON.stringify({ t: 'snapshot', rev: 3, state }))
    expect(lastView(h).members.m1.name).toBe('Fresh')

    socket.receive(patch(4))
    expect(lastView(h).members.m1).toMatchObject({ name: 'Fresh', ready: true })
    expect(socket.sent).toHaveLength(1)
  })

  it('treats a patch that cannot be applied like a gap', () => {
    const { h, socket } = welcomed()

    socket.receive(patch(1, [{ op: 'set', path: ['__proto__', 'x'], value: 1 }]))

    expect(socket.sent).toEqual([JSON.stringify({ t: 'resync' })])
    expect(h.onView).not.toHaveBeenCalled()
  })

  it('passes on refusals', () => {
    const { h, socket } = welcomed()
    socket.receive(JSON.stringify({ t: 'error', code: 'seat_taken' }))
    expect(h.onError).toHaveBeenCalledExactlyOnceWith({ t: 'error', code: 'seat_taken' })
  })
})

describe('sending', () => {
  it('does nothing before welcome', () => {
    const connection = connectRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    socket.open()
    socket.sent.length = 0

    connection.send({ t: 'start' })

    expect(socket.sent).toEqual([])
  })

  it('sends after welcome', () => {
    const { connection, socket } = welcomed()
    connection.send({ t: 'start' })
    expect(socket.sent).toEqual([JSON.stringify({ t: 'start' })])
  })

  it('does nothing after the end or after leaving', () => {
    const closed = welcomed()
    closed.socket.serverClose(1006)
    closed.connection.send({ t: 'start' })
    expect(closed.socket.sent).toEqual([])

    const left = welcomed()
    left.connection.leave()
    left.connection.send({ t: 'start' })
    expect(left.socket.sent).toEqual([])
  })

  it('does not throw when the socket is already closing', () => {
    const { connection, socket } = welcomed()
    socket.send = () => {
      throw new Error('InvalidStateError')
    }
    expect(() => connection.send({ t: 'start' })).not.toThrow()
  })
})

describe('leaving and closing', () => {
  it('stops the heartbeat and closes the socket on leaving', () => {
    vi.useFakeTimers()
    const { leave } = connectRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    socket.open()

    leave()

    expect(socket.closedByClient).toBe(true)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3)
    expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(0)
  })

  it('does not join from a socket it has already left (StrictMode’s first effect)', () => {
    const h = handlers()
    const { leave } = connectRoom(ROOM, 'Al', h)
    const stale = FakeWebSocket.last
    leave()
    connectRoom(ROOM, 'Al', h)
    const fresh = FakeWebSocket.last

    stale.open()
    fresh.open()

    expect(stale.sent).toEqual([])
    expect(fresh.joins).toHaveLength(1)
  })

  it('hears nothing more from a socket it has left', () => {
    const h = handlers()
    const { leave } = connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    leave()

    socket.receive(welcome({}))
    socket.receive(JSON.stringify({ t: 'error', code: 'forbidden' }))
    socket.serverClose(CloseCode.roomFull)

    expect(h.onView).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
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
    connectRoom(ROOM, 'Al', h)
    FakeWebSocket.last.serverClose(code)
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
  })

  it.each([
    [1006, 'disconnected'],
    [CloseCode.stale, 'disconnected'],
    [CloseCode.roomNotFound, 'disconnected'],
    [CloseCode.replaced, 'replaced'],
  ])('reads close %i after welcome as %s', (code, end) => {
    const { h, socket } = welcomed()
    socket.serverClose(code)
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
  })

  it('opens no new socket by itself after a close', () => {
    connectRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.serverClose(1006)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
