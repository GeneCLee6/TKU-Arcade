import { isChatMessage } from '../../shared/chat.ts'
import { readRoomPassword } from './roomPassword.ts'
import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isSeatToken,
  parseServerMessage,
  roomSocketPath,
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
  | 'tooManyConnections'
  | 'connectionLost'
  | 'disconnected'
  | 'replaced'
  | 'kicked'
  | 'dissolved'
  | 'left'

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
   * Back after a drop (welcomed again), or the page is back from the background (2026-11-22): a
   * clock synced against the room's may be off by however long the device slept, and is redone
   */
  onResumed?: () => void
  /**
   * Taps made while reconnecting wait for the new socket (2026-11-22); these were still waiting
   * after QUEUE_TTL_MS and were never sent: the person should make them again
   */
  onUnsent?: (count: number) => void
  /**
   * The socket was found dead while something sent on it had no answer yet: that tap most likely
   * never arrived, and the person should make it again once back. Only with a server from before
   * 2026-11-23: one that acknowledges (shared/protocol.ts 20.) gets it again by itself
   */
  onUnanswered?: () => void
  onError: (error: ErrorMessage) => void
  /** The countdowns running now, replacing the previous list; an empty list means none */
  onTimers: (timers: RoomTimer[]) => void
  /** `reset`: these replace every message so far. Otherwise they are new, or may be repeats */
  onChat: (messages: ChatMessage[], reset: boolean) => void
  /** Someone's reaction (e7-t11), to float up and be gone */
  onReaction?: (member: string, reaction: number) => void
  /** A binary frame (e2-t11): a real-time game's, or the answer to a clock ping */
  onBinary?: (data: Uint8Array) => void
  onEnd: (end: RoomEnd) => void
}

export type RoomConnection = {
  /**
   * False when it could not go out: before `welcome`, or after the end. While reconnecting it waits
   * (up to QUEUE_TTL_MS, MAX_QUEUED of them) and goes out on the new socket once welcomed; with
   * `wait` false it does not, for what has its own way of trying again (chat, the race loop).
   * Since 2026-11-23 what waits is also numbered (`seq`, shared/protocol.ts 20.) and kept until the
   * room acknowledges it: one sent on a socket that turned out dead goes out again, and the room
   * applies it only once
   */
  send: (message: ClientMessage, wait?: boolean) => boolean
  /**
   * Out without waiting for an answer, as a real-time game's frames and clock pings go: twenty a
   * second must not each count as a tap the socket owes a reply to. False when it could not go out
   */
  sendQuiet: (data: Uint8Array) => boolean
  /** After it, nothing from this socket counts any more */
  leave: () => void
  /** While reconnecting: try now rather than at the end of the wait (the banner's button) */
  reconnectNow: () => void
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
/**
 * A first connection that fails is tried again until this long has passed (2026-11-22): before, a
 * single failed upgrade (a deploy, a phone between networks) ended in "Couldn't connect"
 */
export const FIRST_CONNECT_GIVE_UP_MS = 20_000
/**
 * After a 4429 (too many sockets from this address this minute, e.g. a whole campus behind one
 * address coming back after a deploy) the next attempt waits at least this long: the window is a
 * minute, and trying sooner only uses it up again. Before 2026-11-22 a 4429 ended the connection
 */
export const RATE_LIMITED_DELAY_MS = 20_000
/** Taps made while reconnecting wait this long for the new socket, then are given up (onUnsent) */
export const QUEUE_TTL_MS = 10_000
/** At most this many taps wait; past it, send says no */
export const MAX_QUEUED = 16
/** Sent and not yet acknowledged, at most this many are kept to send again; older ones are let go */
export const MAX_UNACKED = 64
/**
 * A tap sent and never acknowledged goes out again on the next socket up to this long after it was
 * made: finding the socket dead alone takes up to REPLY_TIMEOUT_MS + PROBE_TIMEOUT_MS, and the
 * game refuses what no longer fits (another turn, another hand)
 */
export const RESEND_TTL_MS = 30_000
/**
 * Pings sent without hearing anything back: the socket is dead. Three, 45 s: no longer tied to the
 * server's STALE_AFTER_MS, which since 2026-11-22 allows for a background tab's slowed timers
 */
const MAX_UNANSWERED_PINGS = 3
/** Hidden at least this long, a page coming back has its clocks redone (onResumed) */
const RESUME_AFTER_HIDDEN_MS = 1_000
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

/** This page load's id for the room (shared/protocol.ts 20.): 16 random base64url characters */
export function newSession(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

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
    case CloseCode.left:
      return 'left'
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
const canReconnectAfter = (code: number) =>
  code === CloseCode.stale ||
  code === CloseCode.tooManyConnections ||
  code < 4400 ||
  code >= 4500

type RoomSocket = Pick<RoomConnection, 'send' | 'sendQuiet' | 'leave'> & {
  /** Checks that the socket still answers; replaced if it does not */
  probe: () => void
}

type RoomSocketHandlers = Omit<RoomHandlers, 'onEnd' | 'onReconnecting'> & {
  /**
   * Before the `onView` of the same `welcome`; `ack`: how far the room got with this session
   * (shared/protocol.ts 20.), undefined from a server that does not acknowledge
   */
  onWelcome: (ack: number | undefined) => void
  /** Messages up to `seq` have been handled */
  onAck: (seq: number) => void
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
function openRoomSocket(
  roomId: string,
  name: string,
  session: string,
  handlers: RoomSocketHandlers,
  resume = false,
): RoomSocket {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // `resume`: an attempt to come back after a drop, which the site's socket limit allows for
  // (worker/rooms.ts, docs/SECURITY.md §6): a whole room coming back at once is not a flood
  const path = roomSocketPath(roomId) + (resume ? '&resume=1' : '')
  const socket = new WebSocket(`${scheme}//${window.location.host}${path}`)
  // A real-time game's frames (e2-t11) come as bytes
  socket.binaryType = 'arraybuffer'
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
  /** The highest `seq` sent on this socket, and acknowledged (shared/protocol.ts 20.) */
  let sentSeq = 0
  let ackedSeq = 0

  // Waits REPLY_TIMEOUT_MS for an answer, then checks the socket
  const expectReply = () => {
    awaiting = true
    if (replyTimer !== undefined || probeTimer !== undefined) return
    replyTimer = setTimeout(() => {
      replyTimer = undefined
      probe()
    }, REPLY_TIMEOUT_MS)
  }

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
    const password = readRoomPassword(roomId)
    const join: JoinMessage = {
      t: 'join',
      name,
      token: readSeatToken(roomId),
      ...(password !== null ? { password } : {}),
      session,
    }
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
    // A numbered message still owes its ack: an answer to an earlier one does not settle it
    if (sentSeq > ackedSeq) expectReply()
    if (!current) return
    if (event.data instanceof ArrayBuffer) {
      if (joined) handlers.onBinary?.(new Uint8Array(event.data))
      return
    }
    if (typeof event.data !== 'string' || event.data === HEARTBEAT_PONG) return
    const message = parseServerMessage(event.data)
    switch (message?.t) {
      case 'welcome':
        if (joined) return
        joined = { you: message.you, rev: message.rev, view: message.state }
        keepSeatToken(roomId, message.token)
        handlers.onWelcome(message.ack)
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
      case 'reaction':
        if (joined) handlers.onReaction?.(message.member, message.reaction)
        return
      case 'ack':
        ackedSeq = Math.max(ackedSeq, message.seq)
        if (ackedSeq >= sentSeq) {
          awaiting = false
          clearTimeout(replyTimer)
          replyTimer = undefined
        }
        if (joined) handlers.onAck(message.seq)
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
      if (message.seq !== undefined) sentSeq = Math.max(sentSeq, message.seq)
      expectReply()
      return true
    },
    sendQuiet: (data) => {
      if (!current || !joined || socket.readyState !== WebSocket.OPEN) return false
      try {
        socket.send(data as Uint8Array<ArrayBuffer>)
      } catch {
        return false
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
 * connection that fails is tried again for FIRST_CONNECT_GIVE_UP_MS (2026-11-22) and then reported.
 * Reports at most one end.
 */
export function connectRoom(roomId: string, name: string, handlers: RoomHandlers): RoomConnection {
  let socket: RoomSocket | null = null
  /** When the welcomed socket dropped; null unless reconnecting */
  let lostAt: number | null = null
  /** When the first connection failed; null unless trying it again */
  let joiningSince: number | null = null
  let failures = 0
  /** The last close was a 4429: the next attempt waits RATE_LIMITED_DELAY_MS */
  let rateLimited = false
  /** While reconnecting: the wait for the next attempt or, with a socket, its deadline */
  let timer: ReturnType<typeof setTimeout> | undefined
  /** This page load's session (shared/protocol.ts 20.) */
  const session = newSession()
  let nextSeq = 1
  /** The last `welcome` said how far the room got: it acknowledges, and taps are numbered */
  let acking = false
  /**
   * Taps not known to have been handled, in the order made: waiting for the next socket (`sent`
   * false), or, while the room acknowledges, sent and not yet acknowledged
   */
  let outbox: { message: ClientMessage; at: number; sent: boolean }[] = []
  let ended = false
  /** When the page was last hidden; null while it is shown */
  let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null

  const retrying = () => lostAt !== null || joiningSince !== null

  const open = () => {
    socket = openRoomSocket(
      roomId,
      name,
      session,
      { ...handlers, onWelcome, onAck, onClosed },
      lostAt !== null,
    )
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
    const since = lostAt ?? joiningSince
    const limit = lostAt !== null ? RECONNECT_GIVE_UP_MS : FIRST_CONNECT_GIVE_UP_MS
    if (since !== null && Date.now() - since >= limit) {
      finish(rateLimited ? 'tooManyConnections' : lostAt !== null ? 'disconnected' : 'connectionLost')
      return
    }
    const delay = reconnectDelay(failures++)
    timer = setTimeout(attempt, rateLimited ? Math.max(delay, RATE_LIMITED_DELAY_MS) : delay)
  }

  // A wait still running is pointless now, and an attempt under way will do. Not after a 4429: the
  // site asked for a pause, and coming back sooner only uses up its minute again
  const wake = () => {
    if (socket || rateLimited || document.visibilityState === 'hidden') return
    clearTimeout(timer)
    failures = 0
    attempt()
  }

  const stopReconnecting = () => {
    clearTimeout(timer)
    window.removeEventListener('online', wake)
    document.removeEventListener('visibilitychange', wake)
    lostAt = null
    joiningSince = null
    rateLimited = false
  }

  const finish = (end: RoomEnd) => {
    ended = true
    outbox = []
    stopReconnecting()
    unwatch()
    handlers.onEnd(end)
  }

  // What was tapped while reconnecting, and what the room never acknowledged (`ack`: how far it got
  // with this session, shared/protocol.ts 20.), on the socket just welcomed, in order and with the
  // same numbers, so the room applies none twice. What waited too long is not sent (the room may
  // have moved on), and the person is told. Without `ack` (a server from before), only what was
  // never sent goes, as before
  const flush = (ack: number | undefined) => {
    const now = Date.now()
    const waiting = outbox
    outbox = []
    let dropped = 0
    for (const entry of waiting) {
      const seq = entry.message.seq
      if (seq !== undefined && ack !== undefined && seq <= ack) continue
      if (entry.sent && (seq === undefined || ack === undefined)) continue
      const ttl = entry.sent ? RESEND_TTL_MS : QUEUE_TTL_MS
      if (now - entry.at <= ttl && socket?.send(entry.message)) {
        if (acking && seq !== undefined) outbox.push({ ...entry, sent: true })
        continue
      }
      dropped++
    }
    if (dropped > 0) handlers.onUnsent?.(dropped)
  }

  const onWelcome = (ack: number | undefined) => {
    const wasLost = lostAt !== null
    acking = ack !== undefined
    if (!retrying()) return
    stopReconnecting()
    if (!wasLost) return
    // The server only says so when some are running, and these are from before the drop
    handlers.onTimers([])
    flush(ack)
    handlers.onResumed?.()
  }

  const onAck = (seq: number) => {
    outbox = outbox.filter((entry) => !entry.sent || (entry.message.seq ?? 0) > seq)
  }

  const onClosed = (code: number, welcomed: boolean, unanswered: boolean) => {
    socket = null
    clearTimeout(timer)
    // A room that acknowledges gets it again after the reconnect (flush)
    if (welcomed && unanswered && !acking && finalEnd(code) === null) handlers.onUnanswered?.()
    const final = finalEnd(code)
    if (final) return finish(final)
    if (!canReconnectAfter(code)) {
      return finish(!welcomed && lostAt === null ? 'connectionLost' : 'disconnected')
    }
    rateLimited = code === CloseCode.tooManyConnections
    if (retrying()) return attemptFailed()

    failures = 0
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    if (!welcomed) {
      // A first connection that failed: tried again for a while, behind the page's "joining"
      joiningSince = Date.now()
      return attemptFailed()
    }
    lostAt = Date.now()
    handlers.onReconnecting()
    attemptFailed()
  }

  // Back on the page, the network or the window: a socket that looks open may have died meanwhile.
  // Checked at once rather than at the next heartbeat, up to 45 s later. `resume`: Chrome unfreezing
  // a background tab (Page Lifecycle)
  const check = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt ??= Date.now()
      return
    }
    const wasHidden = hiddenAt !== null && Date.now() - hiddenAt >= RESUME_AFTER_HIDDEN_MS
    hiddenAt = null
    if (socket) socket.probe()
    else if (retrying()) wake()
    // The device may have slept: whatever was synced against the room's clock is redone
    if (wasHidden && !retrying()) handlers.onResumed?.()
  }
  const watched = ['online', 'focus', 'pageshow'] as const
  for (const event of watched) window.addEventListener(event, check)
  document.addEventListener('visibilitychange', check)
  document.addEventListener('resume', check)
  function unwatch() {
    for (const event of watched) window.removeEventListener(event, check)
    document.removeEventListener('visibilitychange', check)
    document.removeEventListener('resume', check)
  }

  open()

  return {
    send: (message, wait = true) => {
      if (!wait) return socket?.send(message) ?? false
      if (ended) return false
      const numbered = acking ? { ...message, seq: nextSeq++ } : message
      if (socket?.send(numbered)) {
        if (acking) {
          outbox.push({ message: numbered, at: Date.now(), sent: true })
          // A room that stopped answering is found by the probe long before this
          if (outbox.length > MAX_UNACKED) outbox.splice(outbox.findIndex((entry) => entry.sent), 1)
        }
        return true
      }
      const waiting = outbox.reduce((count, entry) => count + (entry.sent ? 0 : 1), 0)
      if (lostAt === null || waiting >= MAX_QUEUED) return false
      outbox.push({ message: numbered, at: Date.now(), sent: false })
      return true
    },
    sendQuiet: (data) => socket?.sendQuiet(data) ?? false,
    leave: () => {
      ended = true
      outbox = []
      stopReconnecting()
      unwatch()
      socket?.leave()
      socket = null
    },
    reconnectNow: () => {
      if (ended || !retrying()) return
      rateLimited = false
      wake()
    },
  }
}
