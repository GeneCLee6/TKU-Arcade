import { describe, expect, it } from 'vitest'
import { buildSpec } from '../../shared/kart/editor/build.ts'
import { LIMITS, starterSpec } from '../../shared/kart/editor/spec.ts'
import { KART_RADIUS } from '../../shared/kart/kartRadius.ts'
import { gridSpot, startTracking } from '../../shared/kart/race.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import {
  LINE_BACK,
  LINE_MIN_GAP,
  LINE_PLACES,
  LINE_ZIGZAG_BACK,
  lineOffsets,
} from '../../shared/kart/startLine.ts'
import { courseOf, parseTrack, type Track, type TrackJson } from '../../shared/kart/track.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'

// 2026-11-21 (owner: "not some in front and some behind, it is not fair; every kart on the same
// starting line from the start"): the grid is one row across the road.

/** How far behind the start and finish line (gate 0) a place is, metres */
function behindLine(track: Pick<Track, 'gates'>, x: number, z: number): number {
  const gate = track.gates[0]!
  const ax = gate.bx - gate.ax
  const az = gate.bz - gate.az
  const length = Math.hypot(ax, az)
  return Math.abs((x - gate.ax) * az - (z - gate.az) * ax) / length
}

const editorTrack = (json: TrackJson): Track => {
  const parsed = parseTrack(json)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  return parsed.track
}

const tracks: [string, Track][] = [
  ...RACE_TRACK_IDS.map((id): [string, Track] => [id, raceTrack(id)!]),
  ['the editor starter', editorTrack(buildSpec(starterSpec()).track)],
]

describe.each(tracks)('the grid of %s', (_, track) => {
  const spots = Array.from({ length: LINE_PLACES }, (__, slot) => gridSpot(track, slot))

  it('is eight karts side by side, every one the same distance behind the line', () => {
    expect(track.grid).toHaveLength(LINE_PLACES)
    for (const spot of spots) {
      expect(behindLine(track, spot.x, spot.z)).toBeCloseTo(LINE_BACK, 0)
      expect(spot.heading).toBe(spots[0]!.heading)
    }
    const distances = spots.map((spot) => behindLine(track, spot.x, spot.z))
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(0.3)
  })

  it('leaves room between them so that nobody touches at GO, and all on the road', () => {
    for (let a = 0; a < spots.length; a++) {
      expect(roadClearance(track.road, spots[a]!.x, spots[a]!.z)).toBeLessThanOrEqual(
        -(KART_RADIUS + 1),
      )
      for (let b = a + 1; b < spots.length; b++) {
        const apart = Math.hypot(spots[a]!.x - spots[b]!.x, spots[a]!.z - spots[b]!.z)
        expect(apart).toBeGreaterThanOrEqual(LINE_MIN_GAP - 0.02)
      }
    }
  })

  it('puts the first two in the middle, either side of it', () => {
    const middle = { x: (spots[0]!.x + spots[1]!.x) / 2, z: (spots[0]!.z + spots[1]!.z) / 2 }
    const sum = spots.reduce((all, spot) => ({ x: all.x + spot.x, z: all.z + spot.z }), {
      x: 0,
      z: 0,
    })
    expect(Math.hypot(sum.x / 8 - middle.x, sum.z / 8 - middle.z)).toBeLessThan(0.05)
  })

  it('keeps the time trial where the pole was, so that its records stand', () => {
    expect(track.solo).toBeDefined()
    expect(courseOf(track).start).toEqual(track.solo)
    expect(behindLine(track, track.solo!.x, track.solo!.z)).toBeCloseTo(LINE_BACK, 0)
  })

  it("a reset lands within the server's reach of each kart's own place", () => {
    spots.forEach((spot, slot) => {
      expect(startTracking(track, slot).safe).toEqual(spot)
    })
  })
})

describe('a road too narrow for eight in a row', () => {
  it('zigzags every other lane back instead, still one row of eight', () => {
    const offsets = lineOffsets(14)
    expect(offsets.some((one) => one.back === LINE_ZIGZAG_BACK)).toBe(true)
    const track = editorTrack(TEST_OVAL)
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        const one = track.grid[a]!
        const two = track.grid[b]!
        expect(Math.hypot(one.x - two.x, one.z - two.z)).toBeGreaterThan(2 * KART_RADIUS)
      }
    }
  })

  it('never happens on the narrowest road the editor allows', () => {
    expect(lineOffsets(LIMITS.minWidth).every((one) => one.back === 0)).toBe(true)
    const narrow = buildSpec({
      ...starterSpec(),
      pieces: starterSpec().pieces.map((piece) => ({ ...piece, width: LIMITS.minWidth })),
    })
    expect(narrow.problems.filter((problem) => problem.code === 'grid')).toEqual([])
  })
})
