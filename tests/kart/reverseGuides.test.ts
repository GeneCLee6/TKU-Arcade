// 2026-11-23 (docs/ARCHITECTURE.md §4.92, docs/KART-FEEL.md §28): the reversed tracks' guides
// (shared/kart/tracks/reverseGuides.ts). Their geometry (no line through a wall, every slot in its
// gap, every drift jump off a lip of the reversed road), the carrying over itself, and the measure the
// owner asked for: on the reversed tracks to learn by heart the driver who knows them (the master)
// is ahead of the one who only drives well (the expert).
import { describe, expect, it } from 'vitest'
import { DRIVERS, measure } from '../../scripts/kart/drivers.ts'
import { routeRoad } from '../../shared/kart/branches.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import type { RoadPoint } from '../../shared/kart/track.ts'
import { acrossRoad, type TrackGuide } from '../../shared/kart/tracks/guide.ts'
import { routeGuide, trackGuide } from '../../shared/kart/tracks/guides.ts'
import { REVERSE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { carryGuide, crossedWalls, technical } from '../../shared/kart/tracks/reverseGuides.ts'
import type { Wall } from '../../shared/kart/walls.ts'

/** Every reversed guide, with the road it is drawn on */
const guides = REVERSE_TRACK_IDS.flatMap((id) => {
  const track = raceTrack(id)!
  const out: { id: string; road: readonly RoadPoint[]; guide: TrackGuide }[] = []
  const main = trackGuide(id)
  if (main) out.push({ id: `${id} main`, road: track.road, guide: main })
  const route = routeGuide(id)
  if (route) {
    const road = routeRoad(track, (track.forks ?? []).map((_, k) => k)).road
    out.push({ id: `${id} route`, road, guide: route })
  }
  return out.map((one) => ({ ...one, walls: track.walls, jumps: track.jumps ?? [] }))
})

const toWall = (x: number, z: number, wall: Wall): number => {
  const ex = wall.bx - wall.ax
  const ez = wall.bz - wall.az
  const t = Math.max(0, Math.min(1, ((x - wall.ax) * ex + (z - wall.az) * ez) / (ex * ex + ez * ez || 1)))
  return Math.hypot(x - wall.ax - ex * t, z - wall.az - ez * t)
}

describe('the reversed tracks’ guides: geometry', () => {
  it('are there for the reversed tracks to learn by heart', () => {
    expect(guides.map((one) => one.id)).toEqual([
      'wharf-rev main',
      'wharf-rev route',
      'lanes-rev main',
      'works-rev route',
      'zhuwei-rev route',
    ])
  })

  it.each(guides)('$id: a line for every road point, and each asks something technical', ({ road, guide }) => {
    for (const line of [guide.safe, guide.safeRoom, guide.tech, guide.techRoom]) {
      expect(line).toHaveLength(road.length)
      expect(line.every(Number.isFinite)).toBe(true)
    }
    expect(technical(guide)).toBe(true)
  })

  it.each(guides)('$id: neither line goes through a wall (no cue flies over one)', ({ road, guide, walls }) => {
    expect(crossedWalls(road, guide.tech, walls)).toEqual([])
    expect(crossedWalls(road, guide.safe, walls)).toEqual([])
  })

  it.each(guides)('$id: every slot is in its gap, on the technical line', ({ road, guide, walls }) => {
    for (const slot of guide.slots) {
      const place = acrossRoad(road, slot.index, slot.across)
      const nearest = Math.min(...walls.map((wall) => toWall(place.x, place.z, wall)))
      expect(nearest).toBeGreaterThan(1.4)
      expect(Math.abs(guide.tech[Math.round(slot.index) % road.length]! - slot.across)).toBeLessThan(3)
    }
  })

  it.each(guides)('$id: every drift jump is off a lip of the reversed road, landing ahead of it', ({ guide, jumps }) => {
    for (const cue of guide.cues) {
      expect(jumps).toContain(cue.lip)
      expect(cue.land[0] - cue.lip).toBeGreaterThan(0)
      expect(cue.land[0] - cue.lip).toBeLessThan(20)
    }
  })

  it('carries a line over point for point: metres right become metres left', () => {
    const forward = raceTrack('harbour')!
    const reversed = raceTrack('harbour-rev')!
    const guide = trackGuide('harbour')!
    const carried = carryGuide(reversed.road, [{ road: forward.road, guide }])
    const n = forward.road.length
    carried.safe.forEach((across, index) => {
      expect(Math.abs(across + guide.safe[(n - index) % n]!)).toBeLessThan(0.05)
      expect(carried.safeRoom[index]).toBe(guide.safeRoom[(n - index) % n])
    })
    expect(carried.cues).toEqual([])
  })

  it('carries the slots over: the same gaps, seen from the other side', () => {
    const forward = trackGuide('wharf')!
    const n = raceTrack('wharf')!.road.length
    const reversed = trackGuide('wharf-rev')!
    // The rows' last two slots (the first two the other way round)
    for (const slot of forward.slots.slice(1)) {
      const back = reversed.slots.find((one) => Math.abs(one.index - (n - slot.index)) < 1)
      expect(back, `slot ${slot.index}`).toBeDefined()
      expect(Math.abs(back!.across + slot.across)).toBeLessThan(0.5)
    }
  })

  it('leaves out the guides that ask nothing technical the other way round', () => {
    for (const id of ['harbour-rev', 'oldstreet-rev', 'danhai-rev', 'breakwater-rev', 'riverside-rev']) {
      expect(trackGuide(id), id).toBeUndefined()
      expect(routeGuide(id), id).toBeUndefined()
    }
  })
})

describe('the reversed tracks to learn by heart: the master ahead of the expert', () => {
  const race = (id: string, who: 'master' | 'expert', seeds: readonly number[]) =>
    seeds.map((seed) => {
      const run = measure(raceTrack(id)!, DRIVERS[who], KART_TUNING, seed)
      expect(run.finished).toBe(true)
      expect(run.resets).toBe(0)
      return run.seconds
    })
  const mean = (values: readonly number[]) => values.reduce((sum, one) => sum + one, 0) / values.length

  it.each([
    // The owner's measure on the original tracks is 8% (docs/KART-FEEL.md §11); the well's lane
    // the other way round gives less (§28)
    ['wharf-rev', 0.08],
    ['lanes-rev', 0.05],
  ] as const)('%s: the master at least %s ahead over three seeds, never reset', (id, gap) => {
    const seeds = [7, 14, 21]
    const master = mean(race(id, 'master', seeds))
    const expert = mean(race(id, 'expert', seeds))
    expect((expert - master) / expert).toBeGreaterThanOrEqual(gap)
  }, 120_000)

  it.each(['works-rev', 'zhuwei-rev'])('%s: the master ahead of the expert', (id) => {
    expect(race(id, 'master', [7])[0]!).toBeLessThan(race(id, 'expert', [7])[0]!)
  }, 60_000)
})
