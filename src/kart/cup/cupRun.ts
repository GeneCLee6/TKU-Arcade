// A Grand Prix as it goes (docs/ARCHITECTURE.md §4.24): a small state machine, pure, kept in this
// browser after every step (store.ts), so that a reload carries on where it was.
//
//   startCup ──▶ ready ──beginRace──▶ racing ──finishRace──▶ ready (next race) … ──▶ podium
//                  ▲                    │
//                  └────── resumeCup / quitRace (the race is run again from the grid)
//
// Abandoning is dropping the run (store.ts `clearCupRun`). The computer karts are drawn once, at the
// start: the same names, karts and drivers race every race of the cup. Seats: the bots from 0, the
// player last (as a race against the computer has them).
import type { KartMode, KartTeams } from '../../../shared/games/kart/types.ts'
import { MAX_LAPS } from '../../../shared/games/kart/info.ts'
import { DRIVER_IDS, KART_IDS } from '../../../shared/kart/karts.ts'
import type { RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import { BOT_NAMES, drawBots, MAX_BOTS, type BotEntry } from '../bots/roster.ts'
import { isDifficulty, type Difficulty } from '../bots/skill.ts'
import { cupOf, isCupId, type CupId } from './cups.ts'
import { cupTable, type CupLine } from './points.ts'

export interface CupSetup {
  readonly cup: CupId
  readonly bots: number
  readonly difficulty: Difficulty
  readonly mode: KartMode
  readonly laps: number
  /** 2026-11-18: every race of the cup a team race; the cup's own points stay each kart's */
  readonly teams?: KartTeams
}

export const DEFAULT_CUP_SETUP: CupSetup = {
  cup: 'ebb',
  bots: 5,
  difficulty: 'normal',
  mode: 'items',
  laps: 3,
}

export type CupPhase = 'ready' | 'racing' | 'podium'

export interface CupRun {
  readonly format: 1
  readonly setup: CupSetup
  readonly seed: number
  readonly entries: readonly BotEntry[]
  /** Each race run so far: every seat's rank (1 is first), by seat */
  readonly results: readonly (readonly number[])[]
  readonly phase: CupPhase
  /** Left for /kart's menu: a reload then stays on the menu, whose Grand Prix panel continues it */
  readonly away: boolean
}

export const playerSeat = (run: CupRun): number => run.entries.length
export const seatCount = (run: CupRun): number => run.entries.length + 1

/** The race to run next (or being run), null once the cup is over */
export function currentTrack(run: CupRun): RaceTrackId | null {
  if (run.phase === 'podium') return null
  return cupOf(run.setup.cup).tracks[run.results.length] ?? null
}

/** The number of races in the cup */
export const raceCount = (run: CupRun): number => cupOf(run.setup.cup).tracks.length

/** A race's own seed: the room's dice and the bots' habits differ from race to race */
export const raceSeed = (run: CupRun): number =>
  (run.seed + Math.imul(run.results.length + 1, 0x9e3779b1)) >>> 1

export function startCup(setup: CupSetup, seed: number): CupRun {
  return {
    format: 1,
    setup,
    seed: seed >>> 0,
    entries: drawBots(setup.bots, seed),
    results: [],
    phase: 'ready',
    away: false,
  }
}

export function beginRace(run: CupRun): CupRun {
  return run.phase === 'ready' ? { ...run, phase: 'racing', away: false } : run
}

/** A race left before its end: it is run again from the grid */
export const quitRace = (run: CupRun): CupRun =>
  run.phase === 'racing' ? { ...run, phase: 'ready' } : run

/** Opened again (a reload): a race cut short is run again; the menu is left */
export const resumeCup = (run: CupRun): CupRun => ({ ...quitRace(run), away: false })

/** Back to /kart's menu, the cup kept */
export const leaveCup = (run: CupRun): CupRun => ({ ...quitRace(run), away: true })

/**
 * The race's ranks (every seat's, by seat) go into the cup: the next race is ready, or after the last
 * the podium. Anything but a race being run is left as it was
 */
export function finishRace(run: CupRun, ranks: readonly number[]): CupRun {
  if (run.phase !== 'racing') return run
  const seats = seatCount(run)
  const clean = Array.from({ length: seats }, (_, seat) => {
    const rank = ranks[seat]
    return Number.isInteger(rank) && rank! >= 1 && rank! <= seats ? rank! : seats
  })
  const results = [...run.results, clean]
  return {
    ...run,
    results,
    phase: results.length >= raceCount(run) ? 'podium' : 'ready',
  }
}

export const standingsOf = (run: CupRun): CupLine[] => cupTable(run.results, seatCount(run))

/** How the player did: place in the cup's table and points */
export interface CupOutcome {
  readonly place: number
  readonly points: number
}

export function outcomeOf(run: CupRun): CupOutcome {
  const table = standingsOf(run)
  const index = table.findIndex((line) => line.seat === playerSeat(run))
  return { place: index + 1, points: table[index]?.points ?? 0 }
}

/** Better: a higher place, or the same place with more points */
export const betterOutcome = (a: CupOutcome, b: CupOutcome | null): boolean =>
  b === null || a.place < b.place || (a.place === b.place && a.points > b.points)

// ── From storage, which anyone can edit ─────────────────────────────────────────────────────────

const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max

export function parseCupSetup(value: unknown): CupSetup | null {
  if (typeof value !== 'object' || value === null) return null
  const given = value as Record<string, unknown>
  if (!isCupId(given.cup) || !isDifficulty(given.difficulty)) return null
  if (given.mode !== 'items' && given.mode !== 'race') return null
  if (!isInt(given.bots, 1, MAX_BOTS) || !isInt(given.laps, 1, MAX_LAPS)) return null
  return {
    cup: given.cup,
    bots: given.bots,
    difficulty: given.difficulty,
    mode: given.mode,
    laps: given.laps,
    ...(given.teams === 'teams' ? { teams: 'teams' as const } : {}),
  }
}

function parseEntry(value: unknown): BotEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const { name, kart, driver } = value as Record<string, unknown>
  const okName = BOT_NAMES.find((one) => one === name)
  const okKart = KART_IDS.find((one) => one === kart)
  const okDriver = DRIVER_IDS.find((one) => one === driver)
  return okName && okKart && okDriver ? { name: okName, kart: okKart, driver: okDriver } : null
}

/** A run from storage, or null when it is not one (a hand edit, an old format) */
export function parseCupRun(value: unknown): CupRun | null {
  if (typeof value !== 'object' || value === null) return null
  const given = value as Record<string, unknown>
  if (given.format !== 1 || !isInt(given.seed, 0, 2 ** 32 - 1)) return null
  const setup = parseCupSetup(given.setup)
  if (!setup || !Array.isArray(given.entries) || given.entries.length !== setup.bots) return null
  const entries = given.entries.map(parseEntry)
  if (entries.some((entry) => entry === null)) return null
  if (new Set(entries.map((entry) => entry!.name)).size !== entries.length) return null
  const seats = entries.length + 1
  const races = cupOf(setup.cup).tracks.length
  if (!Array.isArray(given.results) || given.results.length > races) return null
  const results = given.results as unknown[]
  if (
    !results.every(
      (ranks) =>
        Array.isArray(ranks) &&
        ranks.length === seats &&
        ranks.every((rank) => isInt(rank, 1, seats)),
    )
  )
    return null
  const phase = given.phase
  if (phase !== 'ready' && phase !== 'racing' && phase !== 'podium') return null
  // The phase must agree with the races run
  if ((phase === 'podium') !== (results.length === races)) return null
  return {
    format: 1,
    setup,
    seed: given.seed,
    entries: entries as BotEntry[],
    results: results as number[][],
    phase,
    away: given.away === true,
  }
}
