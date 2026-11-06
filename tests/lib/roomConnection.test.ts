import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatchOp } from '../../shared/patch.ts'
import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  roomSocketPath,
  type RoomView,
} from '../../shared/protocol.ts'
import {
  connectRoom,
  reconnectDelay,
  RECONNECT_ATTEMPT_TIMEOUT_MS,
  RECONNECT_GIVE_UP_MS,
  type RoomConnection,
  type RoomHandlers,
} from '../../src/lib/roomConnection.ts'
import { FakeWebSocket, TOKEN_A, TOKEN_B, welcome } from './fakeWebSocket.ts'

const ROOM = 'abcdefghij'
const SEAT_KEY = `tku-arcade.seat.${ROOM}`

function handlers() {
  return {
    onView: vi.fn(),
    onReconnecting: vi.fn(),
    onError: vi.fn(),
    onTimers: vi.fn(),
    onEnd: vi.fn(),
  } satisfies RoomHandlers
}

// A connection left reconnecting would answer the next test's `online` event
const connected: RoomConnection[] = []

function connectAndTrack(roomId: string, h: RoomHandlers): RoomConnection {
  const connection = connectRoom(roomId, 'Al', h)
  connected.push(connection)
  return connection
}

/** Connected and welcomed at rev 0; the handlers have heard nothing yet */
function welcomed() {
  const h = handlers()
  const connection = connectAndTrack(ROOM, h)
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
  for (const connection of connected.splice(0)) connection.leave()
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
    socket.receive(JSON.stringify({ t: 'chat', messages: [] }))

    expect(h.onView).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
    expect(h.onTimers).not.toHaveBeenCalled()
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

describe('timers', () => {
  const timerMessage = (...timers: { id: string; remainingMs: number; totalMs: number }[]) =>
    JSON.stringify({ t: 'timer', timers })

  it('turns each duration into a deadline on this browser’s clock, from when it arrived', () => {
    vi.useFakeTimers()
    const { h, socket } = welcomed()
    vi.advanceTimersByTime(1_000)
    const arrived = performance.now()

    socket.receive(
      timerMessage(
        { id: 'turn', remainingMs: 4_000, totalMs: 30_000 },
        { id: 'clue', remainingMs: 500, totalMs: 500 },
      ),
    )

    expect(h.onTimers).toHaveBeenCalledExactlyOnceWith([
      { id: 'turn', deadline: arrived + 4_000, totalMs: 30_000 },
      { id: 'clue', deadline: arrived + 500, totalMs: 500 },
    ])
  })

  it('passes on an empty list: nothing is running any more', () => {
    const { h, socket } = welcomed()
    socket.receive(timerMessage())
    expect(h.onTimers).toHaveBeenCalledExactlyOnceWith([])
  })

  it('ignores them before welcome and after leaving', () => {
    const h = handlers()
    const { leave } = connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    socket.receive(timerMessage({ id: 'turn', remainingMs: 1_000, totalMs: 1_000 }))
    expect(h.onTimers).not.toHaveBeenCalled()

    socket.receive(welcome({}))
    leave()
    socket.receive(timerMessage({ id: 'turn', remainingMs: 1_000, totalMs: 1_000 }))
    expect(h.onTimers).not.toHaveBeenCalled()
  })
})

describe('sending', () => {
  it('does nothing before welcome', () => {
    const connection = connectRoom(ROOM, 'Al', handlers())
    const socket = FakeWebSocket.last
    socket.open()
    socket.sent.length = 0

    expect(connection.send({ t: 'start' })).toBe(false)

    expect(socket.sent).toEqual([])
  })

  it('sends after welcome', () => {
    const { connection, socket } = welcomed()
    expect(connection.send({ t: 'start' })).toBe(true)
    expect(socket.sent).toEqual([JSON.stringify({ t: 'start' })])
  })

  it('does nothing after the end or after leaving', () => {
    const closed = welcomed()
    closed.socket.serverClose(CloseCode.dissolved)
    expect(closed.connection.send({ t: 'start' })).toBe(false)
    expect(closed.socket.sent).toEqual([])

    const left = welcomed()
    left.connection.leave()
    expect(left.connection.send({ t: 'start' })).toBe(false)
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

describe('reconnecting', () => {
  /** Welcomed, then the socket drops. Math.random is 0: the delays have no jitter */
  function dropped(code = 1006) {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const room = welcomed()
    room.socket.serverClose(code)
    return room
  }

  const sockets = () => FakeWebSocket.instances.length
  const openSockets = () => FakeWebSocket.instances.filter((socket) => !socket.gone)
  /** The first attempt, its socket open and joined but not welcomed */
  function attempting() {
    const room = dropped()
    vi.advanceTimersByTime(1_000)
    const attempt = FakeWebSocket.last
    attempt.open()
    return { ...room, attempt }
  }

  const setVisibility = (state: DocumentVisibilityState) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([[1006], [1000], [CloseCode.stale]])('tries again after close %i', (code) => {
    const { h } = dropped(code)
    expect(h.onReconnecting).toHaveBeenCalledOnce()
    expect(h.onEnd).not.toHaveBeenCalled()
    expect(sockets()).toBe(1)

    vi.advanceTimersByTime(1_000)

    expect(sockets()).toBe(2)
    FakeWebSocket.last.open()
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  it('backs off 1, 2, 4, 8, 15, then 30 s, and stays at the cap', () => {
    dropped()
    for (const [i, delay] of [1, 2, 4, 8, 15, 30, 30, 30].entries()) {
      vi.advanceTimersByTime(delay * 1_000 - 1)
      expect(sockets()).toBe(i + 1)
      vi.advanceTimersByTime(1)
      expect(sockets()).toBe(i + 2)
      FakeWebSocket.last.serverClose(1006)
    }
  })

  it('jitters only downwards, so that the cap holds', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValue(0)
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(reconnectDelay)).toEqual([
      1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000,
    ])
    random.mockReturnValue(1)
    expect(reconnectDelay(0)).toBe(750)
    expect(reconnectDelay(9)).toBe(22_500)
  })

  it('reads a stale close during an attempt as one more failure', () => {
    const { h, attempt } = attempting()
    attempt.serverClose(CloseCode.stale)
    expect(h.onEnd).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(sockets()).toBe(3)
  })

  it('gives up after 5 minutes of failures, as disconnected, and stops', () => {
    const { h } = dropped()
    let waited = 0
    for (const delay of [1, 2, 4, 8, 15]) {
      vi.advanceTimersByTime(delay * 1_000)
      waited += delay * 1_000
      FakeWebSocket.last.serverClose(1006)
    }
    while (waited + 30_000 < RECONNECT_GIVE_UP_MS) {
      vi.advanceTimersByTime(30_000)
      waited += 30_000
      FakeWebSocket.last.serverClose(1006)
      expect(h.onEnd).not.toHaveBeenCalled()
    }

    vi.advanceTimersByTime(30_000)
    FakeWebSocket.last.serverClose(1006)

    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith('disconnected')
    expect(vi.getTimerCount()).toBe(0)
    const opened = sockets()
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(60_000)
    expect(sockets()).toBe(opened)
  })

  it('does not count a phone’s sleep as failing: it gets its attempt on waking', () => {
    const { h } = dropped()
    vi.setSystemTime(Date.now() + 60 * 60_000)

    window.dispatchEvent(new Event('online'))
    expect(h.onEnd).not.toHaveBeenCalled()
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(welcome({}))

    expect(h.onEnd).not.toHaveBeenCalled()
    expect(h.onView).toHaveBeenCalledOnce()
  })

  describe('when it comes back', () => {
    it('replaces the view and clears the timers before any new ones', () => {
      const { h, attempt } = attempting()
      h.onTimers.mockClear()

      attempt.receive(welcome({ name: 'Back' }))

      expect(h.onTimers).toHaveBeenCalledExactlyOnceWith([])
      expect(lastView(h).members.m1.name).toBe('Back')
      expect(h.onTimers.mock.invocationCallOrder[0]).toBeLessThan(
        h.onView.mock.invocationCallOrder[0],
      )
    })

    it('takes the timers that follow the welcome', () => {
      const { h, attempt } = attempting()
      attempt.receive(welcome({}))
      h.onTimers.mockClear()
      attempt.receive(
        JSON.stringify({
          t: 'timer',
          timers: [{ id: 'turn', remainingMs: 1_000, totalMs: 1_000 }],
        }),
      )
      expect(h.onTimers).toHaveBeenCalledExactlyOnceWith([
        { id: 'turn', deadline: expect.any(Number), totalMs: 1_000 },
      ])
    })

    it('counts rev from the new welcome, not from where it left off', () => {
      vi.useFakeTimers()
      const { h, socket } = welcomed()
      socket.receive(patch(1))
      socket.receive(patch(2, [{ op: 'set', path: ['members', 'm1', 'ready'], value: false }]))
      socket.serverClose(1006)
      vi.advanceTimersByTime(1_000)
      const next = FakeWebSocket.last
      next.open()
      next.receive(welcome({}))
      next.sent.length = 0
      h.onView.mockClear()

      next.receive(patch(1))

      expect(lastView(h).members.m1.ready).toBe(true)
      // Not taken for a gap
      expect(next.sent).toEqual([])
    })

    it('keeps the new token', () => {
      const { attempt } = attempting()
      attempt.receive(welcome({}, { token: TOKEN_B }))
      expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_B)
    })

    it('leaves nothing waiting, and a later drop starts over from 1 s', () => {
      const { h, attempt } = attempting()
      attempt.receive(welcome({}))
      attempt.sent.length = 0

      // Only the heartbeat is left
      expect(vi.getTimerCount()).toBe(1)
      attempt.serverClose(1006)
      expect(h.onReconnecting).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(999)
      expect(sockets()).toBe(2)
      vi.advanceTimersByTime(1)
      expect(sockets()).toBe(3)
    })

    it('starts the 5 minutes over after a later drop', () => {
      const { h, attempt } = attempting()
      vi.advanceTimersByTime(RECONNECT_ATTEMPT_TIMEOUT_MS - 1)
      attempt.receive(welcome({}))
      vi.setSystemTime(Date.now() + 60 * 60_000)

      attempt.serverClose(1006)
      vi.advanceTimersByTime(1_000)
      FakeWebSocket.last.serverClose(1006)

      expect(h.onEnd).not.toHaveBeenCalled()
    })

    it('hears nothing more from the old socket', () => {
      const { h, socket, attempt } = attempting()
      attempt.receive(welcome({}))
      h.onView.mockClear()

      socket.receive(patch(1))
      socket.serverClose(CloseCode.replaced)

      expect(h.onView).not.toHaveBeenCalled()
      expect(h.onEnd).not.toHaveBeenCalled()
    })
  })

  describe('at once on coming back', () => {
    it.each([
      ['online', () => window.dispatchEvent(new Event('online'))],
      ['visible', () => setVisibility('visible')],
    ])('%s: attempts now, and the wait it replaced opens no second socket', (_, wake) => {
      dropped()
      wake()
      expect(sockets()).toBe(2)
      FakeWebSocket.last.open()
      FakeWebSocket.last.receive(welcome({}))

      vi.advanceTimersByTime(60_000)

      expect(sockets()).toBe(2)
    })

    it.each([
      ['online', () => window.dispatchEvent(new Event('online'))],
      ['visible', () => setVisibility('visible')],
    ])('%s: an attempt under way will do', (_, wake) => {
      const { attempt } = attempting()
      wake()
      wake()
      expect(sockets()).toBe(2)
      expect(attempt.gone).toBe(false)
    })

    it('fires on two events in a row just once', () => {
      dropped()
      window.dispatchEvent(new Event('online'))
      setVisibility('visible')
      expect(sockets()).toBe(2)
    })

    it('does not fire when the page is hidden', () => {
      dropped()
      setVisibility('hidden')
      expect(sockets()).toBe(1)
    })

    it('starts the backoff over if that attempt fails too', () => {
      dropped()
      vi.advanceTimersByTime(1_000)
      FakeWebSocket.last.serverClose(1006)
      vi.advanceTimersByTime(2_000)
      FakeWebSocket.last.serverClose(1006)

      window.dispatchEvent(new Event('online'))
      FakeWebSocket.last.serverClose(1006)
      const before = sockets()
      vi.advanceTimersByTime(1_000)

      expect(sockets()).toBe(before + 1)
    })

    it('ignores those events while connected', () => {
      vi.useFakeTimers()
      welcomed()
      window.dispatchEvent(new Event('online'))
      setVisibility('visible')
      expect(sockets()).toBe(1)
    })

    it('ignores them on a first connection that failed', () => {
      connectRoom(ROOM, 'Al', handlers())
      FakeWebSocket.last.serverClose(1006)
      window.dispatchEvent(new Event('online'))
      expect(sockets()).toBe(1)
    })
  })

  describe('an attempt that hangs', () => {
    it('is closed and counted as a failure, one socket at a time', () => {
      const { attempt } = attempting()
      vi.advanceTimersByTime(RECONNECT_ATTEMPT_TIMEOUT_MS - 1)
      expect(attempt.gone).toBe(false)

      vi.advanceTimersByTime(1)
      expect(attempt.closedByClient).toBe(true)
      expect(openSockets()).toHaveLength(0)

      vi.advanceTimersByTime(2_000)
      expect(sockets()).toBe(3)
      expect(openSockets()).toHaveLength(1)
    })

    it('has no say once closed', () => {
      const { h, attempt } = attempting()
      vi.advanceTimersByTime(RECONNECT_ATTEMPT_TIMEOUT_MS)
      attempt.receive(welcome({}))
      attempt.serverClose(CloseCode.kicked)
      expect(h.onView).not.toHaveBeenCalled()
      expect(h.onEnd).not.toHaveBeenCalled()
    })
  })

  describe('a socket that went quiet', () => {
    it('counts as dropped once three pings have gone unanswered', () => {
      vi.useFakeTimers()
      const { h, socket } = welcomed()
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3)
      expect(h.onReconnecting).not.toHaveBeenCalled()
      expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(3)

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

      expect(h.onReconnecting).toHaveBeenCalledOnce()
      expect(socket.closedByClient).toBe(true)
      expect(socket.sent.filter((data) => data === 'ping')).toHaveLength(3)
    })

    it('does not while it answers', () => {
      vi.useFakeTimers()
      const { h, socket } = welcomed()
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
        socket.receive('pong')
      }
      expect(h.onReconnecting).not.toHaveBeenCalled()
      expect(socket.closedByClient).toBe(false)
    })
  })

  describe('closes that end it, during an attempt', () => {
    it.each([
      [CloseCode.kicked, 'kicked'],
      [CloseCode.dissolved, 'dissolved'],
      [CloseCode.roomNotFound, 'notFound'],
      [CloseCode.versionMismatch, 'versionMismatch'],
      [CloseCode.roomFull, 'full'],
      [CloseCode.replaced, 'replaced'],
      [CloseCode.badMessage, 'disconnected'],
    ])('%i ends as %s, with nothing left running', (code, end) => {
      const { h, attempt } = attempting()

      attempt.serverClose(code)

      expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
      expect(vi.getTimerCount()).toBe(0)
      window.dispatchEvent(new Event('online'))
      vi.advanceTimersByTime(RECONNECT_GIVE_UP_MS)
      expect(sockets()).toBe(2)
    })

    it('treats a 44xx this page does not know as an end too', () => {
      const { h, attempt } = attempting()
      attempt.serverClose(4499)
      expect(h.onEnd).toHaveBeenCalledExactlyOnceWith('disconnected')
    })
  })

  describe.each([
    [CloseCode.kicked],
    [CloseCode.dissolved],
    [CloseCode.roomNotFound],
    [CloseCode.versionMismatch],
    [CloseCode.roomFull],
    [CloseCode.replaced],
    [CloseCode.badMessage],
  ])('close %i of a welcomed socket', (code) => {
    it('never tries again', () => {
      const { h } = dropped(code)
      expect(h.onReconnecting).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(RECONNECT_GIVE_UP_MS)
      expect(sockets()).toBe(1)
    })
  })

  describe('leaving', () => {
    it('mid-backoff leaves no timer, no socket and no listener', () => {
      const { h, connection } = dropped()

      connection.leave()

      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(RECONNECT_GIVE_UP_MS)
      window.dispatchEvent(new Event('online'))
      setVisibility('visible')
      expect(sockets()).toBe(1)
      expect(h.onEnd).not.toHaveBeenCalled()
    })

    it('mid-attempt closes that socket and leaves no timer', () => {
      const { h, connection, attempt } = attempting()

      connection.leave()

      expect(attempt.closedByClient).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      attempt.receive(welcome({}))
      expect(h.onView).not.toHaveBeenCalled()
      expect(sockets()).toBe(2)
    })
  })

  describe('sending', () => {
    it('says it could not while waiting, and while an attempt has not been welcomed', () => {
      const { connection, attempt } = (() => {
        const room = dropped()
        expect(room.connection.send({ t: 'start' })).toBe(false)
        vi.advanceTimersByTime(1_000)
        FakeWebSocket.last.open()
        return { ...room, attempt: FakeWebSocket.last }
      })()
      attempt.sent.length = 0

      expect(connection.send({ t: 'start' })).toBe(false)
      expect(attempt.sent).toEqual([])
    })

    it('goes out on the new socket once welcomed', () => {
      const { connection, attempt } = attempting()
      attempt.receive(welcome({}))
      attempt.sent.length = 0

      expect(connection.send({ t: 'start' })).toBe(true)

      expect(attempt.sent).toEqual([JSON.stringify({ t: 'start' })])
    })
  })

  describe('when localStorage keeps nothing', () => {
    function blockStorage() {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
    }

    it('reconnects with the token from memory', () => {
      vi.useFakeTimers()
      blockStorage()
      connectAndTrack('blockedaaa', handlers())
      FakeWebSocket.last.open()
      FakeWebSocket.last.receive(welcome({}))

      FakeWebSocket.last.serverClose(1006)
      vi.advanceTimersByTime(1_000)
      FakeWebSocket.last.open()

      expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
    })

    it('brings it to a new connection too (Retry), for this room only', () => {
      blockStorage()
      const first = connectRoom('blockedbbb', 'Al', handlers())
      FakeWebSocket.last.open()
      FakeWebSocket.last.receive(welcome({}))
      first.leave()

      connectRoom('blockedbbb', 'Al', handlers())
      FakeWebSocket.last.open()
      expect(FakeWebSocket.last.joins[0].token).toBe(TOKEN_A)

      connectRoom('blockedccc', 'Al', handlers())
      FakeWebSocket.last.open()
      expect(FakeWebSocket.last.joins[0].token).toBeNull()
    })

    it('uses the newer token when storage can read but not write (full)', () => {
      localStorage.setItem('tku-arcade.seat.blockedddd', TOKEN_B)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const first = connectRoom('blockedddd', 'Al', handlers())
      FakeWebSocket.last.open()
      expect(FakeWebSocket.last.joins[0].token).toBe(TOKEN_B)
      FakeWebSocket.last.receive(welcome({}, { token: TOKEN_A }))
      first.leave()

      connectRoom('blockedddd', 'Al', handlers())
      FakeWebSocket.last.open()

      expect(FakeWebSocket.last.joins[0].token).toBe(TOKEN_A)
    })
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
    [CloseCode.kicked, 'kicked'],
    [CloseCode.dissolved, 'dissolved'],
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
    [CloseCode.versionMismatch, 'versionMismatch'],
    [CloseCode.roomNotFound, 'notFound'],
    [CloseCode.roomFull, 'full'],
    [CloseCode.badMessage, 'disconnected'],
    [CloseCode.replaced, 'replaced'],
    [CloseCode.kicked, 'kicked'],
    [CloseCode.dissolved, 'dissolved'],
  ])('reads close %i after welcome as %s', (code, end) => {
    const { h, socket } = welcomed()
    socket.serverClose(code)
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith(end)
  })

  it('keeps the seat token when kicked: it is what the ban recognises', () => {
    const { socket } = welcomed()
    socket.serverClose(CloseCode.kicked)
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_A)
  })

  it('brings a banned token along again, and is closed as kicked before any welcome', () => {
    localStorage.setItem(SEAT_KEY, TOKEN_A)
    const h = handlers()
    connectRoom(ROOM, 'Al', h)
    const socket = FakeWebSocket.last
    socket.open()
    expect(socket.joins[0].token).toBe(TOKEN_A)

    socket.serverClose(CloseCode.kicked)

    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith('kicked')
    expect(localStorage.getItem(SEAT_KEY)).toBe(TOKEN_A)
  })

  it('opens no new socket by itself after a close', () => {
    connectRoom(ROOM, 'Al', handlers())
    FakeWebSocket.last.serverClose(1006)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
