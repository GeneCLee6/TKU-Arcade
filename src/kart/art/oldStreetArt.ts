// N2 (e10-t04b): the item track's own scenery, at night. An old riverside street turned night
// market: the river along the promenade, dark under the moon, with lantern light glinting on it and
// a railing along its bank; rows of stalls (canopies, lit counters, bright signboards) down the
// market street, the lantern lane, the old street and the stall island that splits the temple fork;
// strings of red lanterns over the road; red brick shophouses with arcades and lit windows; a temple
// on the square inside the fork; a lit chevron board at each end of the island. All of it our own
// low-poly shapes and canvas-painted textures: no model or image files (docs/ASSETS.md), no real
// shop, sign text or temple copied.
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance } from '../../../shared/kart/scenery.ts'
import { roadDirection, type RoadPoint } from '../../../shared/kart/track.ts'
import {
  ISLAND_INNER,
  ISLAND_OUTER,
  islandOutline,
  islandSpan,
} from '../../../shared/kart/tracks/oldstreet.ts'
import { oldStreetScene } from '../../styles/kartTokens.ts'
import { grain, painted } from './textures.ts'
import type { ArtKit } from './trackArt.ts'

/** The river's east bank, x: the promenade's railing stands just east of it */
export const OLDSTREET_RIVER_EAST = -48
/** The river's far bank, x: the hills beyond are the shared far hills */
const RIVER_WEST = -520
/** The railing along the bank */
const RAIL_X = -30

/** The temple on the square inside the fork: its footprint, kept clear of the road (tests) */
export const OLDSTREET_TEMPLE = { minX: 336, maxX: 376, minZ: -204, maxZ: -168 }

/** Whether (x, z) is in the river, or within `margin` metres of it */
export const inOldStreetRiver = (x: number, _z: number, margin = 0): boolean =>
  x < OLDSTREET_RIVER_EAST + margin && x > RIVER_WEST - margin

/** Where the shared trees may grow: not in the river or on its bank, not on the temple square */
export const oldStreetTreeFits = (x: number, z: number): boolean =>
  x > RAIL_X + 6 &&
  !(
    x > OLDSTREET_TEMPLE.minX - 8 &&
    x < OLDSTREET_TEMPLE.maxX + 8 &&
    z > OLDSTREET_TEMPLE.minZ - 8 &&
    z < OLDSTREET_TEMPLE.maxZ + 8
  )

/** A place beside the road, facing it */
interface Beside {
  readonly x: number
  readonly z: number
  /** The y rotation that turns a thing's front (+z) towards the road */
  readonly turn: number
}

/** The road point nearest (x, z) */
function indexNear(road: readonly RoadPoint[], x: number, z: number): number {
  let best = 0
  let distance = Infinity
  road.forEach((point, index) => {
    const d = (point.x - x) ** 2 + (point.z - z) ** 2
    if (d < distance) {
      distance = d
      best = index
    }
  })
  return best
}

/**
 * Places along one side of the road (+1 right, -1 left, facing along it) from road point `from` to
 * `to`, about every `every` metres, `setback` metres beyond the kerb, each facing the road
 */
function besideRoad(
  road: readonly RoadPoint[],
  from: number,
  to: number,
  side: 1 | -1,
  every: number,
  setback: number,
): Beside[] {
  const out: Beside[] = []
  let travelled = every
  const count = (to - from + road.length) % road.length
  for (let step = 0; step <= count; step++) {
    const index = (from + step) % road.length
    const point = road[index]!
    const next = road[(index + 1) % road.length]!
    travelled += Math.hypot(next.x - point.x, next.z - point.z)
    if (travelled < every) continue
    travelled = 0
    const { dx, dz } = roadDirection(road, index)
    const offset = side * (point.width / 2 + setback)
    // The road's right, facing along it, is (-dz, dx); the front faces back across to the road
    const x = point.x - dz * offset
    const z = point.z + dx * offset
    out.push({ x, z, turn: Math.atan2(dz * side, -dx * side) })
  }
  return out
}

export function buildOldStreet(kit: ArtKit): { update(seconds: number): void } {
  const { track, level, group, textures, keep, own, ownTexture, shadowed } = kit
  const road = track.road
  const rng = createRng(61)
  const random = () => rng.float()
  const dummy = new Object3D()
  const setMatrix = (
    instances: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number],
    turn = 0,
  ) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, turn, 0)
    dummy.scale.set(...scale)
    dummy.updateMatrix()
    instances.setMatrixAt(index, dummy.matrix)
  }
  const lambert = (color: string) => own(new MeshLambertMaterial({ color, flatShading: true }))
  const basic = (color: string) => own(new MeshBasicMaterial({ color }))
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!
  const at = (x: number, z: number) => indexNear(road, x, z)
  /** Keeps every other place at low density, two in three at medium */
  const thin = <T>(places: T[]): T[] =>
    level.density >= 0.9
      ? places
      : places.filter((_, index) => (level.density >= 0.5 ? index % 3 !== 2 : index % 2 === 0))

  // ── Textures of its own, painted at load ──
  const paving = ownTexture(
    painted(
      256,
      62,
      (context, size, rand) => {
        context.fillStyle = oldStreetScene.paving
        context.fillRect(0, 0, size, size)
        grain(context, size, rand, 4000, 0.12)
        context.fillStyle = oldStreetScene.pavingJoint
        const cell = size / 8
        for (let row = 0; row < 8; row++) {
          context.fillRect(0, row * cell, size, 2)
          const shift = row % 2 === 0 ? 0 : cell / 2
          for (let column = 0; column <= 8; column++) {
            context.fillRect(column * cell + shift, row * cell, 2, cell)
          }
        }
      },
      level.anisotropy,
    ),
  )
  // A shophouse front: an arcade at street level, two floors of windows, some of them lit
  const lit: boolean[] = []
  for (let index = 0; index < 6; index++) lit.push(random() < 0.6)
  const front = (context: CanvasRenderingContext2D, size: number, glow: boolean) => {
    context.fillStyle = glow ? oldStreetScene.unlit : oldStreetScene.facade
    context.fillRect(0, 0, size, size)
    // The arcade: three arches across the bottom third, lit from within
    const arch = size / 3
    for (let column = 0; column < 3; column++) {
      context.fillStyle = glow ? oldStreetScene.windowLit : oldStreetScene.arcade
      const x = column * arch + arch * 0.14
      context.fillRect(x, size * 0.7, arch * 0.72, size * 0.3)
      context.beginPath()
      context.arc(x + arch * 0.36, size * 0.7, arch * 0.36, Math.PI, 0)
      context.fill()
    }
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) {
        const on = lit[row * 3 + column]!
        context.fillStyle = glow
          ? on
            ? oldStreetScene.windowLit
            : oldStreetScene.unlit
          : on
            ? oldStreetScene.windowLit
            : oldStreetScene.window
        context.fillRect(
          column * arch + arch * 0.3,
          size * (0.1 + row * 0.27),
          arch * 0.4,
          size * 0.17,
        )
      }
    }
  }
  const facade = ownTexture(painted(128, 63, (context, size) => front(context, size, false), 1))
  const facadeGlow = ownTexture(painted(128, 63, (context, size) => front(context, size, true), 1))
  // Lantern light glinting on the water: short warm dashes
  const glints = ownTexture(
    painted(
      128,
      64,
      (context, size, rand) => {
        context.clearRect(0, 0, size, size)
        for (let index = 0; index < 220; index++) {
          context.fillStyle = `rgba(255,214,150,${0.25 + rand() * 0.6})`
          context.fillRect(rand() * size, rand() * size, 2 + rand() * 8, 1 + rand())
        }
      },
      1,
    ),
  )

  // ── The ground: stone paving over the land the market stands on ──
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of road) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  const pavedWest = OLDSTREET_RIVER_EAST
  const pavedEast = maxX + 120
  const pavedNorth = minZ - 120
  const pavedSouth = maxZ + 120
  const paved = new Mesh(
    keep(new PlaneGeometry(pavedEast - pavedWest, pavedSouth - pavedNorth)),
    own(
      new MeshLambertMaterial({
        map: paving,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
      }),
    ),
  )
  paving.repeat.set((pavedEast - pavedWest) / 16, (pavedSouth - pavedNorth) / 16)
  paved.rotation.x = -Math.PI / 2
  paved.position.set((pavedWest + pavedEast) / 2, 0.02, (pavedNorth + pavedSouth) / 2)
  group.add(shadowed(paved, false))

  // ── The river, its bank and railing, the light on the water ──
  const riverLength = pavedSouth - pavedNorth + 1600
  const riverMiddle = (pavedNorth + pavedSouth) / 2
  const water = textures.water.clone()
  ownTexture(water)
  water.repeat.set((OLDSTREET_RIVER_EAST - RIVER_WEST) / 14, riverLength / 14)
  const river = new Mesh(
    keep(new PlaneGeometry(OLDSTREET_RIVER_EAST - RIVER_WEST, riverLength)),
    own(new MeshLambertMaterial({ map: water, color: oldStreetScene.river })),
  )
  river.rotation.x = -Math.PI / 2
  river.position.set((OLDSTREET_RIVER_EAST + RIVER_WEST) / 2, -0.6, riverMiddle)
  group.add(river)
  const glint = new Mesh(
    keep(new PlaneGeometry(70, riverLength)),
    own(
      new MeshBasicMaterial({
        map: glints,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
  )
  glints.repeat.set(2, riverLength / 60)
  glint.rotation.x = -Math.PI / 2
  glint.position.set(OLDSTREET_RIVER_EAST - 40, -0.5, riverMiddle)
  group.add(glint)
  // The embankment: a stone edge between the paving and the water
  const bank = new Mesh(
    keep(new BoxGeometry(3, 1.4, riverLength)),
    lambert(oldStreetScene.templeStone),
  )
  bank.position.set(OLDSTREET_RIVER_EAST + 1.5, -0.1, riverMiddle)
  group.add(shadowed(bank, false))
  const railLength = pavedSouth - pavedNorth
  const rail = new Mesh(keep(new BoxGeometry(0.2, 0.15, railLength)), lambert(oldStreetScene.rail))
  rail.position.set(RAIL_X, 1.1, riverMiddle)
  group.add(rail)
  const posts = Math.floor(railLength / 4)
  const railPosts = new InstancedMesh(
    keep(new BoxGeometry(0.18, 1.1, 0.18)),
    lambert(oldStreetScene.rail),
    posts,
  )
  for (let index = 0; index < posts; index++) {
    setMatrix(railPosts, index, RAIL_X, 0.55, pavedNorth + index * 4, [1, 1, 1])
  }
  group.add(railPosts)

  // ── Stalls: a counter, a striped canopy on posts, a lit signboard, goods on the counter ──
  const stalls: Beside[] = []
  const bothSides = (fromX: number, fromZ: number, toX: number, toZ: number, sides: (1 | -1)[]) => {
    for (const side of sides) {
      stalls.push(...besideRoad(road, at(fromX, fromZ), at(toX, toZ), side, 7, 4))
    }
  }
  // The market street, both sides
  bothSides(64, -284, 292, -290, [1, -1])
  // The lantern lane, both sides
  bothSides(292, -84, 170, -86, [1, -1])
  // The old street home: both sides; the shophouse row: its south side
  bothSides(326, 310, 70, 312, [1, -1])
  bothSides(180, 222, 320, 222, [1])
  // The island: one row down its middle, facing the outside (safe) lane
  const { first, last } = islandSpan(road)
  const middle = (ISLAND_INNER + ISLAND_OUTER) / 2
  for (let index = first + 1; index < last; index++) {
    const point = road[index]!
    const { dx, dz } = roadDirection(road, index)
    stalls.push({
      x: point.x - dz * middle,
      z: point.z + dx * middle,
      // Its front towards the road's left, where the outside lane is
      turn: Math.atan2(dz, -dx),
    })
  }
  const kept = thin(stalls).filter(
    // Not over another road (the market street's stalls near the fork, the lanes near the corners)
    (stall, index, all) =>
      all.findIndex((other) => Math.hypot(other.x - stall.x, other.z - stall.z) < 4.5) === index,
  )
  const onIsland = (stall: Beside) => roadClearance(road, stall.x, stall.z) < 0
  const fits = kept.filter((stall) => onIsland(stall) || roadClearance(road, stall.x, stall.z) > 1)
  const counters = new InstancedMesh(
    keep(new BoxGeometry(4.2, 1.1, 1.6)),
    lambert(oldStreetScene.counter),
    fits.length,
  )
  const counterLights = new InstancedMesh(
    keep(new BoxGeometry(4.2, 0.12, 0.1)),
    basic(oldStreetScene.counterLight),
    fits.length,
  )
  const canopies = new InstancedMesh(
    keep(new BoxGeometry(4.8, 0.22, 3.2)),
    own(new MeshLambertMaterial({ color: '#ffffff' })),
    fits.length,
  )
  const canopyPosts = new InstancedMesh(
    keep(new CylinderGeometry(0.07, 0.07, 2.9, 5)),
    lambert(oldStreetScene.pole),
    fits.length * 2,
  )
  const signMaterial = own(new MeshBasicMaterial({ color: '#ffffff' }))
  const signs = new InstancedMesh(keep(new BoxGeometry(3.4, 0.75, 0.12)), signMaterial, fits.length)
  const goods = new InstancedMesh(
    keep(new BoxGeometry(0.7, 0.35, 0.5)),
    own(new MeshLambertMaterial({ color: '#ffffff' })),
    fits.length * 3,
  )
  const offsetBy = (stall: Beside, forward: number, across: number) => ({
    // The stall's front faces +z turned by `turn`
    x: stall.x + Math.sin(stall.turn) * forward + Math.cos(stall.turn) * across,
    z: stall.z + Math.cos(stall.turn) * forward - Math.sin(stall.turn) * across,
  })
  fits.forEach((stall, index) => {
    const front = offsetBy(stall, 0.6, 0)
    setMatrix(counters, index, front.x, 0.55, front.z, [1, 1, 1], stall.turn)
    const lip = offsetBy(stall, 1.42, 0)
    setMatrix(counterLights, index, lip.x, 1.0, lip.z, [1, 1, 1], stall.turn)
    setMatrix(canopies, index, stall.x, 2.95, stall.z, [1, 1, 1], stall.turn)
    canopies.setColorAt(index, new Color(pick(oldStreetScene.canopies)))
    for (const end of [-1, 1]) {
      const post = offsetBy(stall, 1.4, end * 2.2)
      setMatrix(canopyPosts, index * 2 + (end + 1) / 2, post.x, 1.45, post.z, [1, 1, 1])
    }
    const sign = offsetBy(stall, 1.62, 0)
    setMatrix(signs, index, sign.x, 3.5, sign.z, [1, 1, 1], stall.turn)
    signs.setColorAt(index, new Color(pick(oldStreetScene.signs)))
    for (let item = 0; item < 3; item++) {
      const spot = offsetBy(stall, 0.5, (item - 1) * 1.2)
      setMatrix(goods, index * 3 + item, spot.x, 1.28, spot.z, [1, 1, 1], stall.turn)
      goods.setColorAt(index * 3 + item, new Color(pick(oldStreetScene.goods)))
    }
  })
  group.add(shadowed(counters), counterLights, shadowed(canopies), canopyPosts, signs, goods)

  // ── Lanterns: strings over the market street and the old street, and on posts elsewhere ──
  interface Lantern {
    x: number
    y: number
    z: number
  }
  const lanterns: Lantern[] = []
  const poles: Beside[] = []
  const wires: { x: number; z: number; length: number; turn: number }[] = []
  const strings = (fromX: number, fromZ: number, toX: number, toZ: number) => {
    const left = besideRoad(road, at(fromX, fromZ), at(toX, toZ), -1, 18, 1.6)
    const right = besideRoad(road, at(fromX, fromZ), at(toX, toZ), 1, 18, 1.6)
    left.forEach((a, index) => {
      const b = right[index]
      if (!b) return
      poles.push(a, b)
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      wires.push({
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        length,
        turn: -Math.atan2(b.z - a.z, b.x - a.x),
      })
      const hanging = Math.max(3, Math.round(length / 6))
      for (let step = 1; step < hanging; step++) {
        const t = step / hanging
        // A gentle sag, the lowest still high over the karts
        lanterns.push({
          x: a.x + (b.x - a.x) * t,
          y: 9.4 - Math.sin(t * Math.PI) * 1.4,
          z: a.z + (b.z - a.z) * t,
        })
      }
    })
  }
  strings(64, -284, 292, -290)
  strings(326, 310, 70, 312)
  // Posts along the promenade's river side, and at both ends of the island
  for (const post of besideRoad(road, at(0, 250), at(0, -180), -1, 16, 2.2)) {
    poles.push(post)
    lanterns.push({ x: post.x, y: 4.6, z: post.z })
  }
  const keptLanterns = thin(lanterns)
  const lanternBodies = new InstancedMesh(
    keep(new SphereGeometry(0.55, 10, 8)),
    basic(oldStreetScene.lantern),
    keptLanterns.length,
  )
  const lanternCaps = new InstancedMesh(
    keep(new CylinderGeometry(0.28, 0.28, 0.2, 8)),
    lambert(oldStreetScene.lanternCap),
    keptLanterns.length * 2,
  )
  keptLanterns.forEach((lantern, index) => {
    setMatrix(lanternBodies, index, lantern.x, lantern.y, lantern.z, [1, 1.3, 1])
    setMatrix(lanternCaps, index * 2, lantern.x, lantern.y + 0.75, lantern.z, [1, 1, 1])
    setMatrix(lanternCaps, index * 2 + 1, lantern.x, lantern.y - 0.75, lantern.z, [1, 1, 1])
  })
  const polesMesh = new InstancedMesh(
    keep(new CylinderGeometry(0.14, 0.18, 10, 6)),
    lambert(oldStreetScene.pole),
    poles.length,
  )
  poles.forEach((pole, index) => setMatrix(polesMesh, index, pole.x, 5, pole.z, [1, 1, 1]))
  const wireMesh = new InstancedMesh(
    keep(new BoxGeometry(1, 0.05, 0.05)),
    lambert(oldStreetScene.pole),
    wires.length,
  )
  wires.forEach((wire, index) =>
    setMatrix(wireMesh, index, wire.x, 9.9, wire.z, [wire.length, 1, 1], wire.turn),
  )
  group.add(lanternBodies, lanternCaps, shadowed(polesMesh), wireMesh)

  // ── The island's two ends: a lit chevron board on a post, pointing either way ──
  const outline = islandOutline(road)
  const noses = [outline[0]!, outline[last - first + 2]!]
  const chevronMaterial = basic(oldStreetScene.chevron)
  for (const [index, nose] of noses.entries()) {
    const roadIndex = index === 0 ? first : last
    const { dx, dz } = roadDirection(road, roadIndex)
    const board = new Mesh(keep(new BoxGeometry(5, 1.2, 0.2)), chevronMaterial)
    // Back from the tip, inside the island, facing the karts coming at it
    const back = index === 0 ? 3 : -3
    board.position.set(nose.x + dx * back, 1.7, nose.z + dz * back)
    board.rotation.y = Math.atan2(dx, dz)
    group.add(board)
  }

  // ── Shophouses: red brick, an arcade below and lit windows above, in rows behind the stalls ──
  const houses: (Beside & { width: number; height: number })[] = []
  const row = (fromX: number, fromZ: number, toX: number, toZ: number, side: 1 | -1) => {
    for (const place of besideRoad(road, at(fromX, fromZ), at(toX, toZ), side, 9, 16)) {
      houses.push({ ...place, width: 8.4, height: 9 + Math.floor(random() * 3) * 3 })
    }
  }
  row(64, -284, 292, -290, -1)
  row(326, 310, 70, 312, -1)
  row(130, 205, 320, 222, -1)
  row(230, -86, 170, -86, -1)
  const standing = thin(houses).filter(
    (house) => roadClearance(road, house.x, house.z) > 9 && house.x > RAIL_X + 10,
  )
  const bodies = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    own(
      new MeshLambertMaterial({
        map: facade,
        emissive: '#ffffff',
        emissiveMap: facadeGlow,
        emissiveIntensity: 0.9,
      }),
    ),
    standing.length,
  )
  const roofs = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    lambert(oldStreetScene.shopRoof),
    standing.length,
  )
  standing.forEach((house, index) => {
    setMatrix(
      bodies,
      index,
      house.x,
      house.height / 2,
      house.z,
      [house.width, house.height, 12],
      house.turn,
    )
    bodies.setColorAt(index, new Color(pick(oldStreetScene.shopWalls)))
    setMatrix(
      roofs,
      index,
      house.x,
      house.height + 0.4,
      house.z,
      [house.width + 0.4, 0.8, 12.4],
      house.turn,
    )
  })
  group.add(shadowed(bodies), shadowed(roofs))

  // ── The temple on the fork's square: a stone platform, red columns and walls, two tiers of
  // orange roof, a censer and lanterns in front ──
  const temple = new Group()
  const width = OLDSTREET_TEMPLE.maxX - OLDSTREET_TEMPLE.minX
  const depth = OLDSTREET_TEMPLE.maxZ - OLDSTREET_TEMPLE.minZ
  const platform = new Mesh(
    keep(new BoxGeometry(width, 1.2, depth)),
    lambert(oldStreetScene.templeStone),
  )
  platform.position.y = 0.6
  const hall = new Mesh(
    keep(new BoxGeometry(width - 12, 7, depth - 14)),
    lambert(oldStreetScene.templeWall),
  )
  hall.position.set(0, 4.7, -2)
  temple.add(shadowed(platform), shadowed(hall))
  const columns = new InstancedMesh(
    keep(new CylinderGeometry(0.45, 0.45, 7, 8)),
    lambert(oldStreetScene.templeColumn),
    6,
  )
  for (let index = 0; index < 6; index++) {
    setMatrix(
      columns,
      index,
      -width / 2 + 6 + index * ((width - 12) / 5),
      4.7,
      depth / 2 - 4.5,
      [1, 1, 1],
    )
  }
  temple.add(shadowed(columns))
  // Two hipped roofs: four-sided cones, flattened, the upper one smaller
  for (const [tier, size] of [
    [0, 1],
    [1, 0.6],
  ] as const) {
    const roof = new Mesh(keep(new ConeGeometry(1, 1, 4)), lambert(oldStreetScene.templeRoof))
    roof.rotation.y = Math.PI / 4
    roof.scale.set((width - 4) * 0.72 * size, 4.5, (depth - 4) * 0.72 * size)
    roof.position.set(0, 10.3 + tier * 4.6, -2)
    const ridge = new Mesh(keep(new BoxGeometry(1, 0.5, 0.5)), lambert(oldStreetScene.templeRidge))
    ridge.scale.set((width - 10) * size, 1, 1)
    ridge.position.set(0, 12.7 + tier * 4.6, -2)
    temple.add(shadowed(roof), ridge)
  }
  const censer = new Mesh(
    keep(new CylinderGeometry(1.4, 1.1, 1.8, 8)),
    lambert(oldStreetScene.censer),
  )
  censer.position.set(0, 2.1, depth / 2 + 4)
  temple.add(shadowed(censer))
  for (const side of [-1, 1]) {
    const post = new Mesh(
      keep(new CylinderGeometry(0.15, 0.15, 4, 6)),
      lambert(oldStreetScene.pole),
    )
    post.position.set(side * 7, 2, depth / 2 + 4)
    const light = new Mesh(keep(new SphereGeometry(0.8, 10, 8)), basic(oldStreetScene.lantern))
    light.scale.set(1, 1.3, 1)
    light.position.set(side * 7, 4.4, depth / 2 + 4)
    temple.add(post, light)
  }
  temple.position.set(
    (OLDSTREET_TEMPLE.minX + OLDSTREET_TEMPLE.maxX) / 2,
    0,
    (OLDSTREET_TEMPLE.minZ + OLDSTREET_TEMPLE.maxZ) / 2,
  )
  // Its front (+z) towards the fork's mouth, to the west
  temple.rotation.y = -Math.PI / 2
  group.add(temple)

  for (const instances of [canopies, signs, goods, bodies]) {
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true
  }

  const signColour = new Color('#ffffff')
  return {
    update(seconds) {
      water.offset.set(seconds * 0.01, seconds * 0.03)
      glints.offset.set(0, seconds * 0.02)
      // The signboards hum: a slow, slight flicker of their brightness
      const hum = 0.88 + 0.12 * Math.sin(seconds * 3.1) * Math.sin(seconds * 1.7 + 1)
      signMaterial.color.copy(signColour).multiplyScalar(hum)
    },
  }
}
