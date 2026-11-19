// 2026-11-17 (docs/KART-FEEL.md): what the classic feel's techniques are worth. Three drivers race
// three laps on every built-in track, with the classic feel and with the arcade (old) preset.
// 2026-11-18: the drivers are people now, not the computer opponents (scripts/kart/drivers.ts: a
// novice who makes a novice's mistakes, an average driver and an expert), and what is measured is
// the boost cover, the share of the race spent in a boost, besides the times.
// scripts/kart-feel.ts prints the table (npm run kart:feel); tests/kart/feel.test.ts pins it.
import type { KartTuning } from '../../shared/kart/physics.ts'
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
