// 2026-11-22 (owner: "at the end, an animated podium for the top three"; docs/ARCHITECTURE.md §4.72):
// what the podium after a race shows and when, without three.js so that it is tested in Node. The
// stage (podiumStage.ts) draws it, PodiumCeremony.tsx puts the names over it.
//
// The show lasts CEREMONY_MS (anyone may skip it): the stage dark, then the lights come up on third,
// second and first in turn as each driver's plate slams in, confetti with the winner, the camera
// gliding in from wide and swaying slowly while they wave, cheer and lift the trophy.
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import type { DriverGesture } from '../driverGestures.ts'

/** The whole show, ms; the results follow */
export const CEREMONY_MS = 7_000
/** A skip is taken only after this long, so that the key that ended the race does not skip it */
export const SKIP_AFTER_MS = 600
/** When each place is revealed, seconds into the show: third, then second, then the winner */
export const REVEAL_AT: Record<1 | 2 | 3, number> = { 1: 2.1, 2: 1.3, 3: 0.6 }
/** Each step's height, metres, and where it stands across the stage */
export const STEP_HEIGHT: Record<1 | 2 | 3, number> = { 1: 1.1, 2: 0.75, 3: 0.5 }
export const STEP_X: Record<1 | 2 | 3, number> = { 1: 0, 2: -2.9, 3: 2.9 }
/** What each place does up there */
export const PODIUM_GESTURE: Record<1 | 2 | 3, DriverGesture> = { 1: 'trophy', 2: 'cheer', 3: 'wave' }

export type PodiumPlace = 1 | 2 | 3

export interface PodiumEntry {
  readonly seat: number
  readonly place: PodiumPlace
  readonly name: string
  readonly kart: KartId
  readonly driver: DriverId
  /** Under the name: the race time, or a Grand Prix's points */
  readonly line: string
  readonly you: boolean
}

/** A line of the race's (or the cup's) standings, as much of it as the podium needs */
export interface PodiumLine {
  readonly seat: number
  readonly rank: number
  /** Did not finish: never on the podium */
  readonly out?: boolean
}

/**
 * The podium's places from the standings: the first three who finished, by rank, at most one on each
 * step (a tie for a place puts the next on the next step down)
 */
export function podiumSeats(lines: readonly PodiumLine[]): { seat: number; place: PodiumPlace }[] {
  return [...lines]
    .filter((line) => !line.out)
    .sort((a, b) => a.rank - b.rank || a.seat - b.seat)
    .slice(0, 3)
    .map((line, index) => ({ seat: line.seat, place: (index + 1) as PodiumPlace }))
}

/** Whether the place's plate and lights are up `seconds` into the show */
export const revealed = (place: PodiumPlace, seconds: number, reducedMotion = false): boolean =>
  reducedMotion || seconds >= REVEAL_AT[place]

export interface PodiumCamera {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number }
  readonly target: { readonly x: number; readonly y: number; readonly z: number }
}

/** The glide in from wide takes this long, seconds */
export const GLIDE_SECONDS = 2.6

const smooth = (share: number) => {
  const s = Math.max(0, Math.min(1, share))
  return s * s * (3 - 2 * s)
}

/**
 * The camera `seconds` into the show: from wide and low in front of the stage in to the middle,
 * then swaying slowly from side to side. Still (the end of the glide) with less motion asked for
 */
export function podiumCamera(seconds: number, reducedMotion = false): PodiumCamera {
  const glide = reducedMotion ? 1 : smooth(seconds / GLIDE_SECONDS)
  const sway = reducedMotion ? 0 : Math.sin(Math.max(0, seconds - GLIDE_SECONDS) * 0.45) * 1.4
  return {
    eye: { x: sway, y: 1.6 + 1.1 * glide, z: 14 - 5.2 * glide },
    target: { x: 0, y: 1.5 - 0.2 * glide, z: 0 },
  }
}
