import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast.tsx'
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
    const { sit, setReady, start, act: send, retry } = result.current

    serverSays(socket, READY_PATCH)

    expect(result.current.sit).toBe(sit)
    expect(result.current.setReady).toBe(setReady)
    expect(result.current.start).toBe(start)
    expect(result.current.act).toBe(send)
    expect(result.current.retry).toBe(retry)
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

  it('falls back for a code from a newer server', () => {
    const socket = rendered()
    serverSays(socket, { t: 'error', code: 'from_the_future' })
    expect(screen.getByRole('alert')).toHaveTextContent("That didn't work. Try again.")
  })
})
