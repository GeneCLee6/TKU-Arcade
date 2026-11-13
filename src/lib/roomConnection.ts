import { isChatMessage } from '../../shared/chat.ts'
import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isSeatToken,
  parseServerMessage,
  roomSocketPath,
  STALE_AFTER_MS,
  type ChatMessage,
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
  /**
   * The socket was found dead while something sent on it had no answer yet: that tap most likely
   * never arrived, and the person should make it again once back
   */
  onUnanswered?: () => void
  onError: (error: ErrorMessage) => void
  /** The countdowns running now, replacing the previous list; an empty list means none */
  onTimers: (timers: RoomTimer[]) => void
  /** `reset`: these replace every message so far. Otherwise they are new, or may be repeats */
  onChat: (messages: ChatMessage[], reset: boolean) => void
  onEnd: (end: RoomEnd) => void
}

export type RoomConnection = {
  /** False when it could not go out: before `welcome`, while reconnecting, or after the end */
  send: (message: ClientMessage) => boolean
  /** After it, nothing from this socket counts any more */
  leave: () => void
}

/** How long to wait after each failed attempt; the last one repeats */
// The first try is at once: a phone back from the background should be in the game again before
// anyone notices (owner, 2026-11-13: players stuck for a long time in Silent Table)
const RECONNECT_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
/** At most this share comes off a delay, at random: a room that lost its server returns spread out */
const RECONNECT_JITTER = 0.25
/** An attempt not welcomed by then has failed: without this, a hung one would block all others */
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 10_000
/** Attempts have failed for this long since the socket dropped: leave it to the person */
export const RECONNECT_GIVE_UP_MS = 5 * 60_000
/** Sent without hearing anything back, by which time the server has given up on this socket too */
const MAX_UNANSWERED_PINGS = STALE_AFTER_MS / HEARTBEAT_INTERVAL_MS
/**
 * A socket can look open and be dead: a phone that slept, went to another app or changed networks
 * reports no close for a long time, and everything sent on it is lost. The server answers every
 * message in well under a second (~75 ms measured from Taiwan, 2026-11-13), so silence this long
 * after a send means trouble; a ping then settles it.
 */
export const REPLY_TIMEOUT_MS = 3_000
/** A ping sent to check the socket: no answer by then, and it is given up for a new one */
export const PROBE_TIMEOUT_MS = 4_000
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

type RoomSocket = Pick<RoomConnection, 'send' | 'leave'> & {
  /** Checks that the socket still answers; replaced if it does not */
  probe: () => void
}

type RoomSocketHandlers = Omit<RoomHandlers, 'onEnd' | 'onReconnecting'> & {
  /** Before the `onView` of the same `welcome` */
  onWelcome: () => void
  /**
   * This socket is over; `welcomed`: it had joined; `unanswered`: something sent on it was still
   * waiting for an answer. Not called after `leave`
   */
  onClosed: (code: number, welcomed: boolean, unanswered: boolean) => void
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
  /** A message went out and nothing has come back since */
  let awaiting = false
  /** No reply after a send: time to ping */
  let replyTimer: ReturnType<typeof setTimeout> | undefined
  /** A ping is out to check the socket: no answer by then and it is dead */
  let probeTimer: ReturnType<typeof setTimeout> | undefined

  const dead = () => {
    closed(CLOSE_ABNORMAL)
    socket.close()
  }

  const probe = () => {
    if (!current || !joined || probeTimer !== undefined) return
    if (socket.readyState !== WebSocket.OPEN) return dead()
    sendRaw(HEARTBEAT_PING)
    probeTimer = setTimeout(dead, PROBE_TIMEOUT_MS)
  }

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
    // Anything at all from the server: the socket is alive
    awaiting = false
    clearTimeout(replyTimer)
    clearTimeout(probeTimer)
    replyTimer = undefined
    probeTimer = undefined
    if (!current || typeof event.data !== 'string' || event.data === HEARTBEAT_PONG) return
    const message = parseServerMessage(event.data)
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
      case 'chat':
        if (!joined) return
        handlers.onChat(message.messages.filter(isChatMessage), message.reset === true)
        return
    }
  }

  const closed = (code: number) => {
    clearInterval(heartbeat)
    clearTimeout(replyTimer)
    clearTimeout(probeTimer)
    if (!current) return
    current = false
    handlers.onClosed(code, joined !== null, awaiting)
  }

  socket.onclose = (event: CloseEvent) => closed(event.code)

  return {
    send: (message) => {
      if (!current || !joined) return false
      if (socket.readyState !== WebSocket.OPEN) {
        dead()
        return false
      }
      sendRaw(JSON.stringify(message))
      awaiting = true
      if (replyTimer === undefined && probeTimer === undefined) {
        replyTimer = setTimeout(() => {
          replyTimer = undefined
          probe()
        }, REPLY_TIMEOUT_MS)
      }
      return true
    },
    probe,
    leave: () => {
      current = false
      clearInterval(heartbeat)
      clearTimeout(replyTimer)
      clearTimeout(probeTimer)
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
    unwatch()
    handlers.onEnd(end)
  }

  const onWelcome = () => {
    if (lostAt === null) return
    stopReconnecting()
    // The server only says so when some are running, and these are from before the drop
    handlers.onTimers([])
  }

  const onClosed = (code: number, welcomed: boolean, unanswered: boolean) => {
    socket = null
    clearTimeout(timer)
    if (welcomed && unanswered && finalEnd(code) === null) handlers.onUnanswered?.()
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

  // Back on the page, the network or the window: a socket that looks open may have died meanwhile.
  // Checked at once rather than at the next heartbeat, up to 45 s later
  const check = () => {
    if (document.visibilityState === 'hidden') return
    if (socket) socket.probe()
    else if (lostAt !== null) wake()
  }
  const watched = ['online', 'focus', 'pageshow'] as const
  for (const event of watched) window.addEventListener(event, check)
  document.addEventListener('visibilitychange', check)
  function unwatch() {
    for (const event of watched) window.removeEventListener(event, check)
    document.removeEventListener('visibilitychange', check)
  }

  open()

  return {
    send: (message) => socket?.send(message) ?? false,
    leave: () => {
      stopReconnecting()
      unwatch()
      socket?.leave()
      socket = null
    },
  }
}
