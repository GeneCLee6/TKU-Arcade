import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isSeatToken,
  parseServerMessage,
  roomSocketPath,
  STALE_AFTER_MS,
  type ClientMessage,
  type ErrorMessage,
  type JoinMessage,
  type RoomView,
} from '../../shared/protocol.ts'
import { applyPatch, type JsonValue, type PatchOp } from '../../shared/patch.ts'
import { readStored, writeStored } from './storage.ts'

export type RoomEnd =
  | 'versionMismatch'
  | 'notFound'
  | 'full'
  | 'connectionLost'
  | 'disconnected'
  | 'replaced'
  | 'kicked'
  | 'dissolved'

/** One countdown, in this browser's own time: `performance.now()` reads against `deadline` */
export type RoomTimer = {
  id: string
  deadline: number
  /** The whole countdown, for a progress bar */
  totalMs: number
}

export type RoomHandlers = {
  /** After `welcome`, and whenever what this person sees changes */
  onView: (you: string, view: RoomView) => void
  /** The socket dropped and it is trying again; the next `onView` means it is back */
  onReconnecting: () => void
  onError: (error: ErrorMessage) => void
  /** The countdowns running now, replacing the previous list; an empty list means none */
  onTimers: (timers: RoomTimer[]) => void
  onEnd: (end: RoomEnd) => void
}

export type RoomConnection = {
  /** False when it could not go out: before `welcome`, while reconnecting, or after the end */
  send: (message: ClientMessage) => boolean
  /** After it, nothing from this socket counts any more */
  leave: () => void
}

/** How long to wait after each failed attempt; the last one repeats */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
/** At most this share comes off a delay, at random: a room that lost its server returns spread out */
const RECONNECT_JITTER = 0.25
/** An attempt not welcomed by then has failed: without this, a hung one would block all others */
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 10_000
/** Attempts have failed for this long since the socket dropped: leave it to the person */
export const RECONNECT_GIVE_UP_MS = 5 * 60_000
/** Sent without hearing anything back, by which time the server has given up on this socket too */
const MAX_UNANSWERED_PINGS = STALE_AFTER_MS / HEARTBEAT_INTERVAL_MS
/** "Abnormal closure": what a browser reports for a connection that just went away */
const CLOSE_ABNORMAL = 1006

/** The wait after `failures` failed attempts. Jitter only shortens it, so the cap stays a cap */
export function reconnectDelay(failures: number): number {
  const base = RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)]
  return base * (1 - RECONNECT_JITTER * Math.random())
}

const seatKey = (roomId: string) => `tku-arcade.seat.${roomId}`

// Tokens localStorage would not keep, for as long as this page lives
const unstoredTokens = new Map<string, string>()

/** The token that brings this browser back as the same member, not a ghost `Al (2)` */
function readSeatToken(roomId: string): string | null {
  const token = unstoredTokens.get(roomId) ?? readStored(seatKey(roomId))
  return isSeatToken(token) ? token : null
}

function keepSeatToken(roomId: string, token: string): void {
  writeStored(seatKey(roomId), token)
  if (readStored(seatKey(roomId)) === token) unstoredTokens.delete(roomId)
  else unstoredTokens.set(roomId, token)
}

/** The closes that are an answer, which trying again could not change; else null */
function finalEnd(code: number): RoomEnd | null {
  switch (code) {
    case CloseCode.replaced:
      return 'replaced'
    // The token stays in storage on purpose: it is what the ban recognises, so a new one would walk
    // straight back in.
    case CloseCode.kicked:
      return 'kicked'
    case CloseCode.dissolved:
      return 'dissolved'
    case CloseCode.versionMismatch:
      return 'versionMismatch'
    case CloseCode.roomNotFound:
      return 'notFound'
    case CloseCode.roomFull:
      return 'full'
    default:
      return null
  }
}

/** shared/protocol.ts CloseCode: after any close but the 44xx ones, except `stale` */
const canReconnectAfter = (code: number) => code === CloseCode.stale || code < 4400 || code >= 4500

type RoomSocket = Pick<RoomConnection, 'send' | 'leave'>

type RoomSocketHandlers = Omit<RoomHandlers, 'onEnd' | 'onReconnecting'> & {
  /** Before the `onView` of the same `welcome` */
  onWelcome: () => void
  /** This socket is over; `welcomed`: it had joined. Not called after `leave` */
  onClosed: (code: number, welcomed: boolean) => void
}

/**
 * One socket: opens it, joins and keeps this person's view of the room up to date. `join` is sent
 * only from the `open` of a socket that is still current, which is what keeps StrictMode's double
 * effect (and a retry) to one member. `rev` and the view start again from its own `welcome`.
 */
function openRoomSocket(roomId: string, name: string, handlers: RoomSocketHandlers): RoomSocket {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${scheme}//${window.location.host}${roomSocketPath(roomId)}`)
  let current = true
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let joined: { you: string; rev: number; view: RoomView } | null = null
  let resyncing = false
  let unansweredPings = 0

  // The socket can be closing before its close event arrives, and then `send` throws
  const sendRaw = (data: string) => {
    try {
      socket.send(data)
    } catch {
      // onclose reports it
    }
  }

  const resync = () => {
    if (resyncing) return
    resyncing = true
    sendRaw(JSON.stringify({ t: 'resync' } satisfies ClientMessage))
  }

  const onPatch = (rev: number, ops: PatchOp[]) => {
    if (!joined || resyncing || rev <= joined.rev) return
    if (rev !== joined.rev + 1) return resync()
    let view: RoomView
    try {
      view = applyPatch(joined.view as JsonValue, ops) as RoomView
    } catch {
      return resync()
    }
    joined.rev = rev
    // Everyone gets a patch for every rev, most of them empty for someone who can't see the change
    if (ops.length === 0) return
    joined.view = view
    handlers.onView(joined.you, view)
  }

  socket.onopen = () => {
    if (!current) return
    const join: JoinMessage = { t: 'join', name, token: readSeatToken(roomId) }
    sendRaw(JSON.stringify(join))
    // Without it the server closes the socket as stale
    heartbeat = setInterval(() => {
      // A network that dies quietly reports no close for minutes, if ever
      if (unansweredPings >= MAX_UNANSWERED_PINGS) {
        closed(CLOSE_ABNORMAL)
        socket.close()
        return
      }
      unansweredPings++
      sendRaw(HEARTBEAT_PING)
    }, HEARTBEAT_INTERVAL_MS)
  }

  socket.onmessage = (event: MessageEvent) => {
    unansweredPings = 0
    if (!current || typeof event.data !== 'string' || event.data === HEARTBEAT_PONG) return
    const message = parseServerMessage(event.data)
    // `chat` (e1-t07) comes with its batch
    switch (message?.t) {
      case 'welcome':
        if (joined) return
        joined = { you: message.you, rev: message.rev, view: message.state }
        keepSeatToken(roomId, message.token)
        handlers.onWelcome()
        handlers.onView(message.you, message.state)
        return
      case 'snapshot':
        if (!joined) return
        joined.rev = message.rev
        joined.view = message.state
        resyncing = false
        handlers.onView(joined.you, message.state)
        return
      case 'patch':
        onPatch(message.rev, message.ops)
        return
      case 'error':
        handlers.onError(message)
        return
      case 'timer': {
        if (!joined) return
        // A duration, not a clock time, and counted from now: browsers' clocks disagree
        const now = performance.now()
        handlers.onTimers(
          message.timers.map(({ id, remainingMs, totalMs }) => ({
            id,
            deadline: now + remainingMs,
            totalMs,
          })),
        )
        return
      }
    }
  }

  const closed = (code: number) => {
    clearInterval(heartbeat)
    if (!current) return
    current = false
    handlers.onClosed(code, joined !== null)
  }

  socket.onclose = (event: CloseEvent) => closed(event.code)

  return {
    send: (message) => {
      if (!current || !joined) return false
      sendRaw(JSON.stringify(message))
      return true
    },
    leave: () => {
      current = false
      clearInterval(heartbeat)
      socket.close()
    },
  }
}

/**
 * This person's connection to a room, one socket at a time. A socket that had been welcomed and
 * drops is replaced by itself, the seat token bringing back the same member, until an attempt is
 * welcomed, a close says trying is pointless, or RECONNECT_GIVE_UP_MS has gone by. A first
 * connection that fails is reported at once. Reports at most one end.
 */
export function connectRoom(roomId: string, name: string, handlers: RoomHandlers): RoomConnection {
  let socket: RoomSocket | null = null
  /** When the socket dropped; null unless reconnecting */
  let lostAt: number | null = null
  let failures = 0
  /** While reconnecting: the wait for the next attempt or, with a socket, its deadline */
  let timer: ReturnType<typeof setTimeout> | undefined

  const open = () => {
    socket = openRoomSocket(roomId, name, { ...handlers, onWelcome, onClosed })
  }

  const attempt = () => {
    open()
    timer = setTimeout(() => {
      socket?.leave()
      socket = null
      attemptFailed()
    }, RECONNECT_ATTEMPT_TIMEOUT_MS)
  }

  // Judged here rather than by a timer of its own: a phone asleep for an hour has not been failing
  // for an hour, so it gets its attempt on waking up
  const attemptFailed = () => {
    if (lostAt !== null && Date.now() - lostAt >= RECONNECT_GIVE_UP_MS) {
      finish('disconnected')
      return
    }
    timer = setTimeout(attempt, reconnectDelay(failures++))
  }

  // A wait still running is pointless now, and an attempt under way will do
  const wake = () => {
    if (socket || document.visibilityState === 'hidden') return
    clearTimeout(timer)
    failures = 0
    attempt()
  }

  const stopReconnecting = () => {
    clearTimeout(timer)
    window.removeEventListener('online', wake)
    document.removeEventListener('visibilitychange', wake)
    lostAt = null
  }

  const finish = (end: RoomEnd) => {
    stopReconnecting()
    handlers.onEnd(end)
  }

  const onWelcome = () => {
    if (lostAt === null) return
    stopReconnecting()
    // The server only says so when some are running, and these are from before the drop
    handlers.onTimers([])
  }

  const onClosed = (code: number, welcomed: boolean) => {
    socket = null
    clearTimeout(timer)
    const final = finalEnd(code)
    if (final) return finish(final)
    if (!welcomed && lostAt === null) return finish('connectionLost')
    if (!canReconnectAfter(code)) return finish('disconnected')
    if (lostAt !== null) return attemptFailed()

    lostAt = Date.now()
    failures = 0
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    handlers.onReconnecting()
    attemptFailed()
  }

  open()

  return {
    send: (message) => socket?.send(message) ?? false,
    leave: () => {
      stopReconnecting()
      socket?.leave()
      socket = null
    },
  }
}
