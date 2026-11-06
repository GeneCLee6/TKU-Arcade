// The messages between a browser and its room's Durable Object (RoomDO), over one WebSocket per
// person: /ws/<roomId>?v=<PROTOCOL_VERSION>. Shared by the Worker and the browser. Every message is
// language-neutral: what is shown as text travels as an i18n key (shared/games/types.ts TextRef).
//
// 1. The browser opens the socket and sends `join` (its nickname, and the seat token it was given
//    last time, if any). The server answers `welcome`: the person's member id, the token to keep,
//    and the whole room as this person may see it (`state`). A token the room still knows brings
//    back the same member and seat within RECONNECT_GRACE_MS; any other token makes a new member.
//    The token travels only here, never in the URL. A socket that does not join within
//    JOIN_TIMEOUT_MS is closed.
// 2. Every change after that is a `patch` (shared/patch.ts) numbered `rev`. Each socket has its own
//    `state`, because `state.game` is that viewer's projection (shared/games/match.ts projectGame):
//    the server diffs per viewer, and hidden information is never in anyone else's patch. A browser
//    that sees a gap in `rev` sends `resync` and gets a `snapshot`.
// 3. `action` carries a game action. RoomDO decides who sent it from the socket (`Actor`), runs
//    `applyAction`, and on success everyone gets their `patch`. A refusal goes to the sender only,
//    as `error` with code `game_error`, and nobody else hears of it.
// 4. `timer` replaces the list of countdowns running now (GameModule.timers), after `welcome` and
//    whenever it changes. Times are durations, not clock times: browsers' clocks disagree.
// 5. `chat` goes to everyone in the room (the sender too: that is its acknowledgement). While the
//    game says `chatLocked`, it is refused with `chat_locked`. (B4 ports the limits, e1-t07; until
//    then every `chat` is refused with `unavailable`.)
// 6. Heartbeat: the browser sends the text frame `ping` every HEARTBEAT_INTERVAL_MS and gets `pong`
//    (answered without waking the object); a socket silent for STALE_AFTER_MS is closed.
// 7. A message that does not parse is a protocol error: the socket is closed with
//    CloseCode.badMessage (E2: 「協定錯誤關連線」), unlike `error`, which is an answer to a well-formed
//    message that was refused.
// 8. The room's life is waiting → playing → ended → waiting. The first member to join is the host.
//    While the room is `waiting`, someone joining takes the lowest free seat (none free: a
//    spectator), and `sit` moves a member to a free seat or, with null, out of their seat. Anyone
//    joining later is a spectator. `start` (host only, at least `RoomInfo.minPlayers` seated) begins
//    the game: the seated members, in seat order, are renumbered 0, 1, ... n - 1, as games expect.
//    When the game is over the room is `ended`, until `reopen` (host only) drops the game and goes
//    back to `waiting` with everyone in their seats.
//
// A browser of another version is refused at the upgrade with CloseCode.versionMismatch and told to
// reload. View types are `type` aliases, not interfaces, so they stay assignable to JsonValue.
import type { GameError, GameProjection, OptionValues, SeatId } from './games/types.ts'
import type { JsonValue, PatchOp } from './patch.ts'

/** Bumped on any change a browser of the previous version could not understand */
export const PROTOCOL_VERSION = 1

export const HEARTBEAT_PING = 'ping'
export const HEARTBEAT_PONG = 'pong'
export const HEARTBEAT_INTERVAL_MS = 15_000
/** Three missed heartbeats */
export const STALE_AFTER_MS = 45_000
/** A socket must send `join` this soon after opening; the next sweep closes it */
export const JOIN_TIMEOUT_MS = 10_000
/** How long a disconnected member keeps its seat without being marked offline (AC-2.3) */
export const RECONNECT_GRACE_MS = 45_000
/** How often the room looks for sockets past those limits, so a close can come this much later */
export const SWEEP_INTERVAL_MS = 15_000
/** Members a room keeps, seated or not, online or not; someone new past this gets roomFull */
export const MAX_MEMBERS = 64
/** Sockets open at once: every member, and a few that have not joined yet */
export const MAX_CONNECTIONS = MAX_MEMBERS + 8

/** Client messages larger than this (UTF-16 code units) are refused without parsing */
export const MAX_CLIENT_MESSAGE_CHARS = 16_384
/** A nickname's length in characters (code points), after normalizeName (E1) */
export const MAX_NAME_CHARS = 16
/** A chat message's length in characters (code points) (E1) */
export const MAX_CHAT_CHARS = 500

/**
 * WebSocket close codes the server uses. The browser reconnects after any close but the 44xx ones,
 * except `stale` (a socket the server stopped hearing from, e.g. a phone that slept)
 */
export const CloseCode = {
  /** The browser speaks another protocol version: reload the page */
  versionMismatch: 4400,
  /** No room with this id (never created, or closed) */
  roomNotFound: 4404,
  /** No heartbeat for STALE_AFTER_MS, or no `join` within JOIN_TIMEOUT_MS */
  stale: 4408,
  /** The room has as many connections as it takes */
  roomFull: 4409,
  /** The same token joined from another socket (a second tab, or a reload that beat the close) */
  replaced: 4410,
  /** A message that does not parse */
  badMessage: 4422,
} as const

// ── The room as one person sees it ───────────────────────────────────────────────────────────

/** waiting → playing → ended → waiting (E1) */
export type RoomStatus = 'waiting' | 'playing' | 'ended'

export type RoomInfo = {
  id: string
  /** The GameModule this room plays (shared/games/index.ts) */
  gameId: string
  status: RoomStatus
  /** The rule options the host chose, already checked against the game's schema */
  options: OptionValues
  /** `start` needs this many seated: here so the waiting room need not load the game's rules */
  minPlayers: number
  /** Seats are numbered 0 to maxSeats - 1 */
  maxSeats: number
}

/** One person in the room. The seat token is never part of the view: only its owner gets it */
export type RoomMember = {
  id: string
  name: string
  /** Null for a spectator */
  seat: SeatId | null
  host: boolean
  /** The socket dropped; the member keeps its seat */
  online: boolean
}

/** What `welcome` and `snapshot` send and `patch` keeps up to date; different for every viewer */
export type RoomView = {
  room: RoomInfo
  members: Record<string, RoomMember>
  /** Null while no game has started */
  game: GameProjection | null
}

// ── Server → browser ─────────────────────────────────────────────────────────────────────────

export type WelcomeMessage = {
  t: 'welcome'
  v: typeof PROTOCOL_VERSION
  /** This connection's member id (`state.members[you].seat` is its seat) */
  you: string
  /** Send this in the next `join` to come back to the same member and seat */
  token: string
  rev: number
  state: RoomView
}

export type SnapshotMessage = { t: 'snapshot'; rev: number; state: RoomView }

/** The changes from rev − 1 to `rev`, for this viewer */
export type PatchMessage = { t: 'patch'; rev: number; ops: PatchOp[] }

/**
 * - `forbidden`: this member may not do that
 * - `not_seated`: an `action` from a spectator
 * - `no_game`: an `action` while no game is being played
 * - `chat_locked`: `chat` while the game says `chatLocked`
 * - `rate_limited`: too many messages; this one was not kept
 * - `not_joined`: anything but `join` before `join`
 * - `wrong_status`: not possible in the room's current status (`sit` during a game, ...)
 * - `bad_seat`: `sit` on a seat number the room does not have
 * - `seat_taken`: `sit` on someone else's seat
 * - `not_enough_players`: `start` with fewer than `RoomInfo.minPlayers` seated
 * - `game_failed`: the game module threw (a bug, not your mistake); nothing changed
 * - `unavailable`: this server does not do that yet (`chat` until e1-t07)
 */
export type ErrorCode =
  | 'forbidden'
  | 'not_seated'
  | 'no_game'
  | 'chat_locked'
  | 'rate_limited'
  | 'not_joined'
  | 'wrong_status'
  | 'bad_seat'
  | 'seat_taken'
  | 'not_enough_players'
  | 'game_failed'
  | 'unavailable'

/** A refusal, to the sender only. `game_error`: the game refused the action, `error` says why */
export type ErrorMessage =
  | { t: 'error'; code: ErrorCode }
  | { t: 'error'; code: 'game_error'; error: GameError }

/** One countdown: `GameModule.timers`, with the time the room has counted */
export type TimerInfo = {
  id: string
  /** Left when this message was sent */
  remainingMs: number
  /** The whole countdown, for a progress bar */
  totalMs: number
}

/** The countdowns running now; replaces the previous list, and an empty list means none */
export type TimerMessage = { t: 'timer'; timers: TimerInfo[] }

export type ChatMessage = {
  id: string
  /** The sender's member id */
  from: string
  /** The sender's nickname when they sent it */
  name: string
  text: string
  /** The server's clock */
  at: number
}

/** `reset`: replace every message you have with these. Without it: new messages, append them */
export type ChatServerMessage = { t: 'chat'; messages: ChatMessage[]; reset?: true }

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | PatchMessage
  | ErrorMessage
  | TimerMessage
  | ChatServerMessage

// ── Browser → server ─────────────────────────────────────────────────────────────────────────

/** The first message on every socket; `token` is null for someone new */
export type JoinMessage = { t: 'join'; name: string; token: string | null }

/** A `patch` went missing: send a `snapshot` */
export type ResyncMessage = { t: 'resync' }

/** A game action. Only its envelope is checked here: `GameModule.reduce` checks `action` itself */
export type ActionMessage = { t: 'action'; action: JsonValue }

export type ChatClientMessage = { t: 'chat'; text: string }

/** Move to this seat, or with null out of any seat; only while the room is `waiting` */
export type SitMessage = { t: 'sit'; seat: SeatId | null }

/** The host begins the game */
export type StartMessage = { t: 'start' }

/** The host takes an `ended` room back to `waiting` */
export type ReopenMessage = { t: 'reopen' }

export type ClientMessage =
  | JoinMessage
  | ResyncMessage
  | ActionMessage
  | ChatClientMessage
  | SitMessage
  | StartMessage
  | ReopenMessage

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────

/** POST /api/rooms. Options the game does not accept fall back to its defaults */
export type CreateRoomRequest = { gameId: string; options?: OptionValues }

/** 201 from POST /api/rooms */
export type CreateRoomResponse = { id: string }

/** GET /api/rooms/<id>: what the screen before joining shows; nothing about anyone's game */
export type RoomSummary = {
  id: string
  gameId: string
  status: RoomStatus
  /** Everyone in the room, seated or not, online or not */
  members: number
  seated: number
  maxSeats: number
}

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────

function parseObject(raw: string, maxChars: number): Record<string, unknown> | null {
  if (raw.length > maxChars) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// Control characters and the bidirectional overrides that could make a name render as someone
// else's (U+202A–202E, U+2066–2069)
const UNSAFE_NAME_CHARS = /[\p{Cc}‪-‮⁦-⁩]/gu

/**
 * A nickname as the room stores it: unsafe characters removed, runs of whitespace collapsed,
 * trimmed; null when nothing is left or it is too long. The browser uses it before sending, the
 * server again on receipt.
 */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim()
  if (name === '' || [...name].length > MAX_NAME_CHARS) return null
  return name
}

/** 32 random bytes, base64url without padding: what RoomDO generates and `join` brings back */
const SEAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isSeatToken(value: unknown): value is string {
  return typeof value === 'string' && SEAT_TOKEN_PATTERN.test(value)
}

export function newSeatToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** A browser's message, or null when it is not one this version understands */
export function parseClientMessage(raw: string): ClientMessage | null {
  const value = parseObject(raw, MAX_CLIENT_MESSAGE_CHARS)
  switch (value?.t) {
    case 'join': {
      const name = normalizeName(value.name)
      if (name === null) return null
      // A malformed token is someone new, not an error: the browser may hold an old one
      return { t: 'join', name, token: isSeatToken(value.token) ? value.token : null }
    }
    case 'resync':
      return { t: 'resync' }
    case 'action':
      return value.action === undefined ? null : { t: 'action', action: value.action as JsonValue }
    case 'chat':
      return typeof value.text === 'string' &&
        value.text.trim() !== '' &&
        [...value.text].length <= MAX_CHAT_CHARS
        ? { t: 'chat', text: value.text }
        : null
    case 'sit':
      return value.seat === null ||
        (Number.isSafeInteger(value.seat) && (value.seat as number) >= 0)
        ? { t: 'sit', seat: value.seat as SeatId | null }
        : null
    case 'start':
      return { t: 'start' }
    case 'reopen':
      return { t: 'reopen' }
    default:
      return null
  }
}

const isRev = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

function isRoomView(value: unknown): value is RoomView {
  if (typeof value !== 'object' || value === null) return false
  const view = value as Record<string, unknown>
  return (
    typeof view.room === 'object' &&
    view.room !== null &&
    typeof view.members === 'object' &&
    view.members !== null &&
    typeof view.game === 'object'
  )
}

/**
 * The server's message, or null when it is not one this version understands. Checks the shape the
 * browser relies on, not every field: the server is trusted, the check guards against version skew
 * and proxies, not attackers.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  const value = parseObject(raw, Number.POSITIVE_INFINITY)
  if (!value) return null
  switch (value.t) {
    case 'welcome':
      return value.v === PROTOCOL_VERSION &&
        typeof value.you === 'string' &&
        typeof value.token === 'string' &&
        isRev(value.rev) &&
        isRoomView(value.state)
        ? (value as WelcomeMessage)
        : null
    case 'snapshot':
      return isRev(value.rev) && isRoomView(value.state) ? (value as SnapshotMessage) : null
    case 'patch':
      return isRev(value.rev) && Array.isArray(value.ops) ? (value as PatchMessage) : null
    case 'error':
      return typeof value.code === 'string' ? (value as ErrorMessage) : null
    case 'timer':
      return Array.isArray(value.timers) ? (value as TimerMessage) : null
    case 'chat':
      return Array.isArray(value.messages) ? (value as ChatServerMessage) : null
    default:
      return null
  }
}

/** The WebSocket path for a room (relative to the site's origin) */
export function roomSocketPath(roomId: string): string {
  return `/ws/${roomId}?v=${PROTOCOL_VERSION}`
}
