// 2026-11-17 (docs/KART-FEEL.md): what the classic feel's techniques are worth. Three drivers race
// three laps on every built-in track, with the classic feel and with the arcade (old) preset.
// 2026-11-18: the drivers are people now, not the computer opponents (scripts/kart/drivers.ts: a
// novice who makes a novice's mistakes, an average driver and an expert), and what is measured is
// the boost cover, the share of the race spent in a boost, besides the times.
// scripts/kart-feel.ts prints the table (npm run kart:feel); tests/kart/feel.test.ts pins it.
import { applyKart, KART_IDS, type KartId } from '../../shared/kart/karts.ts'
import { KART_TUNING, type KartTuning } from '../../shared/kart/physics.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { DRIVERS, measure, type Driver, type Measure } from './drivers.ts'

export const FEEL_TRACKS = [
  'riverside',
  'harbour',
  'tamkang',
  'oldstreet',
  'guanyin',
  // 2026-11-18: the four technical tracks (docs/KART-FEEL.md §10.1)
  'mangrove',
  'fort',
  'danhai',
  'datun',
  // 2026-11-19: the two to learn by heart (docs/KART-FEEL.md §11)
  'wharf',
  'lanes',
  // 2026-11-20: the first with real branches (docs/KART-FEEL.md §14)
  'works',
] as const

export const FEEL_DRIVERS = DRIVERS

export type FeelResult = Measure

/** One driver, three laps (or 400 s) of a built-in track */
export function feelRace(
  trackId: string,
  driver: Driver,
  tuning: KartTuning,
  seed = 7,
): FeelResult {
  return measure(raceTrack(trackId)!, driver, tuning, seed)
}

// ── Every vehicle, the same hands (2026-11-19) ───────────────────────────────────────────────

export interface VehicleRow {
  readonly kart: KartId
  /** Seconds behind the quickest vehicle, track by track (`tracks`' order) */
  readonly behind: readonly number[]
  /** The mean of those */
  readonly mean: number
  /** Its mean race, seconds */
  readonly seconds: number
  /** Tracks on which it was the quickest, and the slowest */
  readonly wins: number
  readonly lasts: number
  /** Whether it finished every race */
  readonly finished: boolean
}

export interface VehicleTable {
  readonly tracks: readonly string[]
  readonly rows: readonly VehicleRow[]
  /** The slowest vehicle's mean over the quickest's, seconds, and as a share of a mean race */
  readonly spread: number
  readonly spreadShare: number
}

/**
 * `driver` races every vehicle on every track in `tracks`, `seeds` times each. Each vehicle drives
 * with its own numbers on the standard tuning (karts.ts's applyKart), so a bike is its narrow
 * circle and its quick tail too
 */
export function vehicleTable(
  driver: Driver,
  seeds = 1,
  tracks: readonly string[] = FEEL_TRACKS,
  karts: readonly KartId[] = KART_IDS,
): VehicleTable {
  const times = karts.map((kart) => {
    const tuning = applyKart(KART_TUNING, kart)
    let finished = true
    const perTrack = tracks.map((id) => {
      let total = 0
      for (let seed = 1; seed <= seeds; seed++) {
        const run = feelRace(id, driver, tuning, seed * 7)
        if (!run.finished) finished = false
        total += run.seconds
      }
      return total / seeds
    })
    return { kart, perTrack, finished }
  })
  const best = tracks.map((_, at) => Math.min(...times.map((one) => one.perTrack[at]!)))
  const worst = tracks.map((_, at) => Math.max(...times.map((one) => one.perTrack[at]!)))
  const rows = times.map(({ kart, perTrack, finished }) => {
    const behind = perTrack.map((time, at) => time - best[at]!)
    return {
      kart,
      behind,
      mean: behind.reduce((a, b) => a + b, 0) / behind.length,
      seconds: perTrack.reduce((a, b) => a + b, 0) / perTrack.length,
      wins: perTrack.filter((time, at) => time === best[at]).length,
      lasts: perTrack.filter((time, at) => time === worst[at]).length,
      finished,
    }
  })
  const means = rows.map((row) => row.mean)
  const spread = Math.max(...means) - Math.min(...means)
  const race = best.reduce((a, b) => a + b, 0) / best.length
  return { tracks, rows, spread, spreadShare: spread / race }
}
