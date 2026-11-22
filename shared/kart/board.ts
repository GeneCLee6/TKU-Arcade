// The time trial's site-wide leaderboard (2026-11-23, docs/ARCHITECTURE.md §4.80): what the browser
// and the Worker agree on. Every built-in race track (list.ts; not the challenge tracks, not a custom
// track) has one board per revision of its layout; a nickname keeps its best run there, with the run's
// replay file (replayFile.ts) as proof and as a ghost for anyone to chase. No account yet (E11's F1):
// a board's row is keyed by the nickname, folded, until an account can claim it (docs/SECURITY.md §11).
//
// Pure and small: the menu imports it for the week's track; the physics stamp (boardStamp.ts) and the
// checks (boardCheck.ts) are their own files.
import type { RaceTrackId } from './tracks/list.ts'
import type { DriverId, KartId } from './karts.ts'

/**
 * The tracks with a board: every race track (list.ts's RACE_TRACK_IDS, which a test holds this to),
 * in the menu's order. Written out rather than imported, so that the kart's screens do not split
 * list.ts out of the lobby's chunk, which would grow the site's first screen
 */
export const BOARD_TRACKS: readonly RaceTrackId[] = [
  'riverside',
  'harbour',
  'tamkang',
  'oldstreet',
  'guanyin',
  'mangrove',
  'fort',
  'danhai',
  'datun',
  'wharf',
  'lanes',
  'works',
  'zhuwei',
  'breakwater',
]

export const isBoardTrack = (value: unknown): value is RaceTrackId =>
  typeof value === 'string' && (BOARD_TRACKS as readonly string[]).includes(value)

/** Rows a board shows to everyone */
export const BOARD_TOP = 100
/** The most an uploaded replay file may be, bytes: a 15-minute run is about 60 kB deflated */
export const BOARD_MAX_UPLOAD_BYTES = 256_000
/** Uploads one address may try a minute (worker/rate-limit.ts SHARED_LIMITS.board) */
export const BOARD_UPLOADS_PER_MINUTE = 6

/** Where the API is */
export const BOARD_API = '/api/kart/board'

// ── The week's track ─────────────────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 3600 * 1000
/** Monday 5 January 2026, 00:00 in Taipei (UTC+8): the first week of the rotation */
const FIRST_MONDAY = Date.UTC(2026, 0, 4, 16)

/** The week number of `now` since the rotation began, weeks starting Monday 00:00 Taipei time */
export const boardWeek = (now: number): number => Math.floor((now - FIRST_MONDAY) / WEEK_MS)

/** The featured track of the week `now` falls in: the board tracks in turn */
export function weeklyTrack(now: number): RaceTrackId {
  const week = boardWeek(now)
  const count = BOARD_TRACKS.length
  return BOARD_TRACKS[((week % count) + count) % count]!
}

// ── What goes over the wire ──────────────────────────────────────────────────────────────────

/** One row of a board */
export interface BoardEntry {
  /** 1 for the fastest */
  readonly rank: number
  /** The row's id: its replay is at `${BOARD_API}/replay?id=<id>` (a new id for every new best) */
  readonly id: string
  readonly nick: string
  readonly kart: KartId
  readonly driver: DriverId
  /** From GO to the finish, ms */
  readonly totalMs: number
  /** The fastest lap, ms */
  readonly bestLapMs: number
  /** When it was set, ms since 1970 */
  readonly at: number
  /** Whether its replay can be downloaded */
  readonly replay: boolean
}

/** GET `${BOARD_API}?track=<id>[&nick=<name>]` */
export interface BoardResponse {
  readonly track: RaceTrackId
  readonly revision: number
  /** The top BOARD_TOP, fastest first */
  readonly entries: readonly BoardEntry[]
  /** How many nicknames are on the board */
  readonly total: number
  /** The asked nickname's row, wherever it ranks; null when it has none here */
  readonly you: BoardEntry | null
  /** This week's track (weeklyTrack by the server's clock) */
  readonly weekly: RaceTrackId
}

/** Why an upload was refused (docs/SECURITY.md §11): the Worker says which */
export type BoardRefusal =
  /** Not a track with a board, or a layout revision that is not the current one */
  | 'track'
  | 'revision'
  /** The browser drives with other physics than this deployment's (an old tab after a deploy) */
  | 'physics'
  | 'nickname'
  /** Not a replay file, or one that cannot be read (replayFile.ts) */
  | 'file'
  /** Not one kart alone on the track's own laps (a race, items, another lap count) */
  | 'shape'
  /** The samples: a gap, a kart change, not from the start, not to the finish */
  | 'samples'
  /** A sample the room's judge would refuse (race.ts judgeFrame): its reason follows */
  | 'speed'
  | 'jump'
  | 'reset'
  | 'far'
  | 'obstacle'
  | 'tick'
  | 'old'
  /** Laps that the gates did not count, or times that do not match the samples */
  | 'laps'
  | 'time'
  | 'tooBig'
  | 'rateLimited'
  /** No database here (a local build without D1) */
  | 'unavailable'

/** POST `${BOARD_API}?track=<id>&revision=<n>&nick=<name>&physics=<stamp>`, the file as the body */
export type BoardUploadResponse =
  | {
      readonly ok: true
      /** Whether it beat the nickname's row (or was its first) */
      readonly improved: boolean
      /** The nickname's rank now, and its row */
      readonly entry: BoardEntry
      readonly total: number
    }
  | { readonly ok: false; readonly error: BoardRefusal }

/** A nickname as a board keys it: width and case folded, so that Ann and ＡＮＮ are one row */
export const boardNickKey = (nick: string): string => nick.normalize('NFKC').toLowerCase()

/** `1:23.456` for a board's times, ms */
export function boardTime(ms: number): string {
  const whole = Math.max(0, Math.round(ms))
  const minutes = Math.floor(whole / 60_000)
  const seconds = Math.floor((whole % 60_000) / 1000)
  const rest = whole % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(rest).padStart(3, '0')}`
}
