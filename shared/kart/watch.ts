// e9-t10: watching a race, live or replayed (docs/KART-NETCODE.md §11). Which kart the camera
// follows, the places as a watcher sees them, and what a key or a gamepad button asks for. Pure, so
// that it is tested in Node; src/kart/watch/ draws it.
import { raceProgress } from './race.ts'
import type { Track } from './track.ts'

/** Where a kart is along the race, as the latest frame (or replay sample) has it */
export interface WatchedSpot {
  readonly crossings: number
  readonly nextGate: number
  readonly x: number
  readonly z: number
}

export interface WatchedRacer {
  readonly seat: number
  /** Its finish time in ms, if it has finished (by the moment being watched) */
  readonly finishMs: number | null
  readonly out: boolean
}

/**
 * Seats in race order: finished first by time, then those racing by how far round they are, then
 * those out. A kart with no frame yet counts as on the grid
 */
export function watchOrder(
  track: Pick<Track, 'gates'>,
  racers: readonly WatchedRacer[],
  spotOf: (seat: number) => WatchedSpot | null,
): number[] {
  const count = track.gates.length
  const progress = (seat: number): number => {
    const spot = spotOf(seat)
    if (!spot || spot.nextGate >= count) return 0
    return raceProgress(track, spot.crossings, spot.nextGate, spot.x, spot.z)
  }
  const finished = racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
  const racing = racers
    .filter((racer) => racer.finishMs === null && !racer.out)
    .map((racer) => ({ seat: racer.seat, at: progress(racer.seat) }))
    .sort((a, b) => b.at - a.at || a.seat - b.seat)
    .map(({ seat }) => seat)
  const out = racers.filter((racer) => racer.finishMs === null && racer.out)
  return [...finished.map((racer) => racer.seat), ...racing, ...out.map((racer) => racer.seat)]
}

/** The seat after (`step` 1) or before (-1) `current` in `seats`, round the end; the first if none */
export function cycleSeat(
  seats: readonly number[],
  current: number | null,
  step: 1 | -1,
): number | null {
  if (seats.length === 0) return null
  const index = current === null ? -1 : seats.indexOf(current)
  if (index < 0) return seats[0]!
  return seats[(index + step + seats.length) % seats.length]!
}

/** What a watcher can ask for */
export type WatchCommand =
  'next' | 'previous' | 'view' | 'pause' | 'back' | 'forward' | 'slower' | 'faster'

const KEYS: Readonly<Record<string, WatchCommand>> = {
  ArrowRight: 'next',
  KeyD: 'next',
  KeyE: 'next',
  ArrowLeft: 'previous',
  KeyA: 'previous',
  KeyQ: 'previous',
  KeyV: 'view',
  KeyC: 'view',
  Space: 'pause',
  KeyK: 'pause',
  KeyJ: 'back',
  KeyL: 'forward',
  Minus: 'slower',
  Comma: 'slower',
  Equal: 'faster',
  Period: 'faster',
}

/** The command for a key (a KeyboardEvent's `code`), if any */
export const keyCommand = (code: string): WatchCommand | null => KEYS[code] ?? null

/**
 * The standard gamepad's buttons (W3C "standard" mapping): bumpers and the d-pad's sides change kart,
 * Y the view, A play and pause, the triggers seek, the d-pad's up and down the speed
 */
const PAD: readonly (readonly [number, WatchCommand])[] = [
  [5, 'next'],
  [15, 'next'],
  [4, 'previous'],
  [14, 'previous'],
  [3, 'view'],
  [0, 'pause'],
  [6, 'back'],
  [7, 'forward'],
  [12, 'faster'],
  [13, 'slower'],
]

/** The commands of the buttons pressed since the last reading (held ones count once) */
export function padCommands(before: readonly boolean[], now: readonly boolean[]): WatchCommand[] {
  return PAD.filter(([button]) => now[button] === true && before[button] !== true).map(
    ([, command]) => command,
  )
}

/** How far a back or forward jumps in a replay, seconds */
export const SEEK_SECONDS = 5
