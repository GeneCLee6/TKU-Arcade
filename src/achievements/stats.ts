// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.81): what the achievements count, and how each event
// changes it. Pure: the engine loads, applies, evaluates and saves; the tests pass made-up events.
//
// Two shapes only, so that a rule (rules.ts) can name any of it and an account (F1) can merge two
// browsers' copies key by key (`mergeStats`):
//   n: counters. Most only go up (a sum, or the most of something); `board.streak` alone also falls
//   t: tallies, a count per id (karts driven, games won...). `kart.bestLap` keeps ms, the lowest
import { RACE_TRACK_IDS } from './kartLists.ts'
import type { AchievementEvent, BoardResultEvent, KartProgressEvent, KartRaceEvent, KartRunEvent } from './events.ts'

export interface Stats {
  readonly n: Readonly<Record<string, number>>
  readonly t: Readonly<Record<string, Readonly<Record<string, number>>>>
}

export const EMPTY_STATS: Stats = { n: {}, t: {} }

/** Counters that are the most of something, not a sum: merged by taking the higher */
export const MAX_COUNTERS: ReadonlySet<string> = new Set([
  'kart.maxCombo',
  'kart.maxCover',
  'kart.gold',
  'kart.platinum',
  'board.maxStreak',
])

/** The one counter that can fall (a loss ends a streak): a merge keeps the higher, as for a most */
export const STREAK = 'board.streak'

/** Tallies that keep the lowest (a best lap), not a count */
export const MIN_TALLIES: ReadonlySet<string> = new Set(['kart.bestLap'])

/** Board games where everyone shares the outcome, and how each says the table won */
const COOP_WON: Readonly<Record<string, RegExp>> = {
  lantern: /\.result\.won$/,
  'silent-table': /\.result\.won$/,
  kite: /\.result\.perfect$/,
  'word-bridge': /\.result\.duo\.won$/,
  'clue-clash': /\.result\.(great|perfect)$/,
}

const RACE_TRACKS: ReadonlySet<string> = new Set(RACE_TRACK_IDS)
/** A level of the computer, from easy up: `normal` and above beat a real opponent */
export const LEVELS = ['easy', 'normal', 'hard', 'expert'] as const

const levelRank = (level: string | null): number =>
  level === null ? -1 : Math.max(0, LEVELS.indexOf(level as (typeof LEVELS)[number]))

/** The harder of two computer levels (an unknown one counts as easy) */
export const harderLevel = (a: string | null, b: string | null): string | null =>
  levelRank(b) > levelRank(a) ? b : a

class Draft {
  readonly n: Record<string, number>
  readonly t: Record<string, Record<string, number>>
  constructor(stats: Stats) {
    this.n = { ...stats.n }
    this.t = Object.fromEntries(Object.entries(stats.t).map(([key, tally]) => [key, { ...tally }]))
  }
  add(key: string, by = 1): void {
    if (by !== 0) this.n[key] = (this.n[key] ?? 0) + by
  }
  most(key: string, value: number): void {
    if (value > (this.n[key] ?? 0)) this.n[key] = value
  }
  set(key: string, value: number): void {
    this.n[key] = value
  }
  tally(key: string, id: string, by = 1): void {
    const tally = (this.t[key] ??= {})
    tally[id] = (tally[id] ?? 0) + by
  }
  /** At least once: a tally from a store that does not say how often */
  touch(key: string, id: string): void {
    const tally = (this.t[key] ??= {})
    if (!tally[id]) tally[id] = 1
  }
  lowest(key: string, id: string, value: number): void {
    const tally = (this.t[key] ??= {})
    if (tally[id] === undefined || value < tally[id]) tally[id] = value
  }
  done(): Stats {
    return { n: this.n, t: this.t }
  }
}

/** A game finished: counts towards the platform's totals, at any hour */
function finished(draft: Draft, humans: number, at: Date): void {
  draft.add('platform.games')
  if (humans > 1) draft.add('platform.friendGames')
  if (at.getHours() < 5) draft.add('platform.midnight')
}

function applyRun(draft: Draft, event: KartRunEvent, at: Date): void {
  draft.add('kart.finishes')
  finished(draft, 1, at)
  if (event.perfectStart) draft.add('kart.perfectStarts')
  draft.most('kart.maxCombo', event.maxCombo)
  draft.most('kart.maxCover', Math.floor(event.cover * 100 + 1e-9))
  draft.add('kart.boostMs', Math.round(event.boostMs))
  draft.add('kart.driftJumps', event.driftJumps)
  draft.add('kart.platforms', event.platforms)
  draft.add('kart.gaps', event.gaps)
  draft.add('kart.forks', event.forks)
  draft.add('kart.highTides', event.highTides)
  draft.tally('kart.karts', event.kart)
  // The race tracks only: a challenge's or the school's short tracks and a custom one are not a map
  if (RACE_TRACKS.has(event.track)) {
    draft.tally('kart.tracks', event.track)
    if (event.bestLapMs !== null) draft.lowest('kart.bestLap', event.track, event.bestLapMs)
  }
}

function applyRace(draft: Draft, event: KartRaceEvent, at: Date): void {
  // A room's race is not a run of this browser's only when it was not finished: then it still counts
  // as a game played (a run counted the finished ones already)
  if (event.place === null) finished(draft, event.humans, at)
  else if (event.humans > 1) draft.add('platform.friendGames')
  draft.add('kart.races')
  const won = event.place === 1 && event.racers > 1
  if (won) {
    draft.add('kart.wins')
    if (event.level === 'expert') draft.add('kart.expertWins')
  }
  if (event.team === 'won') draft.add('kart.teamWins')
}

function applyBoard(draft: Draft, event: BoardResultEvent, at: Date): void {
  finished(draft, event.humans, at)
  draft.add('board.games')
  draft.tally('board.played', event.game)
  if (event.outcome === 'won') {
    draft.add('board.wins')
    draft.tally('board.won', event.game)
    draft.add(STREAK)
    draft.most('board.maxStreak', draft.n[STREAK] ?? 0)
    if (levelRank(event.level) >= 1) draft.add('board.botWins')
  } else if (event.outcome === 'lost') {
    draft.set(STREAK, 0)
  }
  if (event.outcome === 'coopWon') {
    draft.tally('board.coopWon', event.game)
    if (event.game === 'silent-table' && (event.levels ?? 0) >= 5) draft.add('board.silentFive')
  }
  if (event.game === 'kite' && event.score !== undefined && event.most !== undefined && event.most > 0) {
    if (event.score / event.most >= 0.7 - 1e-9) draft.add('board.kiteHigh')
    if (event.score >= event.most) draft.add('board.kitePerfect')
  }
}

function applyProgress(draft: Draft, event: KartProgressEvent): void {
  draft.most('kart.gold', event.gold)
  draft.most('kart.platinum', event.platinum)
  for (const lesson of event.school) draft.touch('kart.school3', lesson)
  for (const chapter of event.chapters) draft.touch('kart.chapters', chapter)
  for (const cup of event.cups) draft.touch('kart.cupsWon', cup)
  for (const kart of event.karts) draft.touch('kart.karts', kart)
  for (const track of event.tracks) if (RACE_TRACKS.has(track)) draft.touch('kart.tracks', track)
  // A kept best run is a finished race, from before achievements were counted
  if (event.tracks.length > 0) draft.most('kart.finishes', 1)
}

/** The stats after one event. `at`: when it happened, local time (the midnight one) */
export function applyEvent(stats: Stats, event: AchievementEvent, at: Date): Stats {
  const draft = new Draft(stats)
  switch (event.type) {
    case 'kart.run':
      applyRun(draft, event, at)
      break
    case 'kart.race':
      applyRace(draft, event, at)
      break
    case 'board.result':
      applyBoard(draft, event, at)
      break
    case 'kart.progress':
      applyProgress(draft, event)
      break
    case 'kart.leaderboard':
      draft.add('kart.leaderboard')
      draft.tally('kart.boards', event.track)
      break
    case 'platform.app':
      draft.add('platform.app')
      break
    default:
      // kart.sync and room.result become one of the above in the engine
      return stats
  }
  return draft.done()
}

/** How a board game's result reads for one seat (room.ts passes the room's) */
export function boardOutcome(
  game: string,
  standings: readonly { seat: number; rank: number }[],
  seat: number,
  summaryKey: string,
): BoardResultEvent['outcome'] {
  const mine = standings.find((one) => one.seat === seat)
  if (!mine) return 'lost'
  const shared = standings.every((one) => one.rank === mine.rank)
  if (shared) {
    const won = COOP_WON[game]
    if (won) return won.test(summaryKey) ? 'coopWon' : 'coopLost'
    return 'shared'
  }
  return mine.rank === 1 ? 'won' : 'lost'
}

/**
 * Two copies of the stats as one: every counter and tally at its higher (a best lap at its lower).
 * For an account (F1) to take in a browser's copy, and a browser in another's: nothing is counted
 * twice, at the cost of counting the two copies' sums as the larger of them
 */
export function mergeStats(a: Stats, b: Stats): Stats {
  const n: Record<string, number> = { ...a.n }
  for (const [key, value] of Object.entries(b.n)) n[key] = Math.max(n[key] ?? 0, value)
  const t: Record<string, Record<string, number>> = {}
  for (const key of new Set([...Object.keys(a.t), ...Object.keys(b.t)])) {
    const low = MIN_TALLIES.has(key)
    const merged: Record<string, number> = { ...a.t[key] }
    for (const [id, value] of Object.entries(b.t[key] ?? {})) {
      const had = merged[id]
      merged[id] = had === undefined ? value : low ? Math.min(had, value) : Math.max(had, value)
    }
    t[key] = merged
  }
  return { n, t }
}

const KEY = /^[a-z][a-zA-Z0-9.-]{0,63}$/
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Stats from anything stored: whatever is not a counter or a tally of counts is left out */
export function parseStats(value: unknown): Stats {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_STATS
  const { n: counters, t: tallies } = value as { n?: unknown; t?: unknown }
  const n: Record<string, number> = {}
  if (typeof counters === 'object' && counters !== null && !Array.isArray(counters)) {
    for (const [key, count] of Object.entries(counters)) if (KEY.test(key) && isCount(count)) n[key] = count
  }
  const t: Record<string, Record<string, number>> = {}
  if (typeof tallies === 'object' && tallies !== null && !Array.isArray(tallies)) {
    for (const [key, tally] of Object.entries(tallies)) {
      if (!KEY.test(key) || typeof tally !== 'object' || tally === null || Array.isArray(tally)) continue
      const kept: Record<string, number> = {}
      for (const [id, count] of Object.entries(tally)) {
        if (id.length > 0 && id.length <= 64 && isCount(count)) kept[id] = count
      }
      t[key] = kept
    }
  }
  return { n, t }
}
