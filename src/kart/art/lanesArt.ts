// 2026-11-20 (owner: "more lifelike, cooler"; docs/KART-WORLD.md §6.2): the Hillside Lanes' own
// scenery (shared/kart/tracks/lanes.ts). An old quarter on a hillside: plastered houses under tiled
// roofs with deep eaves, stone stairs with handrails climbing away from the road at each step, the
// well in the hollow of the last hairpin under its little roof, potted plants, wooden poles with
// their wires, red lanterns strung on them and hung in each yard gate (skillWalls.ts draws the
// gates). Our own simple shapes, placed from the track so that nothing stands on any road; no real
// street copied. Seeded: the same quarter each time.
import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three'
import { roadClearance, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection, trackBounds, type Track } from '../../../shared/kart/track.ts'
import { lanesScene } from '../../styles/kartTokens.ts'
import { addBatch, Batch, tileTexture, type Point3 } from './skillKit.ts'
import type { Slot, WallRun } from './skillWalls.ts'
import type { ArtKit } from './trackArt.ts'

interface House {
  readonly x: number
  readonly z: number
  readonly along: number
  readonly across: number
  /** Its front faces the road */
  readonly turn: number
  readonly storeys: number
  readonly colour: string
}

export interface LanesPlan {
  readonly houses: readonly House[]
  /** The hollow inside the well's hairpin, if there is room for the well there */
  readonly well: { x: number; z: number } | null
  fits(x: number, z: number): boolean
}

/** The road point nearest (x, z) */
function nearestIndex(road: Track['road'], x: number, z: number): number {
  let best = 0
  let bestDistance = Infinity
  road.forEach((point, index) => {
    const distance = Math.hypot(point.x - x, point.z - z)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** The centre of the circle through three points, or null if they are in a line */
function circumcentre(a: Point3, b: Point3, c: Point3): { x: number; z: number } | null {
  const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.z * a.z
  const b2 = b.x * b.x + b.z * b.z
  const c2 = c.x * c.x + c.z * c.z
  return {
    x: (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / d,
    z: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
}

export function lanesPlan(track: Track, density: number, runs: readonly WallRun[]): LanesPlan {
  const box = trackBounds(track)
  const { road } = track
  // The well: at the centre of the hairpin the island of walls runs round
  let well: { x: number; z: number } | null = null
  // The island's walls: every end shared with another wall's (a yard wall's ends are free)
  const tall = runs.filter((run) => !run.fence)
  const shared = (x: number, z: number, self: WallRun) =>
    tall.some(
      (other) =>
        other !== self &&
        (Math.hypot(other.ax - x, other.az - z) < 0.6 || Math.hypot(other.bx - x, other.bz - z) < 0.6),
    )
  const island = tall.filter((run) => shared(run.ax, run.az, run) && shared(run.bx, run.bz, run))
  if (island.length > 6) {
    // The island's walls are the many short ones; their middle is on the road, in the hairpin
    const mean = island.reduce((sum, run) => ({ x: sum.x + run.ax, z: sum.z + run.az }), { x: 0, z: 0 })
    const index = nearestIndex(road, mean.x / island.length, mean.z / island.length)
    const n = road.length
    const p = (k: number) => {
      const point = road[(k + n) % n]!
      return { x: point.x, y: 0, z: point.z }
    }
    const centre = circumcentre(p(index - 6), p(index), p(index + 6))
    if (centre && roadClearance(road, centre.x, centre.z) > 4) well = centre
  }
  const houses: House[] = scatter(road, {
    seed: 4101,
    count: Math.round(44 * density) + 8,
    box: { minX: box.minX - 90, maxX: box.maxX + 90, minZ: box.minZ - 90, maxZ: box.maxZ + 90 },
    clearance: 11,
    spacing: 17,
    maxClearance: 80,
    fits: (x, z) => !well || Math.hypot(well.x - x, well.z - z) > 14,
  }).map((one, index) => {
    const near = road[nearestIndex(road, one.x, one.z)]!
    return {
      x: one.x,
      z: one.z,
      along: 9 + one.a * 6,
      across: 7 + one.b * 3,
      // Box +z (its front) toward the road
      turn: Math.atan2(near.x - one.x, near.z - one.z),
      storeys: 1 + (index % 3 === 0 ? 1 : 0) + (one.a > 0.8 ? 1 : 0),
      colour: lanesScene.plaster[index % lanesScene.plaster.length]!,
    }
  })
  return {
    houses,
    well,
    fits: (x, z) =>
      !houses.some((one) => Math.hypot(one.x - x, one.z - z) < Math.max(one.along, one.across) / 2 + 3) &&
      (!well || Math.hypot(well.x - x, well.z - z) > 6),
  }
}

export function buildLanes(
  kit: ArtKit,
  plan: LanesPlan,
  options: {
    readonly slots: readonly Slot[]
    readonly groundAt: (x: number, z: number) => number
    readonly roadHeight: (index: number) => number
  },
): void {
  const { track, group } = kit
  const { road } = track
  const { groundAt, roadHeight } = options
  const plaster = new Batch()
  const tiles = new Batch()
  const lanterns: Point3[] = []
  const pots: Point3[] = []

  // ── Houses: plaster, a tiled gable roof with deep eaves, dark windows, a wooden door ──
  for (const house of plan.houses) {
    const base = groundAt(house.x, house.z)
    const height = 3.4 * house.storeys + 0.6
    const c = Math.cos(house.turn)
    const s = Math.sin(house.turn)
    const at = (along: number, out: number, y: number): Point3 => ({
      x: house.x + c * along + s * out,
      y,
      z: house.z - s * along + c * out,
    })
    // Down into the slope a little, so that no house floats on the hillside
    plaster.box(at(0, 0, base + height / 2 - 1), [house.along, height + 2, house.across], house.turn, house.colour)
    // A stone plinth
    plaster.box(at(0, 0, base - 0.2), [house.along + 0.3, 1.4, house.across + 0.3], house.turn, lanesScene.stoneDark)
    for (let storey = 0; storey < house.storeys; storey++) {
      const y = base + 1.9 + storey * 3.4
      const windows = Math.max(2, Math.floor(house.along / 3.2))
      for (let k = 0; k < windows; k++) {
        const along = ((k + 0.5) / windows - 0.5) * (house.along - 1.6)
        // The door in the middle of the front, downstairs
        const door = storey === 0 && k === Math.floor(windows / 2)
        plaster.box(
          at(along, house.across / 2, door ? base + 1.1 : y + 0.2),
          door ? [1.3, 2.3, 0.16] : [1.1, 1.3, 0.16],
          house.turn,
          door ? lanesScene.door : lanesScene.window,
        )
        if (!door) plaster.box(at(along, house.across / 2 + 0.1, y - 0.5), [1.4, 0.14, 0.3], house.turn, lanesScene.stone)
      }
      // A pot either side of the door
      if (storey === 0) {
        for (const side of [-1.4, 1.4]) {
          const p = at(side, house.across / 2 + 0.8, 0)
          if (roadClearance(road, p.x, p.z) > 1) pots.push({ ...p, y: groundAt(p.x, p.z) })
        }
      }
    }
    // The roof: a gable with eaves 0.9 m deep all round, a ridge along the top
    const rise = house.across * 0.32
    tiles.prism(
      at(0, 0, base + height),
      [
        [-house.across / 2 - 0.9, -0.15],
        [house.across / 2 + 0.9, -0.15],
        [0, rise],
      ],
      house.along + 1.8,
      house.turn + Math.PI / 2,
      lanesScene.tile,
      2,
    )
    tiles.box(at(0, 0, base + height + rise), [house.along + 2, 0.35, 0.45], house.turn, lanesScene.tileEdge)
    // A lantern by the door
    lanterns.push(at(0, house.across / 2 + 0.9, base + 3))
  }

  // ── The well: a stone ring, the water, two posts and a little tiled roof, a bucket ──
  if (plan.well) {
    const { x, z } = plan.well
    const y = groundAt(x, z)
    for (let k = 0; k < 10; k++) {
      const angle = (k / 10) * Math.PI * 2
      plaster.box(
        { x: x + Math.cos(angle) * 1.7, y: y + 0.5, z: z + Math.sin(angle) * 1.7 },
        [1.15, 1, 0.5],
        -angle + Math.PI / 2,
        k % 2 === 0 ? lanesScene.stone : lanesScene.stoneDark,
      )
    }
    plaster.box({ x, y: y + 0.6, z }, [2.6, 0.1, 2.6], 0, lanesScene.water)
    for (const side of [-1, 1]) plaster.box({ x: x + side * 2.1, y: y + 1.6, z }, [0.3, 3.2, 0.3], 0, lanesScene.wood)
    plaster.tube({ x: x - 2.1, y: y + 2.6, z }, { x: x + 2.1, y: y + 2.6, z }, 0.14, lanesScene.wood, 6)
    plaster.tube({ x, y: y + 2.6, z }, { x, y: y + 1.3, z }, 0.03, lanesScene.wire, 4)
    plaster.box({ x, y: y + 1.1, z }, [0.5, 0.5, 0.5], 0, lanesScene.wood)
    tiles.prism({ x, y: y + 3.2, z }, [[-1.8, 0], [1.8, 0], [0, 1.1]], 5.4, 0, lanesScene.tile, 2)
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2 + 0.3
      const p = { x: x + Math.cos(angle) * 4.2, z: z + Math.sin(angle) * 4.2 }
      if (roadClearance(road, p.x, p.z) > 1) pots.push({ ...p, y: groundAt(p.x, p.z) })
    }
  }

  // ── Stone stairs climbing away from the road beside each step, a handrail up each ──
  for (const lip of track.jumps ?? []) {
    const point = road[lip]!
    const { dx, dz } = roadDirection(road, lip)
    for (const side of [-1, 1]) {
      // The road's right is (-dz, dx)
      const ox = -dz * side
      const oz = dx * side
      const start = point.width / 2 + 3
      const foot = { x: point.x + ox * start, z: point.z + oz * start }
      if (roadClearance(road, foot.x, foot.z) < 2) continue
      // Clear of every road the whole way up
      if (roadClearance(road, foot.x + ox * 12, foot.z + oz * 12) < 2) continue
      const y0 = roadHeight(lip) - 0.8
      const turn = Math.atan2(ox, oz)
      for (let step = 0; step < 12; step++) {
        const out = start + step * 0.95
        plaster.box(
          { x: point.x + ox * out, y: y0 + (step + 1) * 0.36 - 0.5, z: point.z + oz * out },
          [3.4, 1, 0.95],
          turn,
          step % 2 === 0 ? lanesScene.stone : lanesScene.stoneDark,
        )
      }
      // Low walls either side, a rail on posts along one
      for (const edge of [-1, 1]) {
        const ex = dx * edge * 1.9
        const ez = dz * edge * 1.9
        const a = { x: foot.x + ex, y: y0 + 0.4, z: foot.z + ez }
        const b = { x: foot.x + ex + ox * 11.4, y: y0 + 12 * 0.36 + 0.4, z: foot.z + ez + oz * 11.4 }
        plaster.tube({ ...a, y: a.y + 0.9 }, { ...b, y: b.y + 0.9 }, 0.06, lanesScene.rail, 6)
        for (let post = 0; post <= 4; post++) {
          const t = post / 4
          const px = a.x + (b.x - a.x) * t
          const pz = a.z + (b.z - a.z) * t
          const py = a.y + (b.y - a.y) * t
          plaster.tube({ x: px, y: py - 0.4, z: pz }, { x: px, y: py + 0.9, z: pz }, 0.05, lanesScene.rail, 4)
        }
      }
    }
  }

  // ── Wooden poles along the road, their wires, lanterns strung between them ──
  const poles: Point3[] = []
  for (let index = 0; index < road.length; index += 7) {
    const point = road[index]!
    const { dx, dz } = roadDirection(road, index)
    const side = Math.floor(index / 7) % 2 === 0 ? 1 : -1
    const reach = point.width / 2 + 4.5
    const x = point.x - dz * reach * side
    const z = point.z + dx * reach * side
    if (roadClearance(road, x, z) < 3) continue
    if (!plan.fits(x, z)) continue
    poles.push({ x, y: groundAt(x, z), z })
  }
  const POLE = 8.5
  poles.forEach((pole, index) => {
    plaster.tube(pole, { ...pole, y: pole.y + POLE }, 0.16, lanesScene.pole, 6)
    plaster.box({ ...pole, y: pole.y + POLE - 0.6 }, [2.2, 0.18, 0.18], 0.4 * index, lanesScene.pole)
    const next = poles[index + 1]
    if (!next) return
    const span = Math.hypot(next.x - pole.x, next.z - pole.z)
    if (span > 60) return
    // A wire sagging between the two, a lantern hung at each third
    const top = { ...pole, y: pole.y + POLE - 0.7 }
    const end = { ...next, y: next.y + POLE - 0.7 }
    const sag = (t: number): Point3 => ({
      x: top.x + (end.x - top.x) * t,
      y: top.y + (end.y - top.y) * t - Math.sin(Math.PI * t) * 1.4,
      z: top.z + (end.z - top.z) * t,
    })
    for (let k = 0; k < 4; k++) plaster.tube(sag(k / 4), sag((k + 1) / 4), 0.035, lanesScene.wire, 3)
    for (const t of [1 / 3, 2 / 3]) {
      const at = sag(t)
      lanterns.push({ ...at, y: at.y - 0.7 })
    }
  })

  // ── Two lanterns hung in every yard gate ──
  for (const slot of options.slots) {
    for (const side of [-1, 1]) {
      lanterns.push({
        x: slot.x + slot.ux * side * slot.width * 0.25,
        y: slot.base + 6.3,
        z: slot.z + slot.uz * side * slot.width * 0.25,
      })
    }
  }

  addBatch(kit, plaster)
  addBatch(kit, tiles, { map: tileTexture(kit) })

  // Lanterns: a glowing red body, dark caps, a yellow tassel
  if (lanterns.length > 0) {
    const bodies = new InstancedMesh(
      kit.keep(new SphereGeometry(0.42, 10, 8)),
      kit.own(new MeshBasicMaterial({ color: lanesScene.lanternGlow })),
      lanterns.length,
    )
    const caps = new InstancedMesh(kit.keep(new CylinderGeometry(0.22, 0.22, 0.95, 8)), kit.standard(lanesScene.tile), lanterns.length)
    const tassels = new InstancedMesh(kit.keep(new ConeGeometry(0.08, 0.5, 5)), kit.standard(lanesScene.tassel), lanterns.length)
    lanterns.forEach((one, index) => {
      kit.place(bodies, index, one.x, one.y, one.z, [1, 1.25, 1])
      kit.place(caps, index, one.x, one.y, one.z, [1, 1, 1])
      kit.place(tassels, index, one.x, one.y - 0.75, one.z, [1, 1, 1])
    })
    group.add(bodies, caps, tassels)
  }
  // Pots: terracotta, a round shrub in each
  if (pots.length > 0) {
    const tubs = new InstancedMesh(kit.keep(new CylinderGeometry(0.42, 0.3, 0.6, 8)), kit.standard(lanesScene.pot), pots.length)
    const shrubs = new InstancedMesh(kit.keep(new IcosahedronGeometry(0.55, 0)), kit.standard(lanesScene.leaf), pots.length)
    pots.forEach((one, index) => {
      kit.place(tubs, index, one.x, one.y + 0.3, one.z, [1, 1, 1])
      kit.place(shrubs, index, one.x, one.y + 0.95, one.z, [1, 0.9 + (index % 3) * 0.2, 1], index)
    })
    group.add(kit.shadowed(tubs), kit.shadowed(shrubs))
  }
}
