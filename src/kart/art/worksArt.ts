// 2026-11-20: the Viaduct Works' own scenery (shared/kart/tracks/works.ts; docs/KART-WORLD.md):
// a riverside factory quarter under an elevated line. Factory sheds, brick chimneys, the elevated
// line itself striding across the north of the quarter on its piers, and concrete piers under the
// loading deck where it stands above the yard. Our own simple shapes, placed from the track so that
// nothing stands on any road (scenery.ts counts the branches as road): no model or image files, no
// real building copied. Seeded: the same track, the same quarter.
// 2026-11-20, dressed (owner: "more lifelike, cooler"; docs/KART-WORLD.md §6.3): the sheds under
// sawtooth roofs with their north lights; the foundry in the yard the deck crosses, its stacks
// steaming; pipe racks along the longest straight; a conveyor climbing to a shed's roof; railings
// with warning stripes along the raised deck. The alley's walls and the shed side at the cut are
// skillWalls.ts's.
import {
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { roadClearance, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection, trackBounds } from '../../../shared/kart/track.ts'
import { worksScene } from '../../styles/kartTokens.ts'
import { addBatch, Batch, corrugatedTexture, hazardTexture, type Point3 } from './skillKit.ts'
import type { ArtKit } from './trackArt.ts'

/** The elevated line's deck: this high, this wide, a pier every this many metres */
const LINE_HEIGHT = 14
const LINE_WIDTH = 9
const PIER_EVERY = 36

export function buildWorks(
  kit: ArtKit,
  groundAt: (x: number, z: number) => number,
): { update(seconds: number): void } {
  const { track, level, group, keep, own, standard, shadowed, place } = kit
  const box = trackBounds(track)
  const rng = createRng(2011)
  const reach = {
    minX: box.minX - 90,
    maxX: box.maxX + 90,
    minZ: box.minZ - 30,
    maxZ: box.maxZ + 90,
  }
  const metal = new Batch()
  const solid = new Batch()
  const stripes = new Batch()

  // ── The foundry: in the open yard the loading deck crosses, the biggest room off every road ──
  let foundry: { x: number; z: number; size: number } | null = null
  const deck = (track.forks ?? []).find((fork) => fork.path.some((point) => (point.y ?? 0) >= 3))
  if (deck) {
    const points = track.road.slice(deck.from, deck.to + 1)
    const xs = points.map((point) => point.x)
    const zs = points.map((point) => point.z)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 6) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 6) {
        const clear = roadClearance(track.road, x, z)
        if (clear > 14 && (!foundry || clear > foundry.size)) foundry = { x, z, size: clear }
      }
    }
  }

  // ── Sheds: a body, a sawtooth roof of north lights, turned square to the nearest road ──
  const sheds = scatter(track.road, {
    seed: 2012,
    count: Math.round(46 * level.density),
    box: reach,
    clearance: 14,
    spacing: 34,
    maxClearance: 90,
    fits: (x, z) =>
      !foundry || Math.hypot(foundry.x - x, foundry.z - z) > Math.min(48, foundry.size * 1.2) * 0.6 + 18,
  })
  let conveyorDone = false
  sheds.forEach((shed, index) => {
    const width = 14 + shed.a * 16
    const depth = 10 + shed.b * 12
    const height = 6 + shed.a * 5
    const turn = Math.round(shed.b * 4) * (Math.PI / 2) + (shed.a > 0.5 ? 0.3 : 0)
    const base = groundAt(shed.x, shed.z)
    const wall = worksScene.shedWalls[index % worksScene.shedWalls.length]!
    metal.box({ x: shed.x, y: base + height / 2, z: shed.z }, [width, height, depth], turn, wall, 4)
    // Teeth across the depth: each a slope up to a glazed upright face
    const teeth = Math.max(2, Math.round(depth / 5))
    const tooth = depth / teeth
    const rise = 2.2
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    for (let k = 0; k < teeth; k++) {
      const across = -depth / 2 + tooth * (k + 0.5)
      const centre = { x: shed.x + s * across, y: base + height, z: shed.z + c * across }
      // In the prism's own axes: x across the shed (its -x the shed's +across), y up, along it
      solid.prism(
        centre,
        [
          [-tooth / 2, 0],
          [tooth / 2, 0],
          [tooth / 2, rise],
        ],
        width,
        turn + Math.PI / 2,
        worksScene.shedRoof,
      )
      solid.box(
        {
          x: centre.x - s * (tooth / 2 - 0.08),
          y: base + height + rise / 2,
          z: centre.z - c * (tooth / 2 - 0.08),
        },
        [width - 0.6, rise - 0.5, 0.12],
        turn,
        worksScene.glazing,
      )
    }
    // A conveyor up to the roof of the first shed with room beside it
    if (!conveyorDone) {
      const out = depth / 2 + 16
      const foot = { x: shed.x + s * out, z: shed.z + c * out }
      if (roadClearance(track.road, foot.x, foot.z) > 6) {
        conveyorDone = true
        const top: Point3 = {
          x: shed.x + s * (depth / 2 - 1),
          y: base + height + 1.2,
          z: shed.z + c * (depth / 2 - 1),
        }
        const bottom: Point3 = { x: foot.x, y: groundAt(foot.x, foot.z) + 1, z: foot.z }
        for (const side of [-0.7, 0.7]) {
          const ox = c * side
          const oz = -s * side
          solid.tube(
            { x: bottom.x + ox, y: bottom.y, z: bottom.z + oz },
            { x: top.x + ox, y: top.y, z: top.z + oz },
            0.18,
            worksScene.conveyor,
            4,
          )
        }
        solid.tube(bottom, top, 0.55, worksScene.belt, 6)
        for (let leg = 1; leg < 4; leg++) {
          const t = leg / 4
          const at = { x: bottom.x + (top.x - bottom.x) * t, z: bottom.z + (top.z - bottom.z) * t }
          const y = bottom.y + (top.y - bottom.y) * t
          solid.tube({ ...at, y: groundAt(at.x, at.z) }, { ...at, y: y - 0.4 }, 0.15, worksScene.rack, 4)
        }
        // A hopper at the foot
        solid.box({ x: bottom.x, y: bottom.y + 0.4, z: bottom.z }, [3, 2.4, 3], turn, worksScene.conveyor)
      }
    }
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
  const chimneyTops: Point3[] = []
  const chimneys = new InstancedMesh(stackGeometry, standard(worksScene.chimney), stacks.length + 3)
  const tops = new InstancedMesh(stackGeometry, standard(worksScene.chimneyTop), stacks.length + 3)
  let chimneyCount = 0
  const chimney = (x: number, z: number, height: number, width: number) => {
    const base = groundAt(x, z)
    place(chimneys, chimneyCount, x, base + height / 2, z, [width, height, width])
    place(tops, chimneyCount, x, base + height + 0.8, z, [width * 0.78, 1.6, width * 0.78])
    chimneyCount++
    chimneyTops.push({ x, y: base + height + 1.6, z })
  }
  stacks.forEach((stack) => chimney(stack.x, stack.z, 24 + stack.a * 16, 2.4 + stack.b))

  // ── The foundry's hall, its glowing doorways, three stacks behind it ──
  if (foundry) {
    const size = Math.min(48, foundry.size * 1.2)
    const { x, z } = foundry
    const base = groundAt(x, z)
    metal.box({ x, y: base + 8, z }, [size, 16, size * 0.6], 0, worksScene.foundry, 4)
    solid.prism(
      { x, y: base + 16, z },
      [
        [-size * 0.3 - 0.8, 0],
        [size * 0.3 + 0.8, 0],
        [0, 5],
      ],
      size + 1,
      Math.PI / 2,
      worksScene.shedRoof,
    )
    // A lantern roof along the ridge, glazed
    solid.box({ x, y: base + 21.6, z }, [size * 0.7, 2.2, 3], 0, worksScene.glazing)
    const glow = own(new MeshBasicMaterial({ color: worksScene.foundryGlow }))
    const doorway = keep(new BoxGeometry(7, 7, 0.2))
    for (const side of [-1, 1]) {
      const door = new Mesh(doorway, glow)
      door.position.set(x, base + 3.5, z + side * (size * 0.3 + 0.12))
      group.add(door)
    }
    for (let k = 0; k < 3; k++) chimney(x + (k - 1) * size * 0.3, z - size * 0.3 - 4, 30 + k * 4, 2.6)
  }
  chimneys.count = chimneyCount
  tops.count = chimneyCount
  group.add(shadowed(chimneys), shadowed(tops))

  // Steam: puffs rising from the last three stacks (the foundry's, if there is one)
  const puffGeometry = keep(new IcosahedronGeometry(1, 1))
  const puffs: { mesh: Mesh; material: MeshBasicMaterial; from: Point3; phase: number }[] = []
  chimneyTops.slice(-3).forEach((from, at) => {
    for (let index = 0; index < 4; index++) {
      const material = own(
        new MeshBasicMaterial({
          color: worksScene.steam,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      )
      const mesh = new Mesh(puffGeometry, material)
      group.add(mesh)
      puffs.push({ mesh, material, from, phase: index / 4 + at * 0.13 })
    }
  })

  // ── The elevated line: across the north of the quarter, a pier wherever it is off the road ──
  const lineZ = box.minZ - 26
  const from = box.minX - 120
  const to = box.maxX + 120
  const span = to - from
  const cube = keep(new BoxGeometry(1, 1, 1))
  const lineDeck = new InstancedMesh(cube, standard(worksScene.concrete), 1)
  place(lineDeck, 0, (from + to) / 2, LINE_HEIGHT, lineZ, [span, 1.6, LINE_WIDTH])
  group.add(shadowed(lineDeck))
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

  // ── The loading deck's piers, and railings with warning stripes along both its kerbs ──
  const deckPiers: { x: number; z: number; y: number; turn: number }[] = []
  for (const fork of track.forks ?? []) {
    fork.path.forEach((point, index) => {
      if ((point.y ?? 0) < 1.6) return
      const { dx, dz } = pathDirection(fork.path, index, false)
      const half = point.width / 2 - 0.8
      const next = fork.path[index + 1]
      for (const side of [-1, 1]) {
        const x = point.x - dz * half * side
        const z = point.z + dx * half * side
        if (index % 2 === 0) deckPiers.push({ x, z, y: point.y ?? 0, turn: Math.atan2(dx, dz) })
        // The railing, just outside the kerb's barrier: a kick plate striped yellow and black, a
        // top rail on posts
        if (!next || (next.y ?? 0) < 1.6) continue
        const nd = pathDirection(fork.path, index + 1, false)
        const out = point.width / 2 + 0.6
        const nextOut = next.width / 2 + 0.6
        const a = { x: point.x - dz * out * side, y: point.y ?? 0, z: point.z + dx * out * side }
        const b = {
          x: next.x - nd.dz * nextOut * side,
          y: next.y ?? 0,
          z: next.z + nd.dx * nextOut * side,
        }
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.35, z: (a.z + b.z) / 2 }
        stripes.box(mid, [length + 0.1, 0.7, 0.12], -Math.atan2(b.z - a.z, b.x - a.x), '#ffffff', 1)
        solid.tube({ ...a, y: a.y + 1.6 }, { ...b, y: b.y + 1.6 }, 0.07, worksScene.rack, 5)
        solid.tube(a, { ...a, y: a.y + 1.6 }, 0.06, worksScene.rack, 4)
      }
    })
  }
  const deckPierMesh = new InstancedMesh(cube, standard(worksScene.concreteDark), deckPiers.length)
  deckPiers.forEach((pier, index) => {
    place(deckPierMesh, index, pier.x, pier.y / 2 - 1, pier.z, [1.4, pier.y + 2, 1.4], pier.turn)
  })
  if (deckPiers.length > 0) group.add(shadowed(deckPierMesh))

  // ── Pipe racks along the longest straight, on its outside: three pipes on T-shaped stands ──
  let longest = { from: 0, length: 0 }
  let runFrom = 0
  for (let index = 1; index <= track.road.length; index++) {
    const a = roadDirection(track.road, index - 1)
    const b = roadDirection(track.road, index % track.road.length)
    if (index < track.road.length && a.dx * b.dx + a.dz * b.dz > 0.9995) continue
    if (index - runFrom > longest.length) longest = { from: runFrom, length: index - runFrom }
    runFrom = index
  }
  if (longest.length > 6) {
    const first = track.road[longest.from + 1]!
    const last = track.road[longest.from + longest.length - 1]!
    const { dx, dz } = roadDirection(track.road, longest.from + 1)
    for (const side of [1, -1]) {
      const out = first.width / 2 + 7
      const a = { x: first.x - dz * out * side, z: first.z + dx * out * side }
      const b = { x: last.x - dz * out * side, z: last.z + dx * out * side }
      if (roadClearance(track.road, a.x, a.z) < 4 || roadClearance(track.road, b.x, b.z) < 4) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const stands = Math.max(2, Math.round(length / 9))
      const turn = Math.atan2(dx, dz)
      for (let k = 0; k <= stands; k++) {
        const t = k / stands
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        const base = groundAt(x, z)
        solid.box({ x, y: base + 2.5, z }, [0.4, 5, 0.4], turn, worksScene.rack)
        solid.box({ x, y: base + 5, z }, [3.6, 0.35, 0.4], turn, worksScene.rack)
      }
      worksScene.pipes.forEach((hex, k) => {
        const offset = (k - 1) * 1.1
        const ox = -dz * offset
        const oz = dx * offset
        const y = groundAt(a.x, a.z) + 5.55 + (k === 1 ? 0.2 : 0)
        solid.tube(
          { x: a.x + ox, y, z: a.z + oz },
          { x: b.x + ox, y, z: b.z + oz },
          k === 1 ? 0.5 : 0.34,
          hex,
          8,
        )
      })
      break
    }
  }

  addBatch(kit, metal, { map: corrugatedTexture(kit) })
  addBatch(kit, solid)
  addBatch(kit, stripes, { map: hazardTexture(kit), cast: false })

  const drift = (seconds: number) => {
    for (const one of puffs) {
      const t = (seconds * 0.12 + one.phase) % 1
      one.mesh.position.set(one.from.x + t * 6, one.from.y + 1 + t * 16, one.from.z + t * 2)
      one.mesh.scale.setScalar(1.4 + t * 5)
      one.material.opacity = 0.4 * (1 - t)
    }
  }
  drift(0)
  return { update: drift }
}
