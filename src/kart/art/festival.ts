// 2026-11-14 (owner: "the scenery too", the polish of the classic kart racers, all of it our own):
// the race-day dressing every track shares, so the world feels like a bright, busy theme park rather
// than an empty field. A big striped arch over the road just past the line; flags and banners on poles
// along both sides; grandstands packed with little spectators at the corners; flower beds by the
// barriers; a Ferris wheel and hot-air balloons drifting in the distance; a far skyline of towers.
// All our own low-poly shapes in kartFestival's colours; no model or image files (docs/ASSETS.md),
// nothing taken from any game. Counts follow the quality's density; each kind is one instanced draw.
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  BoxGeometry,
  TorusGeometry,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance, roadDistances, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection, trackBounds } from '../../../shared/kart/track.ts'
import { kartFestival } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

export interface FestivalOptions {
  /** The ground's height (the harbour's hillside, the campus's hilltop) */
  readonly groundAt: (x: number, z: number) => number
  /** Whether a thing may stand at (x, z): not in the sea or the river, not on a landmark */
  readonly fits: (x: number, z: number) => boolean
}

export interface Festival {
  update(seconds: number): void
}

const pick = <T>(list: readonly T[], at: number): T => list[Math.abs(Math.floor(at)) % list.length]!

export function buildFestival(kit: ArtKit, options: FestivalOptions): Festival {
  const { track, level, group, keep, own, standard, shadowed, place } = kit
  const { groundAt, fits } = options
  const rng = createRng(1114)
  const road = track.road
  const { along } = roadDistances(road)
  const tint = (instances: InstancedMesh, index: number, colour: string) =>
    instances.setColorAt(index, new Color(colour))
  const count = (high: number) => Math.max(1, Math.round(high * level.density))

  // ── The arch over the road, just past the line: striped, like a party balloon arch ──
  const archAt = 4 % road.length
  const archPoint = road[archAt]!
  const archDirection = roadDirection(road, archAt)
  const archHalf = archPoint.width / 2 + 2.5
  const arch = new Group()
  const bands = 14
  for (let band = 0; band < bands; band++) {
    const piece = new Mesh(
      keep(new TorusGeometry(archHalf, 1.25, 8, 6, Math.PI / bands)),
      standard(pick(kartFestival.arch, band)),
    )
    piece.rotation.z = (band / bands) * Math.PI
    arch.add(shadowed(piece))
  }
  // Squashed a little, so it is wide rather than tall
  arch.scale.y = 0.55
  arch.position.set(archPoint.x, 0, archPoint.z)
  // Its local x across the road
  arch.rotation.y = Math.atan2(archDirection.dx, archDirection.dz)
  group.add(arch)

  // ── Flags and banners on poles along both sides, about every 22 m ──
  const flagSpots: { x: number; z: number; turn: number; colour: string; tall: boolean }[] = []
  const flagEvery = level.density < 0.5 ? 44 : 22
  let lastFlag = -Infinity
  road.forEach((point, index) => {
    if (along[index]! - lastFlag < flagEvery) return
    lastFlag = along[index]!
    const { dx, dz } = roadDirection(road, index)
    for (const side of [1, -1]) {
      const offset = point.width / 2 + 1.6
      const x = point.x + side * dz * offset
      const z = point.z - side * dx * offset
      if (roadClearance(road, x, z) < 1 || !fits(x, z)) continue
      flagSpots.push({
        x,
        z,
        // The banner's local x along the road
        turn: Math.atan2(-dz, dx),
        colour: pick(kartFestival.flags, index * 3 + (side > 0 ? 1 : 0)),
        tall: (index / 7) % 2 < 1,
      })
    }
  })
  const flagPoles = new InstancedMesh(
    keep(new CylinderGeometry(0.07, 0.09, 1, 5)),
    standard(kartFestival.pole),
    flagSpots.length,
  )
  // A tall narrow banner, hung from the top of the pole along the road
  const banners = new InstancedMesh(
    keep(new PlaneGeometry(1.1, 1).translate(0.6, -0.5, 0)),
    own(new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide })),
    flagSpots.length,
  )
  flagSpots.forEach((flag, index) => {
    const base = groundAt(flag.x, flag.z)
    const height = flag.tall ? 6.5 : 4.8
    place(flagPoles, index, flag.x, base + height / 2, flag.z, [1, height, 1])
    place(
      banners,
      index,
      flag.x,
      base + height - 0.2,
      flag.z,
      [1, flag.tall ? 3 : 2.2, 1],
      flag.turn,
    )
    tint(banners, index, flag.colour)
  })
  group.add(shadowed(flagPoles), banners)

  // ── Grandstands with crowds, outside the sharpest corners ──
  const standSpots: { x: number; z: number; turn: number }[] = []
  const wanted = level.density < 0.5 ? 2 : 4
  const corners: { index: number; turn: number }[] = []
  road.forEach((_, index) => {
    const a = roadDirection(road, index)
    const b = roadDirection(road, (index + 6) % road.length)
    corners.push({ index, turn: a.dx * b.dz - a.dz * b.dx })
  })
  corners.sort((a, b) => Math.abs(b.turn) - Math.abs(a.turn))
  for (const corner of corners) {
    if (standSpots.length >= wanted) break
    const point = road[corner.index]!
    const { dx, dz } = roadDirection(road, corner.index)
    // On the outside, facing the road
    const side = corner.turn > 0 ? 1 : -1
    const offset = point.width / 2 + 16
    const x = point.x + side * dz * offset
    const z = point.z - side * dx * offset
    if (standSpots.some((stand) => Math.hypot(stand.x - x, stand.z - z) < 120)) continue
    if (roadClearance(road, x, z) < 12 || !fits(x, z) || groundAt(x, z) !== 0) continue
    // Local x along the road, local z back from it: the road's right is (-dz, dx)
    standSpots.push({ x, z, turn: Math.atan2(-dz, dx) + (side > 0 ? Math.PI : 0) })
  }
  const ROWS = 5
  const PER_ROW = Math.round(16 * Math.max(0.5, level.density))
  const STAND_WIDTH = 34
  const steps = new InstancedMesh(
    keep(new BoxGeometry(STAND_WIDTH, 0.7, 1.6)),
    standard(kartFestival.standSeat),
    standSpots.length * ROWS,
  )
  const roofs = new InstancedMesh(
    keep(new BoxGeometry(STAND_WIDTH + 2, 0.35, 9.5)),
    standard(kartFestival.standRoof),
    standSpots.length,
  )
  const bodies = new InstancedMesh(
    keep(new CylinderGeometry(0.28, 0.34, 0.9, 6)),
    standard('#ffffff'),
    standSpots.length * ROWS * PER_ROW,
  )
  const headsMesh = new InstancedMesh(
    keep(new SphereGeometry(0.24, 8, 6)),
    standard(kartFestival.skin),
    standSpots.length * ROWS * PER_ROW,
  )
  const crowd: { x: number; z: number; y: number; phase: number }[] = []
  standSpots.forEach((stand, standIndex) => {
    const cos = Math.cos(stand.turn)
    const sin = Math.sin(stand.turn)
    // Local (u across the stand, w back from the road) into the world
    const at = (u: number, w: number) => ({
      x: stand.x + u * cos + w * sin,
      z: stand.z - u * sin + w * cos,
    })
    for (let row = 0; row < ROWS; row++) {
      const p = at(0, row * 1.6)
      // Solid steps: each row a block from the ground up to its seat
      place(steps, standIndex * ROWS + row, p.x, (row + 1) * 0.35, p.z, [1, row + 1, 1], stand.turn)
      for (let seat = 0; seat < PER_ROW; seat++) {
        const u = -STAND_WIDTH / 2 + 1 + (seat + rng.float() * 0.4) * ((STAND_WIDTH - 2) / PER_ROW)
        const q = at(u, row * 1.6)
        const index = crowd.length
        const y = 0.7 + row * 0.7 + 0.45
        crowd.push({ x: q.x, z: q.z, y, phase: rng.float() * 6.28 })
        place(bodies, index, q.x, y, q.z, [1, 1, 1])
        place(headsMesh, index, q.x, y + 0.7, q.z, [1, 1, 1])
        tint(bodies, index, pick(kartFestival.crowd, rng.float() * 97))
      }
    }
    const top = at(0, 3.2)
    place(roofs, standIndex, top.x, ROWS * 0.7 + 4.2, top.z, [1, 1, 1], stand.turn)
  })
  group.add(shadowed(steps), shadowed(roofs), shadowed(bodies), headsMesh)

  // ── Flower beds by the barriers ──
  const flowers = scatter(road, {
    seed: 1115,
    count: count(260),
    box: (() => {
      const box = trackBounds(track)
      return { minX: box.minX - 30, maxX: box.maxX + 30, minZ: box.minZ - 30, maxZ: box.maxZ + 30 }
    })(),
    clearance: 2.5,
    maxClearance: 12,
    spacing: 3.5,
    fits,
  })
  const blooms = new InstancedMesh(
    keep(new IcosahedronGeometry(0.55, 0)),
    standard('#ffffff'),
    flowers.length,
  )
  const leaves = new InstancedMesh(
    keep(new ConeGeometry(0.9, 0.5, 6)),
    standard(kartFestival.flowerLeaf),
    flowers.length,
  )
  flowers.forEach((spot, index) => {
    const base = groundAt(spot.x, spot.z)
    const size = 0.7 + spot.a * 0.7
    place(leaves, index, spot.x, base + 0.25 * size, spot.z, [size, size, size])
    place(blooms, index, spot.x, base + 0.6 * size, spot.z, [size, size * 0.6, size], spot.b * 6)
    tint(blooms, index, pick(kartFestival.flowers, spot.b * 37))
  })
  group.add(blooms, leaves)

  // ── The theme park beyond: a Ferris wheel, balloons, a skyline ──
  const box = trackBounds(track)
  const centreX = (box.minX + box.maxX) / 2
  const centreZ = (box.minZ + box.maxZ) / 2
  const reach = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2
  // The first place round the track, clear of the road and allowed, for the wheel
  const wheelAt = (() => {
    for (let tries = 0; tries < 24; tries++) {
      const angle = 0.6 + tries * 0.9
      const distance = reach + 90 + (tries % 3) * 40
      const x = centreX + Math.cos(angle) * distance
      const z = centreZ + Math.sin(angle) * distance
      if (roadClearance(road, x, z) > 60 && fits(x, z)) return { x, z, angle }
    }
    return null
  })()
  const wheel = new Group()
  const cabins: Mesh[] = []
  if (wheelAt) {
    const radius = 34
    const rim = new Mesh(keep(new TorusGeometry(radius, 0.8, 6, 40)), standard(kartFestival.wheel))
    const hub = new Mesh(keep(new CylinderGeometry(2, 2, 3, 10)), standard(kartFestival.pole))
    hub.rotation.x = Math.PI / 2
    const spokeGeometry = keep(new BoxGeometry(0.4, radius * 2, 0.4))
    const spokeMaterial = standard(kartFestival.wheel)
    const turning = new Group()
    turning.add(rim, hub)
    for (let spoke = 0; spoke < 8; spoke++) {
      const bar = new Mesh(spokeGeometry, spokeMaterial)
      bar.rotation.z = (spoke / 8) * Math.PI
      turning.add(bar)
    }
    const cabinGeometry = keep(new BoxGeometry(3, 3.4, 3))
    for (let cabin = 0; cabin < 16; cabin++) {
      const box3 = new Mesh(cabinGeometry, standard(pick(kartFestival.cabins, cabin)))
      const angle = (cabin / 16) * Math.PI * 2
      box3.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius - 2, 0)
      turning.add(box3)
      cabins.push(box3)
    }
    turning.position.y = radius + 6
    wheel.add(turning)
    for (const leg of [-1, 1]) {
      const strut = new Mesh(
        keep(new BoxGeometry(1.2, radius + 10, 1.2)),
        standard(kartFestival.pole),
      )
      strut.position.set(leg * 9, (radius + 6) / 2, 0)
      strut.rotation.z = leg * 0.25
      wheel.add(strut)
    }
    wheel.position.set(wheelAt.x, groundAt(wheelAt.x, wheelAt.z), wheelAt.z)
    // Face the track
    wheel.rotation.y = Math.atan2(centreX - wheelAt.x, centreZ - wheelAt.z)
    group.add(wheel)
  }
  const turning = wheel.children[0]

  // Hot-air balloons drifting high up round the track
  const balloonCount = level.density < 0.5 ? 3 : 7
  const balloons: { mesh: Group; x: number; z: number; y: number; drift: number; phase: number }[] =
    []
  for (let index = 0; index < balloonCount; index++) {
    const balloon = new Group()
    const envelope = new Mesh(
      keep(new SphereGeometry(6, 12, 10)),
      standard(pick(kartFestival.balloons, index)),
    )
    envelope.scale.y = 1.2
    const stripe = new Mesh(
      keep(new CylinderGeometry(6.05, 6.05, 2.4, 12, 1, true)),
      own(
        new MeshBasicMaterial({ color: pick(kartFestival.balloons, index + 2), side: DoubleSide }),
      ),
    )
    const basket = new Mesh(keep(new BoxGeometry(2, 1.6, 2)), standard(kartFestival.basket))
    basket.position.y = -9.5
    balloon.add(envelope, stripe, basket)
    const angle = (index / balloonCount) * Math.PI * 2 + 0.4
    const distance = reach * 0.6 + 60 + (index % 3) * 70
    const x = centreX + Math.cos(angle) * distance
    const z = centreZ + Math.sin(angle) * distance
    const y = 60 + (index % 4) * 18
    balloon.position.set(x, y, z)
    group.add(balloon)
    balloons.push({ mesh: balloon, x, z, y, drift: 0.6 + (index % 3) * 0.3, phase: index })
  }

  // A far skyline: towers on the horizon, clear of the sea and the river
  const towers: { x: number; z: number; w: number; h: number }[] = []
  const towerCount = count(70)
  for (let index = 0; index < towerCount * 3 && towers.length < towerCount; index++) {
    const angle = rng.float() * Math.PI * 2
    const distance = reach + 260 + rng.float() * 260
    const x = centreX + Math.cos(angle) * distance
    const z = centreZ + Math.sin(angle) * distance
    if (!fits(x, z) || roadClearance(road, x, z) < 150) continue
    towers.push({ x, z, w: 14 + rng.float() * 18, h: 30 + rng.float() * 90 })
  }
  const towerMesh = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    standard('#ffffff'),
    Math.max(1, towers.length),
  )
  towerMesh.count = towers.length
  towers.forEach((tower, index) => {
    const base = groundAt(tower.x, tower.z)
    place(
      towerMesh,
      index,
      tower.x,
      base + tower.h / 2,
      tower.z,
      [tower.w, tower.h, tower.w],
      index,
    )
    tint(towerMesh, index, pick(kartFestival.skyline, index * 7))
  })
  group.add(towerMesh)

  return {
    update(seconds) {
      if (turning) turning.rotation.z = seconds * 0.08
      // Cabins hang level as the wheel turns
      for (const cabin of cabins) cabin.rotation.z = -seconds * 0.08
      for (const balloon of balloons) {
        const t = seconds * 0.05 * balloon.drift + balloon.phase
        balloon.mesh.position.set(
          balloon.x + Math.sin(t) * 25,
          balloon.y + Math.sin(t * 2.3) * 3,
          balloon.z + Math.cos(t * 0.8) * 25,
        )
      }
    },
  }
}
