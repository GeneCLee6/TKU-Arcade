import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { en } from '../../src/i18n/en.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { useRoom, type RoomHandle } from '../../src/lib/useRoom.ts'
import { FakeWebSocket, TOKEN_A, welcome } from './fakeWebSocket.ts'

const ROOM = 'abcdefghij'
const READY_PATCH = {
  t: 'patch',
  rev: 1,
  ops: [{ op: 'set', path: ['members', 'm1', 'ready'], value: true }],
}

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

const open = () => renderHook(() => useRoom(ROOM, 'Al'), { wrapper })

function joined() {
  const hook = open()
  const socket = FakeWebSocket.last
  act(() => {
    socket.open()
    socket.receive(welcome({}))
  })
  socket.sent.length = 0
  return { ...hook, socket }
}

const serverSays = (socket: FakeWebSocket, message: unknown) =>
  act(() => socket.receive(JSON.stringify(message)))

beforeEach(() => {
  localStorage.clear()
  setLanguage('en')
  FakeWebSocket.install()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session', () => {
  it('joins, then follows the patches', () => {
    const { result, socket } = joined()
    expect(result.current.session).toMatchObject({ phase: 'joined', you: 'm1' })

    serverSays(socket, READY_PATCH)

    const { session } = result.current
    expect(session.phase === 'joined' && session.view.members.m1.ready).toBe(true)
  })

  it('starts as joining and ends with the reason', () => {
    const { result } = open()
    expect(result.current.session).toEqual({ phase: 'joining' })

    act(() => FakeWebSocket.last.serverClose(4409))

    expect(result.current.session).toEqual({ phase: 'ended', end: 'full' })
  })

  it('in StrictMode opens two sockets but joins once, and sends on the live one', () => {
    function Probe() {
      const room = useRoom(ROOM, 'Al')
      return <button onClick={room.start}>start</button>
    }
    // StrictMode must be the root's child: React doubles effects only from the placed fiber down
    render(
      <StrictMode>
        <ToastProvider>
          <Probe />
        </ToastProvider>
      </StrictMode>,
    )
    // The double effect really ran, or this test would prove nothing
    expect(FakeWebSocket.instances).toHaveLength(2)
    const [first, second] = FakeWebSocket.instances

    act(() => {
      first.open()
      second.open()
      second.receive(welcome({}))
    })

    expect(first.sent).toEqual([])
    expect(second.joins).toHaveLength(1)
    second.sent.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(second.sent).toEqual([JSON.stringify({ t: 'start' })])
  })

  it('retry goes back to joining on one new socket, with the token', () => {
    const { result, socket } = joined()
    act(() => socket.serverClose(4422))
    expect(result.current.session).toEqual({ phase: 'ended', end: 'disconnected' })

    act(() => result.current.retry())

    expect(result.current.session).toEqual({ phase: 'joining' })
    expect(FakeWebSocket.instances).toHaveLength(2)
    act(() => FakeWebSocket.last.open())
    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  it('leaves on unmount', () => {
    const { unmount, socket } = joined()
    unmount()
    expect(socket.closedByClient).toBe(true)
  })

  it('moves to another room on a new socket and closes the old one', () => {
    const hook = renderHook(({ id }) => useRoom(id, 'Al'), {
      wrapper,
      initialProps: { id: ROOM },
    })
    const first = FakeWebSocket.last

    hook.rerender({ id: 'zzzzzzzzzz' })

    expect(first.closedByClient).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
})

describe('senders', () => {
  it.each<[string, (room: RoomHandle) => void, unknown]>([
    ['sit', (room) => room.sit(2), { t: 'sit', seat: 2 }],
    ['sit(null)', (room) => room.sit(null), { t: 'sit', seat: null }],
    ['setReady', (room) => room.setReady(true), { t: 'ready', ready: true }],
    ['start', (room) => room.start(), { t: 'start' }],
    ['act', (room) => room.act({ roll: 1 }), { t: 'action', action: { roll: 1 } }],
    ['kick', (room) => room.kick('m2'), { t: 'kick', member: 'm2' }],
    ['transfer', (room) => room.transfer('m2'), { t: 'transfer', member: 'm2' }],
    ['dissolve', (room) => room.dissolve(), { t: 'dissolve' }],
    ['rematch', (room) => room.rematch(), { t: 'rematch' }],
    ['reopen', (room) => room.reopen(), { t: 'reopen' }],
    ['cover skip', (room) => room.cover(2, 'skip'), { t: 'cover', seat: 2, how: 'skip' }],
    ['cover proxy', (room) => room.cover(0, 'proxy'), { t: 'cover', seat: 0, how: 'proxy' }],
    ['setGame', (room) => room.setGame('promotion'), { t: 'set_game', gameId: 'promotion' }],
    [
      'setGame with options',
      (room) => room.setGame('promotion', { turnLimit: 20 }),
      { t: 'set_game', gameId: 'promotion', options: { turnLimit: 20 } },
    ],
    [
      'setOptions',
      (room) => room.setOptions({ turnLimit: 20 }),
      { t: 'set_options', options: { turnLimit: 20 } },
    ],
  ])('%s sends its frame', (_, call, frame) => {
    const { result, socket } = joined()
    act(() => call(result.current))
    expect(socket.sent).toEqual([JSON.stringify(frame)])
  })

  it('do nothing before welcome', () => {
    const { result } = open()
    const socket = FakeWebSocket.last
    act(() => socket.open())
    socket.sent.length = 0

    act(() => {
      result.current.sit(1)
      result.current.start()
    })

    expect(socket.sent).toEqual([])
  })

  it('do nothing after the end', () => {
    const { result, socket } = joined()
    act(() => socket.serverClose(4422))

    act(() => result.current.start())

    expect(socket.sent).toEqual([])
  })

  it('stay the same functions across updates', () => {
    const { result, socket } = joined()
    const { session: _session, timers: _timers, ...before } = result.current

    serverSays(socket, READY_PATCH)

    const { session: _s, timers: _t, ...after } = result.current
    expect(Object.keys(before)).toContain('setOptions')
    for (const [name, sender] of Object.entries(before)) {
      expect(after[name as keyof typeof after]).toBe(sender)
    }
  })
})

describe('timers', () => {
  const TIMER = { t: 'timer', timers: [{ id: 'turn', remainingMs: 5_000, totalMs: 30_000 }] }

  it('starts with none, follows the server’s list, and keeps the same id and total', () => {
    const { result, socket } = joined()
    expect(result.current.timers).toEqual([])

    serverSays(socket, TIMER)
    expect(result.current.timers).toEqual([
      { id: 'turn', deadline: expect.any(Number), totalMs: 30_000 },
    ])

    serverSays(socket, { t: 'timer', timers: [] })
    expect(result.current.timers).toEqual([])
  })

  it('clears them when the connection ends', () => {
    const { result, socket } = joined()
    serverSays(socket, TIMER)
    act(() => socket.serverClose(4422))
    expect(result.current.timers).toEqual([])
  })

  it('clears them on retry, before the new socket has said anything', () => {
    const { result, socket } = joined()
    serverSays(socket, TIMER)
    act(() => result.current.retry())
    expect(result.current.timers).toEqual([])
  })
})

describe('reconnecting', () => {
  const TIMER = { t: 'timer', timers: [{ id: 'turn', remainingMs: 5_000, totalMs: 30_000 }] }
  const nextAttempt = (ms = 1_000) => act(() => vi.advanceTimersByTime(ms))

  function dropped() {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const room = joined()
    serverSays(room.socket, TIMER)
    act(() => room.socket.serverClose(1006))
    return room
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stays joined with the last view, and says it is reconnecting', () => {
    const { result } = dropped()
    expect(result.current.session).toMatchObject({
      phase: 'joined',
      you: 'm1',
      reconnecting: true,
    })
    const { session } = result.current
    expect(session.phase === 'joined' && session.view.members.m1.name).toBe('Al')
  })

  it('is back on welcome: not reconnecting, the new view, and the old timers gone', () => {
    const { result } = dropped()
    expect(result.current.timers).toHaveLength(1)
    nextAttempt()
    const attempt = FakeWebSocket.last
    act(() => attempt.open())
    expect(attempt.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
    // A welcome with no `timer` after it: nothing is running now
    act(() => attempt.receive(welcome({ name: 'Back' })))

    expect(result.current.timers).toEqual([])
    expect(result.current.session).toMatchObject({ phase: 'joined', reconnecting: false })
    const { session } = result.current
    expect(session.phase === 'joined' && session.view.members.m1.name).toBe('Back')
  })

  it('ends at disconnected after 5 minutes, and retry comes back with the token', () => {
    const { result } = dropped()
    for (let i = 0; i < 20 && result.current.session.phase === 'joined'; i++) {
      nextAttempt(30_000)
      act(() => FakeWebSocket.last.serverClose(1006))
    }
    expect(result.current.session).toEqual({ phase: 'ended', end: 'disconnected' })
    expect(result.current.timers).toEqual([])

    act(() => result.current.retry())
    act(() => FakeWebSocket.last.open())

    expect(FakeWebSocket.last.joins).toEqual([{ t: 'join', name: 'Al', token: TOKEN_A }])
  })

  it('ends at the reason a close during an attempt gives', () => {
    const { result } = dropped()
    nextAttempt()
    act(() => FakeWebSocket.last.serverClose(4404))
    expect(result.current.session).toEqual({ phase: 'ended', end: 'notFound' })
  })

  it('leaves no timer and no new socket when unmounted mid-backoff', () => {
    const { unmount } = dropped()
    const opened = FakeWebSocket.instances.length

    unmount()

    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(600_000))
    window.dispatchEvent(new Event('online'))
    expect(FakeWebSocket.instances).toHaveLength(opened)
  })

  it('tells of a send that could not go out', () => {
    function Probe() {
      const room = useRoom(ROOM, 'Al')
      return <button onClick={room.start}>start</button>
    }
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )
    const socket = FakeWebSocket.last
    act(() => {
      socket.open()
      socket.receive(welcome({}))
    })
    socket.sent.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(screen.queryByText(en['room.reconnecting.notSent'])).toBeNull()

    act(() => socket.serverClose(1006))
    fireEvent.click(screen.getByRole('button', { name: 'start' }))

    expect(screen.getByText(en['room.reconnecting.notSent'])).toBeInTheDocument()
    expect(socket.sent).toEqual([JSON.stringify({ t: 'start' })])
  })

  it('in StrictMode has one attempt on one socket after a drop', () => {
    vi.useFakeTimers()
    function Probe() {
      useRoom(ROOM, 'Al')
      return null
    }
    render(
      <StrictMode>
        <ToastProvider>
          <Probe />
        </ToastProvider>
      </StrictMode>,
    )
    const [first, second] = FakeWebSocket.instances
    expect(first.closedByClient).toBe(true)
    act(() => {
      second.open()
      second.receive(welcome({}))
    })

    act(() => second.serverClose(1006))
    nextAttempt()

    expect(FakeWebSocket.instances).toHaveLength(3)
    expect(FakeWebSocket.instances.filter((socket) => !socket.gone)).toHaveLength(1)
  })
})

describe('refusals', () => {
  function Probe() {
    useRoom(ROOM, 'Al')
    return null
  }

  function rendered() {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )
    const socket = FakeWebSocket.last
    act(() => {
      socket.open()
      socket.receive(welcome({}))
    })
    return socket
  }

  it('shows a known code in the current language', () => {
    const socket = rendered()
    serverSays(socket, { t: 'error', code: 'seat_taken' })
    expect(screen.getByRole('alert')).toHaveTextContent('Someone is already in that seat.')

    act(() => setLanguage('zh-TW'))
    serverSays(socket, { t: 'error', code: 'not_seated' })
    expect(screen.getByText('請先入座。')).toBeInTheDocument()
  })

  it('shows a game’s own message for game_error', () => {
    const socket = rendered()
    // A key no catalog has comes back as itself, which proves it was used as the key
    serverSays(socket, {
      t: 'error',
      code: 'game_error',
      error: { gameError: 'games.x.notYourTurn' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('games.x.notYourTurn')
  })

  it.each([
    ['bad_member', "That person isn't in the room or isn't online."],
    ['bad_game', "That game isn't available."],
  ])('has its own words for %s', (code, text) => {
    const socket = rendered()
    serverSays(socket, { t: 'error', code })
    expect(screen.getByRole('alert')).toHaveTextContent(text)
  })

  it('falls back for a code from a newer server', () => {
    const socket = rendered()
    serverSays(socket, { t: 'error', code: 'from_the_future' })
    expect(screen.getByRole('alert')).toHaveTextContent("That didn't work. Try again.")
  })
})
