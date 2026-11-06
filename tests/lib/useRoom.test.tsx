import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { setLanguage } from '../../src/i18n/t.ts'
import { CHAT_ACK_TIMEOUT_MS } from '../../src/lib/chatState.ts'
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
    act(() => socket.serverClose(1006))
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
    act(() => socket.serverClose(1006))

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
    act(() => socket.serverClose(1006))
    expect(result.current.timers).toEqual([])
  })

  it('clears them on retry, before the new socket has said anything', () => {
    const { result, socket } = joined()
    serverSays(socket, TIMER)
    act(() => result.current.retry())
    expect(result.current.timers).toEqual([])
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

describe('chat', () => {
  const said = (id: number, over: object = {}) => ({
    id,
    from: 'm2',
    name: 'Bo',
    text: `message ${id}`,
    at: 1000 + id,
    ...over,
  })
  const ids = (room: RoomHandle) => room.chat.map((message) => message.id)

  it('starts empty, replaces on reset and appends otherwise', () => {
    const { result, socket } = joined()
    expect(result.current.chat).toEqual([])

    serverSays(socket, { t: 'chat', messages: [said(1), said(2)], reset: true })
    expect(ids(result.current)).toEqual([1, 2])

    // The rest of the history, then a new message
    serverSays(socket, { t: 'chat', messages: [said(3)] })
    serverSays(socket, { t: 'chat', messages: [said(4)] })
    expect(ids(result.current)).toEqual([1, 2, 3, 4])

    serverSays(socket, { t: 'chat', messages: [said(9)], reset: true })
    expect(ids(result.current)).toEqual([9])

    serverSays(socket, { t: 'chat', messages: [], reset: true })
    expect(result.current.chat).toEqual([])
  })

  it('de-duplicates by id', () => {
    const { result, socket } = joined()
    serverSays(socket, { t: 'chat', messages: [said(1)], reset: true })
    serverSays(socket, { t: 'chat', messages: [said(1), said(2)] })
    expect(ids(result.current)).toEqual([1, 2])
  })

  it('ignores what is not a message, keeping the rest of the frame', () => {
    const { result, socket } = joined()
    serverSays(socket, { t: 'chat', messages: [said(1), { id: 'x' }, null] })
    expect(ids(result.current)).toEqual([1])
  })

  it('keeps the messages through a dropped socket and a retry, until the next reset', () => {
    const { result, socket } = joined()
    serverSays(socket, { t: 'chat', messages: [said(1), said(2)], reset: true })

    act(() => socket.serverClose(1006))
    expect(ids(result.current)).toEqual([1, 2])

    act(() => result.current.retry())
    expect(ids(result.current)).toEqual([1, 2])

    const next = FakeWebSocket.last
    act(() => {
      next.open()
      next.receive(welcome({}))
    })
    expect(ids(result.current)).toEqual([1, 2])

    serverSays(next, { t: 'chat', messages: [said(2), said(3)], reset: true })
    expect(ids(result.current)).toEqual([2, 3])
  })

  it('does not carry messages over to another room', () => {
    const hook = renderHook(({ id }) => useRoom(id, 'Al'), {
      wrapper,
      initialProps: { id: ROOM },
    })
    const socket = FakeWebSocket.last
    act(() => {
      socket.open()
      socket.receive(welcome({}))
    })
    serverSays(socket, { t: 'chat', messages: [said(1)], reset: true })

    hook.rerender({ id: 'zzzzzzzzzz' })

    expect(hook.result.current.chat).toEqual([])
  })

  describe('sendChat', () => {
    /** Which way the promise has gone so far, if at all */
    const watch = (answer: Promise<string>) => {
      const seen: { result?: string } = {}
      void answer.then((result) => (seen.result = result))
      return seen
    }
    const flushed = () => act(async () => {})

    it('sends the frame, normalized', () => {
      const { result, socket } = joined()
      act(() => void result.current.sendChat('  hi  '))
      expect(socket.sent).toEqual([JSON.stringify({ t: 'chat', text: 'hi' })])
    })

    it('is answered by the message coming back', async () => {
      const { result, socket } = joined()
      const seen = watch(result.current.sendChat('hi'))
      await flushed()
      expect(seen.result).toBeUndefined()

      serverSays(socket, { t: 'chat', messages: [said(1, { from: 'm1', text: 'hi' })] })
      await flushed()

      expect(seen.result).toBe('sent')
    })

    it.each(['rate_limited', 'chat_locked'])(
      'is answered by %s, without a toast: the composer says it',
      async (code) => {
        function Probe({ onRoom }: { onRoom: (room: RoomHandle) => void }) {
          onRoom(useRoom(ROOM, 'Al'))
          return null
        }
        let room: RoomHandle | undefined
        render(
          <ToastProvider>
            <Probe onRoom={(handle) => (room = handle)} />
          </ToastProvider>,
        )
        const socket = FakeWebSocket.last
        act(() => {
          socket.open()
          socket.receive(welcome({}))
        })
        const seen = watch((room as RoomHandle).sendChat('hi'))

        serverSays(socket, { t: 'error', code })
        await flushed()

        expect(seen.result).toBe(code)
        expect(screen.queryByRole('alert')).toBeNull()
      },
    )

    it('leaves a chat refusal with no send waiting to the toast', () => {
      function Probe() {
        useRoom(ROOM, 'Al')
        return null
      }
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
      serverSays(socket, { t: 'error', code: 'chat_locked' })
      expect(screen.getByRole('alert')).toHaveTextContent('Chat is locked right now.')
    })

    it('fails at once for nothing, without sending what the room would close the socket for', async () => {
      const { result, socket } = joined()
      await expect(result.current.sendChat('   ')).resolves.toBe('failed')
      await expect(result.current.sendChat('x'.repeat(501))).resolves.toBe('failed')
      expect(socket.sent).toEqual([])
    })

    it('fails when the connection ends', async () => {
      const { result, socket } = joined()
      const seen = watch(result.current.sendChat('hi'))

      act(() => socket.serverClose(1006))
      await flushed()

      expect(seen.result).toBe('failed')
    })

    it('fails when nothing comes back in time', async () => {
      vi.useFakeTimers()
      try {
        const { result } = joined()
        const seen = watch(result.current.sendChat('hi'))

        await act(async () => {
          await vi.advanceTimersByTimeAsync(CHAT_ACK_TIMEOUT_MS)
        })

        expect(seen.result).toBe('failed')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
