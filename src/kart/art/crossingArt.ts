// 2026-11-22: the art of a road over a road (shared/kart/levels.ts, docs/ARCHITECTURE.md §4.64):
// where the viaduct crosses the underpass, its deck (a concrete slab under the road, with a dark
// underside: the underpass's roof) and the underpass's two walls standing on its kerbs up to the
// deck. The ground beside the underpass lies at its level (hillArt.ts), so the viaduct is on its
// deck there and on a bank of earth beyond. A track without crossings never comes here. Built in
// code like the rest; original.
import { BoxGeometry, Mesh } from 'three'
import { pathDirection } from '../../../shared/kart/branches.ts'
import type { Crossing } from '../../../shared/kart/levels.ts'
import type { RoadPoint } from '../../../shared/kart/track.ts'
import { kartScene } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

/** The deck's depth under the road, metres */
const DECK = 1.6
/** The deck reaches this far either side of the underpass's kerbs, metres (hillArt.ts's UNDER_REACH) */
const SPAN = 17
/** The walls stand this far out from the underpass's kerbs, and are this thick, metres */
const WALL_OUT = 0.8
const WALL = 1.2

const wrap = (count: number, index: number) => ((index % count) + count) % count

/** How far (x, z) is from the centre line of `road` between points `from` and `to` (a stretch) */
function distanceTo(road: readonly RoadPoint[], from: number, to: number, x: number, z: number) {
  const count = road.length
  let best = Infinity
  for (let index = from; index < to; index++) {
    const a = road[wrap(count, index)]!
    const b = road[wrap(count, index + 1)]!
    const sx = b.x - a.x
    const sz = b.z - a.z
    const lengthSq = sx * sx + sz * sz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / lengthSq))
    best = Math.min(best, Math.hypot(x - (a.x + sx * t), z - (a.z + sz * t)))
  }
  return best
}

/** The stretch of road round segment `segment` that lies within `reach` of the crossing */
function stretch(road: readonly RoadPoint[], segment: number, crossing: Crossing, reach: number) {
  const count = road.length
  const near = (index: number) => {
    const point = road[wrap(count, index)]!
    return Math.hypot(point.x - crossing.x, point.z - crossing.z) < reach
  }
  let from = segment
  while (near(from - 1) && segment - from < count) from--
  let to = segment + 1
  while (near(to + 1) && to - segment < count) to++
  return { from, to }
}

export function buildCrossings(kit: ArtKit): void {
  const { track, group, keep, standard, shadowed } = kit
  const crossings = track.crossings ?? []
  if (crossings.length === 0) return
  const { road } = track
  const count = road.length
  const deckMaterial = standard(kartScene.concrete)
  const roofMaterial = standard(kartScene.concreteDark)
  const box = new BoxGeometry(1, 1, 1)
  keep(box)
  const piece = (
    a: { x: number; z: number },
    b: { x: number; z: number },
    bottom: number,
    top: number,
    width: number,
    material: typeof deckMaterial,
  ) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 0.05 || top <= bottom) return
    const mesh = new Mesh(box, material)
    // A little longer than its stretch, so that the pieces close at the bends
    mesh.scale.set(length + 0.6, top - bottom, width)
    mesh.position.set((a.x + b.x) / 2, (bottom + top) / 2, (a.z + b.z) / 2)
    mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
    group.add(shadowed(mesh))
  }
  for (const crossing of crossings) {
    const upper = stretch(road, crossing.upper, crossing, crossing.reach + 30)
    const lower = stretch(road, crossing.lower, crossing, crossing.reach + 30)
    const lowerHalf = road[crossing.lower]!.width / 2
    const upperHalf = road[crossing.upper]!.width / 2
    // The deck: under the viaduct wherever the ground beneath it lies at the underpass
    for (let index = upper.from; index < upper.to; index++) {
      const a = road[wrap(count, index)]!
      const b = road[wrap(count, index + 1)]!
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      if (distanceTo(road, lower.from, lower.to, mid.x, mid.z) > lowerHalf + SPAN) continue
      const y = Math.min(a.y ?? 0, b.y ?? 0)
      piece(a, b, y - DECK, y - 0.02, a.width + 1.2, deckMaterial)
      // The underside, darker: the underpass's roof
      piece(a, b, y - DECK - 0.05, y - DECK + 0.05, a.width + 1, roofMaterial)
    }
    // The underpass's walls, on both its kerbs, from the ground to the deck
    const deckBottom = crossing.upperY - DECK
    for (let index = lower.from; index < lower.to; index++) {
      const a = road[wrap(count, index)]!
      const b = road[wrap(count, index + 1)]!
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      if (distanceTo(road, upper.from, upper.to, mid.x, mid.z) > upperHalf + 2) continue
      const da = pathDirection(road, wrap(count, index), true)
      const db = pathDirection(road, wrap(count, index + 1), true)
      for (const side of [-1, 1]) {
        const out = (point: RoadPoint, d: { dx: number; dz: number }) => {
          const across = side * (point.width / 2 + WALL_OUT + WALL / 2)
          // The road's right, facing along it, is (-dz, dx)
          return { x: point.x - d.dz * across, z: point.z + d.dx * across }
        }
        piece(out(a, da), out(b, db), Math.min(a.y ?? 0, b.y ?? 0) - 0.5, deckBottom, WALL, roofMaterial)
      }
    }
  }
}
