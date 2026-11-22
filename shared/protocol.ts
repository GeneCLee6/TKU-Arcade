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
//    A game with `GameMeta.readyCheck` (2026-11-21: the kart) starts only once every seated person
//    but the host is ready, and online: otherwise `start` is refused with `not_ready`. Its members
//    stop being ready when their socket drops (they press again when they are back); changing kart
//    or driver (`set_look`) or side (`set_team`) keeps it. `rematch` does not ask: the race just
//    run was everyone's ready.
// 9. What only the host can do. `reopen`, from `playing` or `ended`, drops the game and goes back to
//    `waiting` with everyone in their seats. `rematch`, from `ended`, starts a new game with whoever
//    is seated. `set_game`, from any status, drops any game and goes to `waiting` with the new game
//    and its options; a seat the new game does not have moves its member to a free seat or out of
//    any seat. `set_options`, only while `waiting`, replaces the rule options. Both clear `ready`,
//    since nobody has said they are set for these rules. `transfer` hands the host to an online
//    member. `kick` removes a member (also an offline one) and closes their socket with
//    CloseCode.kicked; they cannot join again for KICK_BAN_MS (18.). During a game the seat
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
// 14. Computer seats (2026-11-17, a game with `GameModule.bots`: the kart). `add_bot`, from the host
//    while `waiting` or `ended`, puts a computer member (`RoomMember.bot`) in the lowest free seat;
//    the room picks its name. `kick` of a computer member removes it, with no ban, but not while a
//    game is played. A computer seat is always ready and never offline, and plays like any other;
//    its moves come from the host's browser: an `action` with `botSeat`, and binary frames wrapped in
//    PROXY_FRAME. The room takes either only from the host and only for a computer seat in the game;
//    everything else about them is judged as for anyone. When the host's socket closes or the host
//    changes during a game, the game is told nobody will move the computer seats any more
//    (`RealtimeModule.abandon`: the kart retires them).
// 15. Teams (2026-11-18, the kart's team race). `set_team` puts a member on a side (0 or 1) or, with
//    null, leaves it to the game: one's own, or anyone's from the host (`member`), in any status
//    but `playing`. It is `RoomMember.team`, and each seat's goes to the game when it starts
//    (`Seat.team`); a game without teams ignores it. Nothing else about the room reads it.
// 16. Rule options as a patch (2026-11-22): `set_options` with `patch: true` carries only the fields
//    that changed, merged into the room's options, so two quick changes in a row both stay (the
//    second no longer carries the first's old value). Without `patch` (a page from before) it is
//    the whole set, as before: a missing field gets its default.
// 17. Seats of people who are gone (2026-11-22). While the room is `waiting` or `ended`, a member
//    offline for SEAT_RELEASE_MS gives up their seat (a sweep finds it, so up to SWEEP_INTERVAL_MS
//    later); being absent by then, they are removed as a spectator would be (10.), unless they are
//    the host. During a game the seat stays theirs, and 10. and 11. apply as before. `leave` is
//    going on purpose (the lobby link): at once, the host passes on (to the earliest member online,
//    seated ones first; with nobody online, to the earliest other person; with none, to whoever
//    joins next), and the socket is closed with CloseCode.left. While `waiting` or `ended` the member
//    is removed; during a game a seated member is `absent` at once (their seat can be covered) and
//    may come back with their token, a spectator is removed.
// 18. Kicks (2026-11-22): besides the token, for KICK_BAN_MS the room refuses someone new whose
//    session is the kicked member's club account, or who comes from the kicked member's hashed
//    address (worker/address.ts) with the same name (as uniqueName compares them). The address
//    alone never bans: a campus or a dorm shares one.
// 19. Public or not (2026-11-22): `RoomInfo.public` says the room is listed on the home page
//    while it waits for people (and has no password); `set_public` is the host's, in any status.
//    A room nobody sends anything to for ROOM_IDLE_MAX_MS is deleted as in 13., sockets or not (a
//    tab left open for days).
//
// A browser of another version is refused at the upgrade with CloseCode.versionMismatch and told to
// reload. View types are `type` aliases, not interfaces, so they stay assignable to JsonValue.
import { normalizeChatText, type ChatMessage } from './chat.ts'
import { acceptableName } from './nickname.ts'
import type { GameError, GameProjection, OptionValues, SeatId } from './games/types.ts'
import type { JsonValue, PatchOp } from './patch.ts'

/**
 * Bumped on any change a browser of the previous version could not understand.
 * 2 (2026-11-17): patches diff arrays too (shared/patch.ts: an item set by its index, `splice`).
 * A version-1 page would turn an array into an object on such a patch, so it is refused at the
 * upgrade (CloseCode.versionMismatch) and asked to reload; the replay of a finished game
 * (GET /api/rooms/<id>/replay) keeps version 1's patches, so an old page can still play it.
 */
export const PROTOCOL_VERSION = 2

export const HEARTBEAT_PING = 'ping'
export const HEARTBEAT_PONG = 'pong'
export const HEARTBEAT_INTERVAL_MS = 15_000
/** Three missed heartbeats */
export const STALE_AFTER_MS = 45_000
/** A socket must send `join` this soon after opening; the next sweep closes it */
export const JOIN_TIMEOUT_MS = 10_000
/** How long until a disconnected member is `absent`, and loses the host if they had it (AC-2.3) */
export const RECONNECT_GRACE_MS = 45_000
/**
 * How long a kicked member cannot join again (E1): their seat token, their account, or their
 * address with their name (18. above). Five minutes before 2026-11-22
 */
export const KICK_BAN_MS = 10 * 60_000
/** While `waiting` or `ended`, how long someone offline keeps their seat (17. above) */
export const SEAT_RELEASE_MS = 90_000
/** How often the room looks for sockets past those limits, so a close can come this much later */
export const SWEEP_INTERVAL_MS = 15_000
/** Members a room keeps, seated or not, online or not; someone new past this gets roomFull */
export const MAX_MEMBERS = 64
/** Sockets open at once: every member, and a few that have not joined yet */
export const MAX_CONNECTIONS = MAX_MEMBERS + 8
/**
 * Sockets one address (an IPv4 address, or an IPv6 /64) may hold open in one room (e12-t06), so
 * that a script cannot take every place. Well above one household or a club's shared campus Wi-Fi
 * at one table; past it, CloseCode.tooManyConnections
 */
export const MAX_CONNECTIONS_PER_ADDRESS = 24
/** How long a room stays with nobody in it, or finished with nothing happening, before it is deleted */
export const ROOM_CLEANUP_MS = 10 * 60_000
/** A room nobody has sent anything to for this long is deleted, sockets open or not (19. above) */
export const ROOM_IDLE_MAX_MS = 24 * 60 * 60_000

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
  /** This member left on purpose (`leave`, 17. above): nothing to reconnect to */
  left: 4413,
  /** A message that does not parse */
  badMessage: 4422,
  /**
   * Too many sockets from this address (e12-t06): in this room (MAX_CONNECTIONS_PER_ADDRESS), or
   * opened in the last minute anywhere on the site (worker/rooms.ts)
   */
  tooManyConnections: 4429,
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
  /** The room's short number (shared/room-code.ts), when it has one */
  code?: string
  /**
   * The room's password, when it has one (e1-t16): only members are sent a view, and each of them
   * got in with it or was already there, so they may see it to pass it on
   */
  password?: string
  /**
   * Listed on the home page while it waits for people and has no password (19. above); absent for
   * a room reachable by link only
   */
  public?: true
}

/** One person in the room. The seat token is never part of the view: only its owner gets it */
export type RoomMember = {
  id: string
  name: string
  /** Null for a spectator */
  seat: SeatId | null
  /**
   * Says they are set to play; always false without a seat. Holds back `start` only in a game with
   * `GameMeta.readyCheck` (8. above)
   */
  ready: boolean
  host: boolean
  /** False from the moment the socket drops; the member keeps its seat */
  online: boolean
  /** Offline for longer than RECONNECT_GRACE_MS: the host can cover this seat's turns */
  absent: boolean
  /**
   * A game's cosmetic choice, for the others to see (e10-t05: the kart's `kart.driver`). The room
   * only checks its shape (LOOK_PATTERN); the game reads it. Absent until set
   */
  look?: string
  /** The side this member is on in a game with teams (15. above): 0 or 1; absent until set */
  team?: number
  /**
   * A computer member (14. above): its level (`GameModule.bots.levels`) and its name's id
   * (`bots.names`), which the browser shows through the game's strings; `name` is only a fallback
   */
  bot?: { level: string; name: string }
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
 * - `not_ready`: `start` of a game with `GameMeta.readyCheck` while someone seated (not the host,
 *   not a computer) is not ready or is offline
 * - `bad_member`: `kick` of yourself or nobody; `transfer` to yourself, nobody or someone offline
 * - `bad_game`: `set_game` with a game this server does not have
 * - `game_failed`: the game module threw (a bug, not your mistake); nothing changed
 * - `cannot_cover`: `cover` of a seat that is not in `RoomView.coverable`, or in a way it does not allow
 * - `unavailable`: this server does not do that yet
 * - `password_required`: `join` of someone new, without a password, to a room that has one (e1-t16)
 * - `wrong_password`: `join` with the wrong one; after PASSWORD_TRIES of them the socket is closed
 * - `game_disabled`: `start`, `rematch` or `set_game` of a game the owner has paused (e12-t11); a
 *   game already being played goes on to its end
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
  | 'not_ready'
  | 'bad_member'
  | 'bad_game'
  | 'cannot_cover'
  | 'game_failed'
  | 'unavailable'
  | 'password_required'
  | 'wrong_password'
  | 'game_disabled'

/** A refusal, to the sender only. `game_error`: the game refused the action, `error` says why */
export type ErrorMessage =
  { t: 'error'; code: ErrorCode } | { t: 'error'; code: 'game_error'; error: GameError }

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

/** Someone's reaction (e7-t11), to everyone in the room, the sender too. Gone once it has floated */
export type ReactionMessage = { t: 'reaction'; member: string; reaction: number }

/**
 * A clock ping (e9-t01), as a binary frame so that it costs the first load nothing: CLOCK_FRAME,
 * then the browser's own time as a float64 (little-endian); the answer is the same with the
 * server's clock (ms since the epoch) after it. A real-time game uses it to count down to the
 * same moment everywhere (shared/kart/net.ts `clockOffset`). Relayed frames start with a seat
 * (0 to 63), so the first byte tells the two apart
 */
export const CLOCK_FRAME = 255
export const CLOCK_PING_BYTES = 9
export const CLOCK_ANSWER_BYTES = 17

/**
 * A frame the host sends for a computer seat (14. above): PROXY_FRAME, the seat, then the frame as
 * that seat's own browser would send it. The room takes it only from the host, for a computer seat in
 * the game, judges it as that seat's and passes it on to everyone, the host too (whose race draws
 * the computer karts from those, like anyone else's)
 */
export const PROXY_FRAME = 254
/** PROXY_FRAME and the seat */
export const PROXY_HEADER_BYTES = 2

/** `frame`, wrapped to go in for `seat` */
export function proxyFrame(seat: SeatId, frame: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(frame.byteLength + PROXY_HEADER_BYTES)
  bytes[0] = PROXY_FRAME
  bytes[1] = seat
  bytes.set(frame, PROXY_HEADER_BYTES)
  return bytes
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | PatchMessage
  | ErrorMessage
  | TimerMessage
  | ChatServerMessage
  | ReactionMessage

// ── Browser → server ─────────────────────────────────────────────────────────────────────────

/**
 * The first message on every socket; `token` is null for someone new. `password`: a room that has
 * one (e1-t16) lets in someone new only with it; a member coming back with their token needs none
 */
export type JoinMessage = { t: 'join'; name: string; token: string | null; password?: string }

/** A room password's length, in characters (e1-t16) */
export const MAX_PASSWORD_CHARS = 32

/** A password as the room compares it: trimmed; null when empty or too long */
export function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 || [...trimmed].length > MAX_PASSWORD_CHARS ? null : trimmed
}

/** A `patch` went missing: send a `snapshot` */
export type ResyncMessage = { t: 'resync' }

/**
 * A game action. Only its envelope is checked here: `GameModule.reduce` checks `action` itself.
 * `botSeat`: the host acting for a computer seat (14. above); left out, it is the sender's own
 */
export type ActionMessage = { t: 'action'; action: JsonValue; botSeat?: SeatId }

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

/** The host adds a computer member at `level` to the lowest free seat (14. above); `look` as set_look */
export type AddBotMessage = { t: 'add_bot'; level: string; look?: string }

/** The host removes a member from the room; they cannot join again for KICK_BAN_MS (18. above) */
export type KickMessage = { t: 'kick'; member: string }

/** The host hands the host to another online member */
export type TransferMessage = { t: 'transfer'; member: string }

/** The host deletes the room for everyone */
export type DissolveMessage = { t: 'dissolve' }

/** The host changes the game; back to `waiting`. Options the game does not accept get defaults */
export type SetGameMessage = { t: 'set_game'; gameId: string; options?: OptionValues }

/**
 * The host changes the rule options while `waiting`. With `patch` (16. above) only the fields in
 * `options` change; without it they are the whole set, and a missing or invalid one gets its default
 */
export type SetOptionsMessage = { t: 'set_options'; options: OptionValues; patch?: true }

/** Leave the room on purpose (17. above): the seat and the host go at once */
export type LeaveMessage = { t: 'leave' }

/** The host lists the room on the home page, or takes it off (19. above) */
export type SetPublicMessage = { t: 'set_public'; public: boolean }

/** How many reactions there are (e7-t11); the browser draws them, the room only passes on a number */
export const REACTION_COUNT = 6
/** One member's reactions are passed on at most this often; faster ones are dropped quietly */
export const REACTION_MIN_MS = 500

/** A quick reaction for everyone in the room to see float up (e7-t11). Never stored, never locked */
export type ReactMessage = { t: 'react'; reaction: number }

/**
 * The host sets the room's password, or takes it away with null (e1-t16). Someone new needs it to
 * join; a room with one is never listed. Members already in are not asked
 */
export type SetPasswordMessage = { t: 'set_password'; password: string | null }

/** What a `look` may be: one or two short lowercase words joined by a dot */
export const LOOK_PATTERN = /^[a-z0-9-]{1,16}(?:\.[a-z0-9-]{1,16})?$/

/** Show the others a cosmetic choice (RoomMember.look), or take it away with null. Any status */
export type SetLookMessage = { t: 'set_look'; look: string | null }

/**
 * Put a member on a side (15. above), or with null leave it to the game. Without `member` it is the
 * sender's own; with it, the host's choice for that member (a computer member too)
 */
export type SetTeamMessage = { t: 'set_team'; team: 0 | 1 | null; member?: string }

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
  | SetPasswordMessage
  | SetLookMessage
  | SetTeamMessage
  | ReactMessage
  | AddBotMessage
  | LeaveMessage
  | SetPublicMessage

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/rooms. Options the game does not accept fall back to its defaults. `public` lists the
 * room on the home page while it waits for people; without it the room is reachable by link only.
 */
/** `password` (e1-t16): someone new must bring it to join; a room with one is never public */
/**
 * `bots` (2026-11-21, the lobby's "Play the computer"): a private room with this many computer
 * players already seated, for a game the room plays them in (`GameModule.bot`), whose game starts
 * as soon as its first person joins (and so becomes its host). `count` puts the table at least at
 * the game's fewest players and at most at its most, `level` is one of the game's `bots.levels`;
 * anything else is refused (400 `bad_bots`). Such a room is never public
 */
export type CreateRoomRequest = {
  gameId: string
  options?: OptionValues
  public?: boolean
  password?: string
  bots?: QuickBots
}

/** CreateRoomRequest.bots */
export type QuickBots = { count: number; level: string }

/** 201 from POST /api/rooms */
/** `code`: the room's short number, null when none could be given (the link still works) */
export type CreateRoomResponse = { id: string; code: string | null }

/** What the daily metrics count (e12-t07); the kart's frame rate and load time in bands (e12-t10) */
export type MetricName =
  | 'room_created'
  | 'game_started'
  | 'game_finished'
  | `kart_fps_${KartFpsBand}`
  | `kart_load_${KartLoadBand}`

export type KartFpsBand = 'under30' | '30to45' | '45to55' | '55up'
export type KartLoadBand = 'under1s' | '1to3s' | '3to6s' | '6sup'

/** POST /api/telemetry (e12-t10): one kart session's frame rate and load time, nothing else */
export type KartTelemetry = {
  kind: 'kart'
  fps: number
  loadMs: number
  quality: 'low' | 'medium' | 'high'
}

export const fpsBand = (fps: number): KartFpsBand =>
  fps < 30 ? 'under30' : fps < 45 ? '30to45' : fps < 55 ? '45to55' : '55up'
export const loadBand = (ms: number): KartLoadBand =>
  ms < 1000 ? 'under1s' : ms < 3000 ? '1to3s' : ms < 6000 ? '3to6s' : '6sup'

/** One day's count of one metric for one game */
export type DailyMetricRow = { day: string; metric: MetricName; game: string; count: number }

/** GET /api/stats (e12-t07): the owner's daily counts, from `since` (YYYY-MM-DD, Taipei) on */
export type StatsResponse = { since: string; rows: DailyMetricRow[] }

/**
 * GET /api/flags (e12-t11): the games the owner has paused. Absent from the list means open, which is
 * also what an unreadable flag table means (a flag only ever closes)
 */
export type FlagsResponse = { disabled: string[] }

/** GET /api/admin/flags (e12-t11, owner): every game the server has, open or not */
export type AdminFlagsResponse = { games: { id: string; enabled: boolean; updatedAt: number | null }[] }

/** PUT /api/admin/flags (e12-t11, owner): open or pause one game */
export type SetFlagRequest = { game: string; enabled: boolean }

/** GET /api/voice (e1-t14): whether this site can open a LongTalk voice room */
export type VoiceStatus = { available: boolean }

/** 201 from POST /api/voice: the new voice room's address, to post in the chat */
export type VoiceResponse = { url: string }

/** GET /api/codes/<code>: the room a short number belongs to */
export type RoomCodeResponse = { id: string }

/** GET /api/rooms/<id>: what the screen before joining shows; nothing about anyone's game */
export type RoomSummary = {
  id: string
  gameId: string
  status: RoomStatus
  /** Everyone in the room, seated or not, online or not */
  members: number
  seated: number
  maxSeats: number
  /** The room has a password (e1-t16): someone new is asked for it before joining */
  locked?: true
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

// Characters that show as nothing (e12-t06), so that a name is not blank and two that look the same
// are not told apart by one: soft hyphen, zero-width space and non-joiner, direction marks, word
// joiner and invisible operators, the Hangul and Braille blanks, the byte order mark, tag
// characters. The zero-width joiner is kept where it builds an emoji, see LONE_JOINER
const INVISIBLE_NAME_CHARS =
  /\u034F|[\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B\u200C\u200E\u200F\u2060-\u2064\u206A-\u206F\u2800\u3164\uFEFF\uFFA0\u{E0000}-\u{E007F}]/gu
// A zero-width joiner that is not between two parts of an emoji
const LONE_JOINER =
  /(?<![\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])\u200D|\u200D(?!\p{Extended_Pictographic})/gu

/**
 * A nickname as the room stores it: unsafe and invisible characters removed, runs of whitespace
 * (the full-width space too) collapsed to one space, trimmed; null when nothing is left or it is
 * too long. The browser uses it before sending, the server again on receipt. What the name may
 * not say is shared/nickname.ts
 */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // NFC last: removing a character can bring together two that compose
  const name = raw
    .replace(UNSAFE_NAME_CHARS, '')
    .replace(INVISIBLE_NAME_CHARS, '')
    .replace(LONE_JOINER, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
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
/** Whether two names look the same (as uniqueName tells them apart) */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b)
}

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
      // Also refused: a name that passes for the site or is abuse (e12-t06, shared/nickname.ts)
      const name = acceptableName(value.name)
      if (name === null) return null
      // A malformed token is someone new, not an error: the browser may hold an old one
      const password = normalizePassword(value.password)
      return {
        t: 'join',
        name,
        token: isSeatToken(value.token) ? value.token : null,
        ...(password !== null ? { password } : {}),
      }
    }
    case 'resync':
      return { t: 'resync' }
    case 'action':
      if (value.action === undefined) return null
      if (value.botSeat === undefined) return { t: 'action', action: value.action as JsonValue }
      return Number.isSafeInteger(value.botSeat) && (value.botSeat as number) >= 0
        ? { t: 'action', action: value.action as JsonValue, botSeat: value.botSeat as SeatId }
        : null
    case 'add_bot':
      if (typeof value.level !== 'string' || !/^[a-z0-9-]{1,16}$/.test(value.level)) return null
      if (value.look === undefined) return { t: 'add_bot', level: value.level }
      return typeof value.look === 'string' && LOOK_PATTERN.test(value.look)
        ? { t: 'add_bot', level: value.level, look: value.look }
        : null
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
      if (!isPlainObject(value.options)) return null
      if (value.patch === undefined) return { t: 'set_options', options: value.options as OptionValues }
      return value.patch === true
        ? { t: 'set_options', options: value.options as OptionValues, patch: true }
        : null
    case 'leave':
      return { t: 'leave' }
    case 'set_public':
      return typeof value.public === 'boolean' ? { t: 'set_public', public: value.public } : null
    case 'react':
      return Number.isInteger(value.reaction) &&
        (value.reaction as number) >= 0 &&
        (value.reaction as number) < REACTION_COUNT
        ? { t: 'react', reaction: value.reaction as number }
        : null
    case 'set_look':
      return value.look === null ||
        (typeof value.look === 'string' && LOOK_PATTERN.test(value.look))
        ? { t: 'set_look', look: value.look as string | null }
        : null
    case 'set_team': {
      if (value.team !== null && value.team !== 0 && value.team !== 1) return null
      if (value.member === undefined) return { t: 'set_team', team: value.team }
      return typeof value.member === 'string' && value.member !== ''
        ? { t: 'set_team', team: value.team, member: value.member }
        : null
    }
    case 'set_password': {
      if (value.password === null) return { t: 'set_password', password: null }
      const password = normalizePassword(value.password)
      return password === null ? null : { t: 'set_password', password }
    }
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
    case 'reaction':
      return typeof value.member === 'string' &&
        Number.isInteger(value.reaction) &&
        (value.reaction as number) >= 0 &&
        (value.reaction as number) < REACTION_COUNT
        ? (value as ReactionMessage)
        : null
    default:
      return null
  }
}

/** The WebSocket path for a room (relative to the site's origin) */
export function roomSocketPath(roomId: string): string {
  return `/ws/${roomId}?v=${PROTOCOL_VERSION}`
}
