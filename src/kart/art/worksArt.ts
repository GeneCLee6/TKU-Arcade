// 2026-11-20: the Viaduct Works' own scenery (shared/kart/tracks/works.ts; docs/KART-WORLD.md):
// a riverside factory quarter under an elevated line. Factory sheds with grey roofs, brick
// chimneys, the elevated line itself striding across the north of the quarter on its piers, and
// concrete piers under the loading deck where it stands above the yard. Our own simple shapes,
// placed from the track so that nothing stands on any road (scenery.ts counts the branches as
// road): no model or image files, no real building copied. Seeded: the same track, the same quarter.
import { BoxGeometry, CylinderGeometry, InstancedMesh } from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { roadClearance, scatter } from '../../../shared/kart/scenery.ts'
import { trackBounds } from '../../../shared/kart/track.ts'
import { worksScene } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

/** The elevated line's deck: this high, this wide, a pier every this many metres */
const LINE_HEIGHT = 14
const LINE_WIDTH = 9
const PIER_EVERY = 36

export function buildWorks(kit: ArtKit, groundAt: (x: number, z: number) => number): void {
  const { track, level, group, keep, standard, shadowed, place } = kit
  const box = trackBounds(track)
  const rng = createRng(2011)
  const reach = {
    minX: box.minX - 90,
    maxX: box.maxX + 90,
    minZ: box.minZ - 30,
    maxZ: box.maxZ + 90,
  }

  // ── Sheds: a body and a roof slab a little wider, turned square to the nearest road ──
  const sheds = scatter(track.road, {
    seed: 2012,
    count: Math.round(46 * level.density),
    box: reach,
    clearance: 14,
    spacing: 34,
    maxClearance: 90,
  })
  const cube = keep(new BoxGeometry(1, 1, 1))
  worksScene.shedWalls.forEach((colour, shade) => {
    const these = sheds.filter((_, index) => index % worksScene.shedWalls.length === shade)
    if (these.length === 0) return
    const bodies = new InstancedMesh(cube, standard(colour), these.length)
    const roofs = new InstancedMesh(cube, standard(worksScene.shedRoof), these.length)
    these.forEach((shed, index) => {
      const width = 14 + shed.a * 16
      const depth = 10 + shed.b * 12
      const height = 6 + shed.a * 5
      const turn = Math.round(shed.b * 4) * (Math.PI / 2) + (shed.a > 0.5 ? 0.3 : 0)
      const base = groundAt(shed.x, shed.z)
      place(bodies, index, shed.x, base + height / 2, shed.z, [width, height, depth], turn)
      place(
        roofs,
        index,
        shed.x,
        base + height + 0.4,
        shed.z,
        [width + 1.2, 0.8, depth + 1.2],
        turn,
      )
    })
    group.add(shadowed(bodies), shadowed(roofs))
  })

  // ── Chimneys: tall brick stacks with a dark band at the top ──
  const stacks = scatter(track.road, {
    seed: 2013,
    count: Math.max(3, Math.round(9 * level.density)),
    box: reach,
    clearance: 24,
    spacing: 70,
    maxClearance: 120,
  })
  const stackGeometry = keep(new CylinderGeometry(0.75, 1, 1, 10))
  const chimneys = new InstancedMesh(stackGeometry, standard(worksScene.chimney), stacks.length)
  const tops = new InstancedMesh(stackGeometry, standard(worksScene.chimneyTop), stacks.length)
  stacks.forEach((stack, index) => {
    const height = 24 + stack.a * 16
    const width = 2.4 + stack.b
    const base = groundAt(stack.x, stack.z)
    place(chimneys, index, stack.x, base + height / 2, stack.z, [width, height, width])
    place(tops, index, stack.x, base + height + 0.8, stack.z, [width * 0.78, 1.6, width * 0.78])
  })
  group.add(shadowed(chimneys), shadowed(tops))

  // ── The elevated line: across the north of the quarter, a pier wherever it is off the road ──
  const lineZ = box.minZ - 26
  const from = box.minX - 120
  const to = box.maxX + 120
  const span = to - from
  const deck = new InstancedMesh(cube, standard(worksScene.concrete), 1)
  place(deck, 0, (from + to) / 2, LINE_HEIGHT, lineZ, [span, 1.6, LINE_WIDTH])
  group.add(shadowed(deck))
  const piers: { x: number }[] = []
  for (let x = from; x <= to; x += PIER_EVERY) {
    if (roadClearance(track.road, x, lineZ) > 3) piers.push({ x: x + (rng.float() - 0.5) * 2 })
  }
  const pierMesh = new InstancedMesh(cube, standard(worksScene.concreteDark), piers.length)
  piers.forEach((pier, index) => {
    const base = groundAt(pier.x, lineZ)
    const height = LINE_HEIGHT - base
    place(pierMesh, index, pier.x, base + height / 2, lineZ, [2.2, height, LINE_WIDTH * 0.7])
  })
  group.add(shadowed(pierMesh))

  // ── The loading deck's piers: under both its kerbs wherever it stands above the yard ──
  const deckPiers: { x: number; z: number; y: number; turn: number }[] = []
  for (const fork of track.forks ?? []) {
    fork.path.forEach((point, index) => {
      if (index % 2 !== 0 || (point.y ?? 0) < 1.6) return
      const { dx, dz } = pathDirection(fork.path, index, false)
      const half = point.width / 2 - 0.8
      for (const side of [-1, 1]) {
        const x = point.x - dz * half * side
        const z = point.z + dx * half * side
        // Not where the main road runs under it
        if (roadClearance(track.road, x, z) < -0.5 && (point.y ?? 0) < 1.6) continue
        deckPiers.push({ x, z, y: point.y ?? 0, turn: Math.atan2(dx, dz) })
      }
    })
  }
  const deckPierMesh = new InstancedMesh(cube, standard(worksScene.concreteDark), deckPiers.length)
  deckPiers.forEach((pier, index) => {
    place(deckPierMesh, index, pier.x, pier.y / 2 - 1, pier.z, [1.4, pier.y + 2, 1.4], pier.turn)
  })
  if (deckPiers.length > 0) group.add(shadowed(deckPierMesh))
}
