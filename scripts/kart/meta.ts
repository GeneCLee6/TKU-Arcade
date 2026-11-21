// 2026-11-21 (owner: "which kart is quickest on which track? ... uphill and downhill, tracks with
// many sharp corners want handling and acceleration, others want top speed"; docs/KART-META.md):
// what makes a track, and which vehicles are quickest on it. A track's traits come from its road
// (the bends from shape.ts's curvature, the climbs from its heights); the quickest vehicles from
// races driven with the same hands in every vehicle (feel.ts). `npm run kart:meta` prints both and
// the table docs/KART-META.md holds; shared/kart/meta.ts keeps each track's top three for the garage.
// The ranking and the fairness rule are pure numbers, tested in tests/kart/meta.test.ts.
import { applyKart, type KartId } from '../../shared/kart/karts.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import type { Track } from '../../shared/kart/track.ts'
import { feelRace, type FeelResult } from './feel.ts'
import type { Driver } from './drivers.ts'
import { curvatures, roadShape } from './shape.ts'

/** A bend tighter than this, metres, is a sharp corner (a drift, or a lift, at racing speed) */
export const SHARP_RADIUS = 45
/** A slope steeper than this grade counts as a climb or a descent */
export const SLOPE_GRADE = 0.02

export interface TrackTraits {
  readonly length: number
  /** Sharp corners in a lap, and per kilometre */
  readonly sharp: number
  readonly sharpPerKm: number
  /** The share of a lap that drives as a straight, and the longest straight, metres */
  readonly straightShare: number
  readonly longestStraight: number
  /** Metres climbed in a lap (a loop comes down as far as it goes up) */
  readonly climb: number
  /** The share of a lap spent climbing, and descending */
  readonly upShare: number
  readonly downShare: number
  /** The mean grade of the climbs and of the descents (both positive) */
  readonly upGrade: number
  readonly downGrade: number
}

/** A track's traits, from its main road (a branch is left out: it is a choice) */
export function trackTraits(track: Pick<Track, 'road'>): TrackTraits {
  const { road } = track
  const shape = roadShape(road)
  const { curve, step } = curvatures(road)
  const n = road.length
  const tight = curve.map((k) => Math.abs(k) > 1 / SHARP_RADIUS)
  // Runs of tight road: each run is one corner
  let sharp = 0
  for (let index = 0; index < n; index++) {
    if (tight[index] && !tight[(index - 1 + n) % n]) sharp++
  }
  if (sharp === 0 && tight.every(Boolean)) sharp = 1
  let climb = 0
  let up = 0
  let down = 0
  let upRise = 0
  let downDrop = 0
  for (let index = 0; index < n; index++) {
    const a = road[index]!
    const b = road[(index + 1) % n]!
    const rise = (b.y ?? 0) - (a.y ?? 0)
    const run = step[index]!
    if (rise > 0) climb += rise
    if (run <= 0) continue
    const grade = rise / run
    if (grade > SLOPE_GRADE) {
      up += run
      upRise += rise
    } else if (grade < -SLOPE_GRADE) {
      down += run
      downDrop -= rise
    }
  }
  return {
    length: shape.length,
    sharp,
    sharpPerKm: (sharp / shape.length) * 1000,
    straightShare: shape.straightShare,
    longestStraight: shape.longestStraight,
    climb,
    upShare: up / shape.length,
    downShare: down / shape.length,
    upGrade: up > 0 ? upRise / up : 0,
    downGrade: down > 0 ? downDrop / down : 0,
  }
}

/** Race times, seconds: track by track, vehicle by vehicle */
export type Matrix = Readonly<Record<string, Readonly<Partial<Record<KartId, number>>>>>

/** A race that never finished counts as this long */
export const UNFINISHED_SECONDS = 400

/** The middle value (the mean of the middle two of an even count) */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2
}

/**
 * One driver, every vehicle in `karts` on every track in `tracks`: the median of `seeds` races.
 * The median, not the mean: one race in ten goes wrong (a wall, a reset) whatever the vehicle, and
 * a mean would hand the track to whichever vehicle was spared that race
 */
export function raceMatrix(
  driver: Driver,
  tracks: readonly string[],
  karts: readonly KartId[],
  seeds = 3,
  race: (track: string, kart: KartId, seed: number) => Pick<FeelResult, 'finished' | 'seconds'> = (
    track,
    kart,
    seed,
  ) => feelRace(track, driver, applyKart(KART_TUNING, kart), seed),
): Matrix {
  const matrix: Record<string, Partial<Record<KartId, number>>> = {}
  for (const track of tracks) {
    const row: Partial<Record<KartId, number>> = {}
    for (const kart of karts) {
      const times: number[] = []
      for (let seed = 1; seed <= seeds; seed++) {
        const run = race(track, kart, seed * 7)
        times.push(run.finished ? run.seconds : UNFINISHED_SECONDS)
      }
      row[kart] = median(times)
    }
    matrix[track] = row
  }
  return matrix
}

/** A track's vehicles, quickest first, with their time (a tie goes by name, so it is stable) */
export function ranking(row: Matrix[string]): { kart: KartId; seconds: number }[] {
  return (Object.entries(row) as [KartId, number][])
    .map(([kart, seconds]) => ({ kart, seconds }))
    .sort((a, b) => a.seconds - b.seconds || a.kart.localeCompare(b.kart))
}

/** Each track's quickest `count` */
export function podiums(matrix: Matrix, count = 3): Record<string, KartId[]> {
  const result: Record<string, KartId[]> = {}
  for (const [track, row] of Object.entries(matrix)) {
    result[track] = ranking(row)
      .slice(0, count)
      .map((one) => one.kart)
  }
  return result
}

/** The same matrix without some vehicles */
export function without(matrix: Matrix, karts: readonly KartId[]): Matrix {
  return Object.fromEntries(
    Object.entries(matrix).map(([track, row]) => [
      track,
      Object.fromEntries(Object.entries(row).filter(([kart]) => !karts.includes(kart as KartId))),
    ]),
  )
}

/** How many tracks each vehicle is the quickest on */
export function winCounts(matrix: Matrix): Partial<Record<KartId, number>> {
  const wins: Partial<Record<KartId, number>> = {}
  for (const row of Object.values(matrix)) {
    const first = ranking(row)[0]
    if (first) wins[first.kart] = (wins[first.kart] ?? 0) + 1
  }
  return wins
}

/**
 * The fairness rule: apart from the flagships, no vehicle is the quickest on every track, nor on
 * more than half of them. Whatever breaks it, by name (empty when fair)
 */
export function fairness(matrix: Matrix, flagships: readonly KartId[]): string[] {
  const problems: string[] = []
  const tracks = Object.keys(matrix).length
  const wins = winCounts(without(matrix, flagships))
  for (const [kart, count] of Object.entries(wins)) {
    if (tracks > 1 && count === tracks) problems.push(`${kart} is the quickest on every track`)
    else if (tracks > 2 && count > tracks / 2) {
      problems.push(`${kart} is the quickest on ${count} of ${tracks} tracks`)
    }
  }
  return problems
}

/**
 * A flagship against the best of the rest, track by track: the share of time it saves (+ quicker,
 * − slower), on how many tracks it is the quickest, and the mean share
 */
export function flagshipLead(
  matrix: Matrix,
  flagship: KartId,
): { wins: number; tracks: number; margin: number; margins: Record<string, number> } {
  let wins = 0
  let total = 0
  const margins: Record<string, number> = {}
  for (const [track, row] of Object.entries(matrix)) {
    const own = row[flagship]
    const rest = ranking(row).find((one) => one.kart !== flagship)
    if (own === undefined || !rest) continue
    const margin = (rest.seconds - own) / rest.seconds
    margins[track] = margin
    total += margin
    if (margin > 0) wins++
  }
  const tracks = Object.keys(margins).length
  return { wins, tracks, margin: tracks > 0 ? total / tracks : 0, margins }
}
