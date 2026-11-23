// The lobby's pushed room list, the page's side (2026-11-23, src/lib/lobbyFeed.ts): the whole list,
// then changes; reconnecting after a drop; letting go in a hidden tab; polling where pushing fails
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloseCode, type RoomListing } from '../../shared/protocol.ts'
import { FEED_FAILS_BEFORE_POLL, FEED_SILENT_MS, watchLobby } from '../../src/lib/lobbyFeed.ts'
import { FakeWebSocket } from './fakeWebSocket.ts'

const room = (id: string, over: Partial<RoomListing> = {}): RoomListing => ({
  id,
  gameId: 'kart',
  host: `Host ${id}`,
  seated: 1,
  maxSeats: 8,
  createdAt: 1,
  ...over,
})

class FakeDoc extends EventTarget {
  hidden = false
  flip(hidden: boolean) {
    this.hidden = hidden
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

function watch() {
  const lists: string[][] = []
  const onFallback = vi.fn()
  const doc = new FakeDoc()
  const stop = watchLobby(
    'kart',
    { onRooms: (rooms) => lists.push(rooms.map((one) => one.id)), onFallback },
    {
      createSocket: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      doc: doc as unknown as Document,
      random: () => 0,
    },
  )
  return { lists, onFallback, doc, stop }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('the pushed room list', () => {
  it('opens the game feed, takes the whole list, then each change in the list order', () => {
    const { lists, stop } = watch()
    const socket = FakeWebSocket.last
    expect(socket.url).toMatch(/^ws:\/\/[^/]+\/ws\/lobby\?game=kart&v=1$/)
    socket.open()
    // A change before the whole list is not shown on its own
    socket.receive(JSON.stringify({ t: 'room', room: room('early') }))
    expect(lists).toEqual([])
    socket.receive(JSON.stringify({ t: 'rooms', rooms: [room('a'), room('b', { status: 'playing' })] }))
    socket.receive(JSON.stringify({ t: 'room', room: room('c', { seated: 3, bots: 0 }) }))
    socket.receive(JSON.stringify({ t: 'room', room: room('a', { status: 'playing' }) }))
    socket.receive(JSON.stringify({ t: 'gone', id: 'b' }))
    socket.receive('pong')
    socket.receive('{"t":"nonsense"}')
    // Open rooms first, more people first (worker/lobby-list.ts' order, shared/lobby-feed.ts)
    expect(lists).toEqual([['a', 'b'], ['c', 'a', 'b'], ['c', 'a', 'b'], ['c', 'a']])
    stop()
    expect(socket.closedByClient).toBe(true)
  })

  it('pings to stay alive and starts over when it hears nothing', () => {
    watch()
    const socket = FakeWebSocket.last
    socket.open()
    socket.receive(JSON.stringify({ t: 'rooms', rooms: [] }))
    vi.advanceTimersByTime(15_000)
    expect(socket.sent).toContain('ping')
    vi.advanceTimersByTime(FEED_SILENT_MS)
    expect(socket.closedByClient).toBe(true)
    vi.advanceTimersByTime(1_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('reconnects after a drop, waiting longer each time, and takes the whole list again', () => {
    const { lists, onFallback } = watch()
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(JSON.stringify({ t: 'rooms', rooms: [room('a')] }))
    FakeWebSocket.last.serverClose(1006)
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    // A dead attempt: the next one waits 2 s
    FakeWebSocket.last.serverClose(1006)
    vi.advanceTimersByTime(1_999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(JSON.stringify({ t: 'rooms', rooms: [room('b')] }))
    expect(lists.at(-1)).toEqual(['b'])
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('falls back to polling when sockets keep closing before any list', () => {
    const { onFallback } = watch()
    for (let attempt = 0; attempt < FEED_FAILS_BEFORE_POLL; attempt++) {
      FakeWebSocket.last.serverClose(1006)
      vi.advanceTimersByTime(60_000)
    }
    expect(onFallback).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances).toHaveLength(FEED_FAILS_BEFORE_POLL)
  })

  it('falls back to polling at once past the watcher limit, or with a feed it does not know', () => {
    for (const code of [CloseCode.tooManyConnections, CloseCode.versionMismatch]) {
      FakeWebSocket.instances = []
      const { onFallback } = watch()
      FakeWebSocket.last.serverClose(code)
      vi.advanceTimersByTime(60_000)
      expect(onFallback).toHaveBeenCalledOnce()
      expect(FakeWebSocket.instances).toHaveLength(1)
    }
  })

  it('falls back to polling without WebSocket', () => {
    const onFallback = vi.fn()
    vi.stubGlobal('WebSocket', undefined)
    try {
      watchLobby('kart', { onRooms: () => {}, onFallback })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(onFallback).toHaveBeenCalledOnce()
  })

  it('lets go in a hidden tab and opens afresh when it is shown again', () => {
    const { doc, lists } = watch()
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(JSON.stringify({ t: 'rooms', rooms: [room('a')] }))
    doc.flip(true)
    expect(FakeWebSocket.last.closedByClient).toBe(true)
    vi.advanceTimersByTime(120_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    doc.flip(false)
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.last.open()
    FakeWebSocket.last.receive(JSON.stringify({ t: 'rooms', rooms: [room('z')] }))
    expect(lists.at(-1)).toEqual(['z'])
  })
})
