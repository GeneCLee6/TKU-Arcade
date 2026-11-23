// 2026-11-23 (docs/ARCHITECTURE.md §4.97): the room's social side, shared by the Worker and the browser.
//
// Quick emotes and phrases ride on the reactions of e7-t11 (`react` / `reaction`): a reaction is a
// number, never text, and the browser draws it. 0 to EMOTE_COUNT-1 are emotes (the first six are
// e7-t11's), EMOTE_COUNT and up are canned phrases, in both languages from the browser's own strings.
// The room passes on only a number in that range, and at most REACTION_RATE of them per member.
//
// A player card (`profile_summary`) is a few numbers each person's browser works out from its own
// achievements (src/achievements/), never the save itself: what `parseProfileSummary` accepts and
// nothing else, under PROFILE_MAX_CHARS. The room keeps it on the member (RoomMember.profile) and
// drops it with null, when the person hides their card.

/** Emotes: e7-t11's six, then six more (2026-11-23) */
export const EMOTE_COUNT = 12
/** Canned phrases, after the emotes */
export const PHRASE_COUNT = 8
/** Every reaction: the emotes, then the phrases */
export const SOCIAL_REACTION_COUNT = EMOTE_COUNT + PHRASE_COUNT

/** A phrase, not an emote */
export const isPhrase = (reaction: number): boolean => reaction >= EMOTE_COUNT

/**
 * Besides REACTION_MIN_MS between two, each member may send at most `count` reactions in any
 * `windowMs` (the chat's own is 10 in 10 s, shared/chat.ts): more are dropped quietly
 */
export const REACTION_RATE = { count: 6, windowMs: 10_000 } as const

/** A member's card is taken at most this often; a faster one is ignored */
export const PROFILE_MIN_MS = 2_000

/** A card as JSON, at most this long */
export const PROFILE_MAX_CHARS = 400

/** An achievement, a vehicle, a driver or a track: an id, never words */
const PROFILE_ID = /^[a-z][a-z0-9-]{0,47}$/

/** The most achievements a card may claim (there are about a hundred) */
export const MAX_ACHIEVEMENTS = 999
/** The most games or wins a card may claim */
export const MAX_COUNT = 1_000_000
/** A best lap between these, ms */
export const MIN_LAP_MS = 3_000
export const MAX_LAP_MS = 3_600_000

/** What someone shows the room of their own profile; every field is optional but the counts */
export type ProfileSummary = {
  /** The achievement they show as their title (its rule id); absent: none */
  title?: string
  /** Achievements unlocked, of `total` */
  unlocked: number
  total: number
  /** Games finished, board and kart */
  games: number
  /** Board games won (outright or together) */
  boardWins: number
  /** Kart races won */
  kartWins: number
  /** The vehicle they drove most */
  kart?: string
  /** The driver they race as */
  driver?: string
  /** Their best lap on any track */
  lap?: { track: string; ms: number }
}

const isCount = (value: unknown, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max

/** An id a card may carry (an achievement, a vehicle, a driver, a track) */
export const isProfileId = (value: unknown): value is string =>
  typeof value === 'string' && PROFILE_ID.test(value)

const isId = isProfileId

const SUMMARY_KEYS: ReadonlySet<string> = new Set([
  'title',
  'unlocked',
  'total',
  'games',
  'boardWins',
  'kartWins',
  'kart',
  'driver',
  'lap',
])

/**
 * A card as the room takes it, a fresh object with exactly the fields above; null for anything
 * else: an unknown field, a wrong type, a number out of range, an id that is not one, too long
 */
export function parseProfileSummary(value: unknown): ProfileSummary | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (Object.keys(raw).some((key) => !SUMMARY_KEYS.has(key))) return null
  const { title, unlocked, total, games, boardWins, kartWins, kart, driver, lap } = raw
  if (!isCount(total, MAX_ACHIEVEMENTS) || total === 0) return null
  if (!isCount(unlocked, total)) return null
  if (!isCount(games, MAX_COUNT) || !isCount(boardWins, MAX_COUNT) || !isCount(kartWins, MAX_COUNT)) {
    return null
  }
  if (title !== undefined && !isId(title)) return null
  if (kart !== undefined && !isId(kart)) return null
  if (driver !== undefined && !isId(driver)) return null
  let bestLap: ProfileSummary['lap']
  if (lap !== undefined) {
    if (typeof lap !== 'object' || lap === null || Array.isArray(lap)) return null
    const { track, ms, ...rest } = lap as Record<string, unknown>
    if (Object.keys(rest).length > 0 || !isId(track)) return null
    if (!Number.isSafeInteger(ms) || (ms as number) < MIN_LAP_MS || (ms as number) > MAX_LAP_MS) return null
    bestLap = { track, ms: ms as number }
  }
  const summary: ProfileSummary = {
    ...(title !== undefined ? { title } : {}),
    unlocked,
    total,
    games,
    boardWins,
    kartWins,
    ...(kart !== undefined ? { kart } : {}),
    ...(driver !== undefined ? { driver } : {}),
    ...(bestLap ? { lap: bestLap } : {}),
  }
  return JSON.stringify(summary).length <= PROFILE_MAX_CHARS ? summary : null
}
