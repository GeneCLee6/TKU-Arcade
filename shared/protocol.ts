// The messages between a browser and its room's Durable Object (RoomDO), over one WebSocket per
// person: /ws/<roomId>?v=<PROTOCOL_VERSION>. Shared by the Worker and the browser. Every message is
// language-neutral: what is shown as text travels as an i18n key (shared/games/types.ts TextRef).
//
// 1. The browser opens the socket and sends `join` (its nickname, and the seat token it was given
//    last time, if any). The server answers `welcome`: the person's member id, the token to keep,
//    and the whole room as this person may see it (`state`). A token the room still knows brings
//    back the same member and seat, however long it took; any other token makes a new member.
//    The token travels only here, never in the URL. A socket that does not join within
//    JOIN_TIMEOUT_MS is closed. The name in `state` is the one to show, which may differ from the
//    one sent: a new member whose name is taken gets a suffix (uniqueName), and someone coming back
//    keeps their stored name.
// 2. Every change after that is a `patch` (shared/patch.ts) numbered `rev`. Each socket has its own
//    `state`, because `state.game` is that viewer's projection (shared/games/match.ts projectGame):
//    the server diffs per viewer, and hidden information is never in anyone else's patch. A browser
//    that sees a gap in `rev` sends `resync` and gets a `snapshot`.
// 3. `action` carries a game action. RoomDO decides who sent it from the socket (`Actor`), runs
//    `applyAction`, and on success everyone gets their `patch`. A refusal goes to the sender only,
//    as `error` with code `game_error`, and nobody else hears of it.
// 4. `timer` replaces the list of countdowns running now (GameModule.timers), after `welcome` if any
//    runs, before a `snapshot` and whenever it changes. Times are durations, not clock times:
//    browsers' clocks disagree.
// 5. `chat` (shared/chat.ts) goes to everyone in the room, spectators too, and the sender: that is
//    its acknowledgement. Over CHAT_RATE it is refused with `rate_limited`; while the game says
//    `chatLocked`, with `chat_locked`. After every `welcome` the history follows in chunks, the
//    first with `reset`, so a browser coming back replaces what it has.
// 6. Heartbeat: the browser sends the text frame `ping` every HEARTBEAT_INTERVAL_MS and gets `pong`
//    (answered without waking the object); a socket silent for STALE_AFTER_MS is closed.
// 7. A message that does not parse is a protocol error: the socket is closed with
//    CloseCode.badMessage (E2: 「協定錯誤關連線」), unlike `error`, which is an answer to a well-formed
//    message that was refused.
// 8. The room's life is waiting → playing → ended → waiting. The first member to join is the host.
//    While the room is `waiting`, someone joining takes the lowest free seat (none free: a
//    spectator), and `sit` moves a member to a free seat or, with null, out of their seat. Anyone
//    joining later is a spectator. `ready` lets a seated member say they are set; it only informs
//    the others, leaving the seat or starting a game clears it. `start` (host only, at least
//    `RoomInfo.minPlayers` seated, ready or not) begins the game: the seated members, in seat order,
//    are renumbered 0, 1, ... n - 1, as games expect. When the game is over the room is `ended`.
// 9. What only the host can do. `reopen`, from `playing` or `ended`, drops the game and goes back to
//    `waiting` with everyone in their seats. `rematch`, from `ended`, starts a new game with whoever
//    is seated. `set_game`, from any status, drops any game and goes to `waiting` with the new game
//    and its options; a seat the new game does not have moves its member to a free seat or out of
//    any seat. `set_options`, only while `waiting`, replaces the rule options. Both clear `ready`,
//    since nobody has said they are set for these rules. `transfer` hands the host to an online
//    member. `kick` removes a member (also an offline one) and closes their socket with
//    CloseCode.kicked; their seat token cannot join again for KICK_BAN_MS. During a game the seat
//    stays empty: the game may wait for it, and `reopen` is the way out until B4's skip. `dissolve`
//    closes every socket with CloseCode.dissolved and deletes the room for good.
//    A host offline for RECONNECT_GRACE_MS loses the host to the earliest member to join who is
//    online, seated ones first, and comes back as an ordinary member.
// 10. A socket that drops is a member `online: false` at once, who keeps their seat and token. Past
//    RECONNECT_GRACE_MS (found by a sweep, so up to SWEEP_INTERVAL_MS later) they are `absent`, until
//    they come back; a spectator is then removed instead, unless they are the host, and is someone
//    new when they return. The browser reconnects by itself with the same token.
// 11. A game waits for a seat that is absent or empty until the host acts: `RoomView.coverable` lists
//    the seats the game is waiting for right now and what it allows (`GameModule.skipAction`,
//    `meta.proxyTurns`). `cover` (host only) skips that turn or plays a random legal action for it;
//    anything else is refused with `cannot_cover`.
// 12. `sit` also works while `ended`, so that a spectator can take a free seat for the rematch.
// 13. A room with no socket open for ROOM_CLEANUP_MS, or `ended` with nothing happening for that long,
//    is deleted: any socket left is closed with CloseCode.roomNotFound (RoomHost.sweep).
//
// A browser of another version is refused at the upgrade with CloseCode.versionMismatch and told to
// reload. View types are `type` aliases, not interfaces, so they stay assignable to JsonValue.
import { normalizeChatText, type ChatMessage } from './chat.ts'
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
/** How long until a disconnected member is `absent`, and loses the host if they had it (AC-2.3) */
export const RECONNECT_GRACE_MS = 45_000
/** How long a kicked member's seat token cannot join again (E1) */
export const KICK_BAN_MS = 5 * 60_000
/** How often the room looks for sockets past those limits, so a close can come this much later */
export const SWEEP_INTERVAL_MS = 15_000
/** Members a room keeps, seated or not, online or not; someone new past this gets roomFull */
export const MAX_MEMBERS = 64
/** Sockets open at once: every member, and a few that have not joined yet */
export const MAX_CONNECTIONS = MAX_MEMBERS + 8
/** How long a room stays with nobody in it, or finished with nothing happening, before it is deleted */
export const ROOM_CLEANUP_MS = 10 * 60_000

/** Client messages larger than this (UTF-16 code units) are refused without parsing */
export const MAX_CLIENT_MESSAGE_CHARS = 16_384
/** A nickname's length in characters (code points), after normalizeName (E1) */
export const MAX_NAME_CHARS = 16

/**
 * WebSocket close codes the server uses. The browser reconnects after any close but the 44xx ones,
 * except `stale` (a socket the server stopped hearing from, e.g. a phone that slept)
 */
export const CloseCode = {
  /** The browser speaks another protocol version: reload the page */
  versionMismatch: 4400,
  /** No room with this id (never created, closed, or just deleted for being empty or finished) */
  roomNotFound: 4404,
  /** No heartbeat for STALE_AFTER_MS, or no `join` within JOIN_TIMEOUT_MS */
  stale: 4408,
  /** The room has as many connections as it takes */
  roomFull: 4409,
  /** The same token joined from another socket (a second tab, or a reload that beat the close) */
  replaced: 4410,
  /** The host removed this member, or this token was removed less than KICK_BAN_MS ago */
  kicked: 4411,
  /** The host dissolved the room; it no longer exists */
  dissolved: 4412,
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
  /** Says they are set to play; always false without a seat. Does not hold back `start` */
  ready: boolean
  host: boolean
  /** False from the moment the socket drops; the member keeps its seat */
  online: boolean
  /** Offline for longer than RECONNECT_GRACE_MS: the host can cover this seat's turns */
  absent: boolean
}

/** A seat the game is waiting for, whose player is absent or gone, and what the host can do */
export type CoverableSeat = {
  seat: SeatId
  /** The game has a way to pass this turn (`cover` with `skip`) */
  skip: boolean
  /** The game lets the room play a random legal action (`cover` with `proxy`) */
  proxy: boolean
}

/** What `welcome` and `snapshot` send and `patch` keeps up to date; different for every viewer */
export type RoomView = {
  room: RoomInfo
  members: Record<string, RoomMember>
  /** Null while no game has started */
  game: GameProjection | null
  /** Empty unless a game is waiting for an absent or empty seat */
  coverable: CoverableSeat[]
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
 * - `not_seated`: an `action` or `ready` from a spectator
 * - `no_game`: an `action` while no game is being played
 * - `chat_locked`: `chat` while the game says `chatLocked`
 * - `rate_limited`: too many messages; this one was not kept
 * - `not_joined`: anything but `join` before `join`
 * - `wrong_status`: not possible in the room's current status (`sit` during a game, ...)
 * - `bad_seat`: `sit` on a seat number the room does not have
 * - `seat_taken`: `sit` on someone else's seat
 * - `not_enough_players`: `start` or `rematch` with fewer than `RoomInfo.minPlayers` seated
 * - `bad_member`: `kick` of yourself or nobody; `transfer` to yourself, nobody or someone offline
 * - `bad_game`: `set_game` with a game this server does not have
 * - `game_failed`: the game module threw (a bug, not your mistake); nothing changed
 * - `cannot_cover`: `cover` of a seat that is not in `RoomView.coverable`, or in a way it does not allow
 * - `unavailable`: this server does not do that yet
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
  | 'bad_member'
  | 'bad_game'
  | 'cannot_cover'
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

/** `reset`: replace every message you have with these. Without it: new messages, append them */
export type ChatServerMessage = { t: 'chat'; messages: ChatMessage[]; reset?: true }

export type { ChatMessage }

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

/** Move to this seat, or with null out of any seat; only while the room is `waiting` or `ended` */
export type SitMessage = { t: 'sit'; seat: SeatId | null }

/** Say you are set to play, or take it back; only with a seat, while the room is `waiting` */
export type ReadyMessage = { t: 'ready'; ready: boolean }

/** The host begins the game */
export type StartMessage = { t: 'start' }

/** The host takes a `playing` or `ended` room back to `waiting`, dropping the game */
export type ReopenMessage = { t: 'reopen' }

/** The host deals with a seat in `RoomView.coverable` */
export type CoverMessage = { t: 'cover'; seat: SeatId; how: 'skip' | 'proxy' }

/** The host starts a new game from an `ended` room, with whoever is seated */
export type RematchMessage = { t: 'rematch' }

/** The host removes a member from the room; their token cannot join again for KICK_BAN_MS */
export type KickMessage = { t: 'kick'; member: string }

/** The host hands the host to another online member */
export type TransferMessage = { t: 'transfer'; member: string }

/** The host deletes the room for everyone */
export type DissolveMessage = { t: 'dissolve' }

/** The host changes the game; back to `waiting`. Options the game does not accept get defaults */
export type SetGameMessage = { t: 'set_game'; gameId: string; options?: OptionValues }

/** The host replaces the rule options while `waiting`. A missing or invalid one gets its default */
export type SetOptionsMessage = { t: 'set_options'; options: OptionValues }

export type ClientMessage =
  | JoinMessage
  | ResyncMessage
  | ActionMessage
  | ChatClientMessage
  | SitMessage
  | ReadyMessage
  | StartMessage
  | ReopenMessage
  | RematchMessage
  | CoverMessage
  | KickMessage
  | TransferMessage
  | DissolveMessage
  | SetGameMessage
  | SetOptionsMessage

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/rooms. Options the game does not accept fall back to its defaults. `public` lists the
 * room on the home page while it waits for people; without it the room is reachable by link only.
 */
export type CreateRoomRequest = { gameId: string; options?: OptionValues; public?: boolean }

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

/** A public room waiting for people, as GET /api/lobby shows it to anyone. No member but the host */
export type RoomListing = {
  id: string
  gameId: string
  /** The host's nickname */
  host: string
  seated: number
  maxSeats: number
  createdAt: number
}

/** GET /api/lobby: newest first */
export type LobbyResponse = { rooms: RoomListing[] }

/** How often the home page asks for the list, while it is visible */
export const LOBBY_POLL_MS = 15_000
/** A listed room tells the lobby it is still there this often, even if nothing changed */
export const LOBBY_HEARTBEAT_MS = 4 * 60_000
/** The lobby forgets a room it has not heard from for this long (its removal may have got lost) */
export const LOBBY_TTL_MS = 10 * 60_000
/** Rooms GET /api/lobby answers with */
export const LOBBY_LIST_LIMIT = 50
/** Rooms the lobby keeps track of; past this, a new room is not listed until there is space */
export const LOBBY_MAX_ROOMS = 200

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseObject(raw: string, maxChars: number): Record<string, unknown> | null {
  if (raw.length > maxChars) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  return isPlainObject(value) ? value : null
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
  // NFC last: removing a character can bring together two that compose
  const name = raw.replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim().normalize('NFC')
  // Only zero-width characters would look like nobody at all in the seat list
  if (name.replace(/[\p{Cf}\s]/gu, '') === '' || [...name].length > MAX_NAME_CHARS) return null
  return name
}

// What two names must differ in to look different. Format characters go first, since one between
// two others stops them composing, and whitespace after, since a removed one can leave it doubled
// or at the edge. Upper then lower so that ß and SS, or σ and ς, count as the same letter.
function nameKey(name: string): string {
  return name
    .replace(/\p{Cf}/gu, '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .toLowerCase()
}

/**
 * `name`, or if someone in `taken` looks the same, the first free of `name (2)`, `name (3)`, ...,
 * in the person's own spelling and within MAX_NAME_CHARS, the base giving way to the suffix.
 */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const keys = new Set<string>()
  for (const other of taken) keys.add(nameKey(other))
  if (!keys.has(nameKey(name))) return name
  const chars = [...name]
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const base = chars.slice(0, MAX_NAME_CHARS - suffix.length).join('')
    const candidate = base.trimEnd() + suffix
    if (!keys.has(nameKey(candidate))) return candidate
  }
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
    case 'chat': {
      const text = normalizeChatText(value.text)
      return text === null ? null : { t: 'chat', text }
    }
    case 'cover':
      return Number.isSafeInteger(value.seat) &&
        (value.seat as number) >= 0 &&
        (value.how === 'skip' || value.how === 'proxy')
        ? { t: 'cover', seat: value.seat as SeatId, how: value.how }
        : null
    case 'sit':
      return value.seat === null ||
        (Number.isSafeInteger(value.seat) && (value.seat as number) >= 0)
        ? { t: 'sit', seat: value.seat as SeatId | null }
        : null
    case 'ready':
      return typeof value.ready === 'boolean' ? { t: 'ready', ready: value.ready } : null
    case 'start':
      return { t: 'start' }
    case 'reopen':
      return { t: 'reopen' }
    case 'rematch':
      return { t: 'rematch' }
    case 'dissolve':
      return { t: 'dissolve' }
    case 'kick':
    case 'transfer':
      return typeof value.member === 'string' && value.member !== ''
        ? { t: value.t, member: value.member }
        : null
    case 'set_game':
      if (typeof value.gameId !== 'string' || value.gameId === '') return null
      if (value.options === undefined) return { t: 'set_game', gameId: value.gameId }
      return isPlainObject(value.options)
        ? { t: 'set_game', gameId: value.gameId, options: value.options as OptionValues }
        : null
    case 'set_options':
      return isPlainObject(value.options)
        ? { t: 'set_options', options: value.options as OptionValues }
        : null
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
