// N2 (e10-t04a, e10-t04b): the item track, the old street night market. Its layout checked like the
// others (valid, wide enough for eight karts, never running into itself, drivable three times), its
// own parts (the stall island that splits the temple fork, the shortcut, the boxes in its file),
// and where its scenery stands.
import { describe, expect, it } from 'vitest'
import { itemBoxes } from '../../shared/kart/items.ts'
import { STEP_SECONDS, type KartInput } from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import {
  seconds,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import {
  courseOf,
  kerbs,
  parseTrack,
  recordKey,
  roadDirection,
  type Track,
} from '../../shared/kart/track.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import {
  FORK_WIDTH,
  ISLAND_INNER,
  ISLAND_OUTER,
  islandSpan,
  OLDSTREET,
} from '../../shared/kart/tracks/oldstreet.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { KART_RADIUS, wallClearance } from '../../shared/kart/walls.ts'
import {
  inOldStreetRiver,
  OLDSTREET_TEMPLE,
  oldStreetTreeFits,
} from '../../src/kart/art/oldStreetArt.ts'
import { alongRoad } from './trackShape.ts'

const load = (): Track => {
  const parsed = parseTrack(OLDSTREET)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  return parsed.track
}

const lengthOf = (points: readonly { x: number; z: number }[], closed = true) =>
  points.reduce((sum, point, index) => {
    if (!closed && index === points.length - 1) return sum
    const next = points[(index + 1) % points.length]!
    return sum + Math.hypot(next.x - point.x, next.z - point.z)
  }, 0)

/** The line `across` metres right of the centre line, over road points first to last */
const laneLine = (track: Track, first: number, last: number, across: number) => {
  const out: { x: number; z: number }[] = []
  for (let index = first; index <= last; index++) {
    const point = track.road[index]!
    const { dx, dz } = roadDirection(track.road, index)
    out.push({ x: point.x - dz * across, z: point.z + dx * across })
  }
  return out
}

/** Steers at the road a few points ahead, slowing for bends (as tamkang.test.ts) */
function autopilot(trial: Trial, road: readonly { x: number; z: number }[]): KartInput {
  const { kart } = trial.run
  let nearest = 0
  let best = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - kart.x) ** 2 + (point.z - kart.z) ** 2
    if (distance < best) {
      best = distance
      nearest = index
    }
  })
  const target = road[(nearest + 4) % road.length]!
  let turn = Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.35
  return {
    throttle: !(sharp && speed > 14),
    brake: sharp && speed > 20,
    steer: Math.max(-1, Math.min(1, turn * 3)),
    drift: false,
    boost: false,
  }
}

describe('the old street (N2 item track)', () => {
  it('is a valid track, in the race rooms, under its own records', () => {
    const track = load()
    expect(track.id).toBe('oldstreet')
    expect(RACE_TRACK_IDS).toContain('oldstreet')
    expect(raceTrack('oldstreet')?.road).toEqual(track.road)
    expect(recordKey(track)).toBe('oldstreet')
    // The line is on the promenade, driven northwards (-z); the grid is behind it
    expect(track.road[0]!.x).toBeCloseTo(0)
    for (const place of track.grid) {
      expect(place.z).toBeGreaterThan(track.road[0]!.z)
      expect(place.heading).toBeCloseTo(0)
    }
    const length = lengthOf(track.road)
    expect(length).toBeGreaterThan(2200)
    expect(length).toBeLessThan(2800)
  })

  it('leaves room for eight karts side by side everywhere, in both lanes of the fork', () => {
    const track = load()
    const eightKarts = 8 * 2 * KART_RADIUS
    expect(Math.min(...track.road.map((point) => point.width))).toBeGreaterThanOrEqual(28)
    // Wide where the boxes go: the straights are 40 m or more
    expect(track.road.filter((point) => point.width >= 40).length).toBeGreaterThan(
      track.road.length / 3,
    )
    // Each lane, from the island to the kerb, measured on the walls themselves
    const kerbWalls = kerbs(track.road)
    for (const wall of track.walls) {
      for (const end of [
        { x: wall.ax, z: wall.az },
        { x: wall.bx, z: wall.bz },
      ]) {
        expect(wallClearance(kerbWalls, end.x, end.z)).toBeGreaterThanOrEqual(28)
      }
    }
    expect(FORK_WIDTH / 2 - ISLAND_OUTER - 2 * KART_RADIUS).toBeGreaterThan(eightKarts)
  })

  it('never runs into itself, and its kerbs never fold over', () => {
    const { road } = load()
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        // Neighbours along the road are close by nature (the wide fork's two sides included)
        if (alongRoad(road, i, j) < Math.max(90, (road[i]!.width + road[j]!.width) * 1.2)) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        if (gap <= (road[i]!.width + road[j]!.width) / 2 + 4) {
          throw new Error(`road ${i} and ${j} are ${gap.toFixed(1)} m apart`)
        }
      }
    }
    // The bend at every point is wider than half the road, so the inside kerb never crosses itself
    for (let index = 0; index < road.length; index++) {
      const a = road[(index - 2 + road.length) % road.length]!
      const b = road[index]!
      const c = road[(index + 2) % road.length]!
      const ab = Math.hypot(b.x - a.x, b.z - a.z)
      const bc = Math.hypot(c.x - b.x, c.z - b.z)
      const ca = Math.hypot(a.x - c.x, a.z - c.z)
      const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
      const radius = cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross)
      expect(radius, `road ${index}`).toBeGreaterThan(b.width / 2 + 3)
    }
  })

  it('splits the fork with a closed island of walls, clear of the respawns and the grid', () => {
    const track = load()
    const { first, last } = islandSpan(track.road)
    expect(first).toBeGreaterThan(0)
    expect(last - first).toBeGreaterThan(30)
    // A closed loop: each wall starts where the one before ended
    track.walls.forEach((wall, index) => {
      const before = track.walls[(index - 1 + track.walls.length) % track.walls.length]!
      expect(wall.ax).toBe(before.bx)
      expect(wall.az).toBe(before.bz)
    })
    // On the road, inside both kerbs
    for (const wall of track.walls) {
      expect(roadClearance(track.road, wall.ax, wall.az)).toBeLessThan(-10)
    }
    for (const spot of [...track.respawns, ...track.grid]) {
      expect(wallClearance(track.walls, spot.x, spot.z)).toBeGreaterThan(ISLAND_INNER - 2)
    }
    // No item box or boost pad on the island
    for (const thing of [...track.itemBoxes, ...track.boostPads]) {
      expect(wallClearance(track.walls, thing.x, thing.z)).toBeGreaterThan(3)
    }
  })

  it('makes the inside lane the shortcut: much shorter than the outside lane', () => {
    const track = load()
    const { first, last } = islandSpan(track.road)
    const half = FORK_WIDTH / 2
    // The tightest line in each lane: hugging the inside kerb, or the island from outside
    const inside = lengthOf(laneLine(track, first, last, half - 2), false)
    const outside = lengthOf(laneLine(track, first, last, ISLAND_INNER - 2), false)
    expect(outside - inside).toBeGreaterThan(70)
    expect(inside).toBeGreaterThan(80)
  })

  it('puts the item race’s boxes where its file says, on the road, the shortcut boxless', () => {
    const track = load()
    const boxes = itemBoxes(track)
    expect(boxes).toEqual(track.itemBoxes.map(({ x, z }) => ({ x, z })))
    expect(boxes.length).toBeGreaterThanOrEqual(25)
    expect(boxes.length).toBeLessThanOrEqual(255)
    const { first, last } = islandSpan(track.road)
    const insideLane = laneLine(track, first, last, (ISLAND_OUTER + FORK_WIDTH / 2) / 2)
    for (const box of boxes) {
      // On the road, a kart's reach in from the kerb
      expect(roadClearance(track.road, box.x, box.z)).toBeLessThan(-KART_RADIUS - 0.5)
      // Not in the inside lane
      const nearInside = Math.min(...insideLane.map((p) => Math.hypot(p.x - box.x, p.z - box.z)))
      expect(nearInside).toBeGreaterThan(10)
      // Not on the finish line
      const line = track.gates[0]!
      const middle = { x: (line.ax + line.bx) / 2, z: (line.az + line.bz) / 2 }
      expect(Math.abs(box.z - middle.z) + Math.abs(box.x - middle.x)).toBeGreaterThan(10)
    }
  })

  it('can be driven round three times, never the wrong way', () => {
    const track = load()
    const course: TrialCourse = {
      ...courseOf(track),
      checkpoints: courseOf(track).checkpoints!,
      road: track.road,
    }
    let trial = startTrial(course)
    let steps = 0
    let wrongWarnings = 0
    while (trial.phase !== 'finished' && steps < 480 / STEP_SECONDS) {
      const before = trial
      trial = stepTrial(trial, autopilot(trial, track.road), course)
      if (trial.wrongWay && !before.wrongWay) wrongWarnings++
      steps++
    }
    expect(trial.phase).toBe('finished')
    expect(wrongWarnings).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(420)
  })
})

describe('the old street scenery', () => {
  it('keeps the river off the road, and the temple on the square inside the fork', () => {
    const track = load()
    for (const point of track.road) {
      expect(inOldStreetRiver(point.x - point.width / 2, point.z, 20)).toBe(false)
    }
    const { minX, maxX, minZ, maxZ } = OLDSTREET_TEMPLE
    for (let x = minX; x <= maxX; x += (maxX - minX) / 6) {
      for (let z = minZ; z <= maxZ; z += (maxZ - minZ) / 6) {
        expect(roadClearance(track.road, x, z), `${x}, ${z}`).toBeGreaterThan(3)
        expect(oldStreetTreeFits(x, z)).toBe(false)
      }
    }
    expect(oldStreetTreeFits(-100, 0)).toBe(false)
  })
})
