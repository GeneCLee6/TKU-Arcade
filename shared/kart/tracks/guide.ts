// 2026-11-19 (owner: "it is too easy to become an expert ... the classic racers have plenty of
// lines that go against instinct: drift before the ramp, know the map by heart or it is hard,
// shortcuts only the skilled get through"; docs/KART-FEEL.md §11, docs/ARCHITECTURE.md §4.38). A
// track of that kind has more than one way round: the road anyone can follow, and the lines of
// those who know it (through a slot in a wall, over a fence from a ramp taken in a drift). The
// road model stays what it was: one centre line with a width, kerbs on both sides, walls on the
// road. A shortcut is a lane inside a wide stretch of road, set apart by walls, and a guide says
// where each line runs, as metres right of the middle at every road point:
//
// - `safe`: the line that goes round every wall, with `safeRoom` either side of it to wander in.
//   The computer karts and every driver that does not know the track keep to it.
// - `tech`: the line through the shortcuts, with `techRoom`; and `cues`, what it asks of the hands
//   at a place (a drift begun before a ramp and carried through the air).
//
// This file has the guide's type and what a track's author builds one with (and the walls: a
// fence along road points, an island between two lanes). Pure.
import type { RoadPoint } from '../track.ts'
import { roadDirection } from '../track.ts'
import type { Wall } from '../walls.ts'

/** A drift to begin before a ramp and carry through the air (terrain.ts's drift jump) */
export interface DriftJumpCue {
  /** The jump lip's road point */
  readonly lip: number
  /** Which way to drift: -1 left, 1 right */
  readonly way: -1 | 1
  /**
   * Where the flight is to come down: a road point (it may be a fraction) and metres right of
   * the middle. The drift is begun just early enough for the car to leave the lip going that way
   */
  readonly land: readonly [index: number, across: number]
  /** How far the stick goes into the drift before the lip, 0 to 1 */
  readonly into: number
  /** How far out the tail is to be at the landing, radians */
  readonly nose: number
  /** The fastest to leave the lip, m/s (a boost would fly the car past its landing); none: any */
  readonly most?: number
}

export interface TrackGuide {
  readonly safe: readonly number[]
  readonly safeRoom: readonly number[]
  readonly tech: readonly number[]
  readonly techRoom: readonly number[]
  readonly cues: readonly DriftJumpCue[]
  /**
   * The slots on the technical line: a gap in a wall, as a road point (it may be a fraction) and
   * metres right of the middle. The hands aim at each in turn until they are through it
   */
  readonly slots: readonly { readonly index: number; readonly across: number }[]
  /**
   * 2026-11-23 (#150): only the cues. The hands keep the line they find on the road by themselves
   * (round the walls, minding the edges) and take only the drift jumps from the guide: a track whose
   * road needs no line of its own but has a lip to drift over (the old street's step)
   */
  readonly cuesOnly?: true
}

interface Place {
  readonly x: number
  readonly z: number
}

const round = (value: number) => Math.round(value * 100) / 100

/** The place `metres` right of road point `index` (negative: left); `index` may be a fraction */
export function acrossRoad(road: readonly RoadPoint[], index: number, metres: number): Place {
  const count = road.length
  const whole = Math.floor(index)
  const share = index - whole
  const at = ((whole % count) + count) % count
  const next = (at + 1) % count
  const a = road[at]!
  const b = road[next]!
  const da = roadDirection(road, at)
  const db = roadDirection(road, next)
  const dx = da.dx + (db.dx - da.dx) * share
  const dz = da.dz + (db.dz - da.dz) * share
  const length = Math.hypot(dx, dz) || 1
  // The road's right, facing along it, is (-dz, dx)
  return {
    x: round(a.x + (b.x - a.x) * share - (dz / length) * metres),
    z: round(a.z + (b.z - a.z) * share + (dx / length) * metres),
  }
}

/** The road's height at road point `index` (a fraction is rounded) */
const heightAt = (road: readonly RoadPoint[], index: number): number =>
  road[((Math.round(index) % road.length) + road.length) % road.length]!.y ?? 0

/**
 * A fence: walls from place to place, each [road point, metres right of the middle]. With
 * `height` it can be flown over: its top is that far above the road beside it
 */
export function fence(
  road: readonly RoadPoint[],
  path: readonly (readonly [index: number, across: number])[],
  height?: number,
): Wall[] {
  const walls: Wall[] = []
  for (let step = 0; step + 1 < path.length; step++) {
    const [fromIndex, fromAcross] = path[step]!
    const [toIndex, toAcross] = path[step + 1]!
    const a = acrossRoad(road, fromIndex, fromAcross)
    const b = acrossRoad(road, toIndex, toAcross)
    const top =
      height === undefined
        ? {}
        : { top: round(Math.max(heightAt(road, fromIndex), heightAt(road, toIndex)) + height) }
    walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ...top })
  }
  return walls
}

/**
 * An island between two lanes: along the road from point `first` to `last`, between `inner` and
 * `outer` metres right of the middle, closed by a pointed nose one road point beyond each end (as
 * circuit.ts's island is)
 */
export function island(
  road: readonly RoadPoint[],
  first: number,
  last: number,
  inner: number,
  outer: number,
  height?: number,
): Wall[] {
  const middle = (inner + outer) / 2
  const path: [number, number][] = [[first - 1, middle]]
  for (let index = first; index <= last; index++) path.push([index, inner])
  path.push([last + 1, middle])
  for (let index = last; index >= first; index--) path.push([index, outer])
  path.push([first - 1, middle])
  return fence(road, path, height)
}

/**
 * Where the straight line from `from` to `to` (each a road point and metres right of the middle)
 * crosses the road at every road point between them: metres right of the middle, by road point
 */
export function chordOffsets(
  road: readonly RoadPoint[],
  from: readonly [number, number],
  to: readonly [number, number],
): Map<number, number> {
  const a = acrossRoad(road, from[0], from[1])
  const b = acrossRoad(road, to[0], to[1])
  const out = new Map<number, number>()
  const count = road.length
  for (let index = Math.ceil(from[0]); index <= Math.floor(to[0]); index++) {
    const at = ((index % count) + count) % count
    const point = road[at]!
    const { dx, dz } = roadDirection(road, at)
    // The cross-section there: point + s * (-dz, dx); the chord: a + t * (b - a)
    const ex = b.x - a.x
    const ez = b.z - a.z
    const det = -dz * -ez - dx * -ex
    if (Math.abs(det) < 1e-9) continue
    const s = ((a.x - point.x) * -ez - (a.z - point.z) * -ex) / det
    out.set(at, s)
  }
  return out
}

/** A line's steps from one hold to the next eased over a few road points */
export function smooth(offsets: readonly number[]): number[] {
  let line = [...offsets]
  const count = line.length
  for (let pass = 0; pass < 3; pass++) {
    line = line.map((value, index) =>
      round((line[(index - 1 + count) % count]! + 2 * value + line[(index + 1) % count]!) / 4),
    )
  }
  return line
}

/** One of a guide's two lines, being drawn */
export interface LineBuilder {
  /** From road point `from` to `to`: `across` metres right of the middle, `room` either side */
  hold(from: number, to: number, across: number, room: number): LineBuilder
  /** Straight (as the crow flies) from one place to another, `room` either side */
  chord(
    from: readonly [index: number, across: number],
    to: readonly [index: number, across: number],
    room: number,
  ): LineBuilder
}

export interface GuideBuilder {
  readonly safe: LineBuilder
  readonly tech: LineBuilder
  /** Both lines at once */
  readonly both: LineBuilder
  cue(cue: DriftJumpCue): GuideBuilder
  /** A slot on the technical line */
  slot(index: number, across: number): GuideBuilder
  build(): TrackGuide
}

/**
 * A guide for `road`, begun with both lines down the middle with `room` either side (by default 5 m
 * in from the kerbs)
 */
export function guideFor(road: readonly RoadPoint[], kerb = 5): GuideBuilder {
  const count = road.length
  const fresh = () => ({
    offsets: road.map(() => 0),
    room: road.map((point) => Math.max(0, point.width / 2 - kerb)),
  })
  const safe = fresh()
  const tech = fresh()
  const cues: DriftJumpCue[] = []
  const slots: { index: number; across: number }[] = []
  const builderOf = (lines: readonly ReturnType<typeof fresh>[]): LineBuilder => {
    const builder: LineBuilder = {
      hold(from, to, across, room) {
        for (let index = from; index <= to; index++) {
          const at = ((index % count) + count) % count
          for (const line of lines) {
            line.offsets[at] = across
            line.room[at] = room
          }
        }
        return builder
      },
      chord(from, to, room) {
        for (const [at, across] of chordOffsets(road, from, to)) {
          for (const line of lines) {
            line.offsets[at] = round(across)
            line.room[at] = room
          }
        }
        return builder
      },
    }
    return builder
  }
  const guide: GuideBuilder = {
    safe: builderOf([safe]),
    tech: builderOf([tech]),
    both: builderOf([safe, tech]),
    cue(cue) {
      cues.push(cue)
      return guide
    },
    slot(index, across) {
      slots.push({ index, across })
      return guide
    },
    build: () => ({
      safe: smooth(safe.offsets),
      safeRoom: safe.room,
      tech: tech.offsets,
      techRoom: tech.room,
      cues,
      slots,
    }),
  }
  return guide
}
