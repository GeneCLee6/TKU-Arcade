// N1 (e10-t03): the harbour track's own scenery, at sunset. A sea beyond a concrete quay, two
// breakwaters with tetrapods and harbour lights (a red and white lighthouse whose beams turn, a
// small green light opposite), fishing boats bobbing at their moorings, a container crane and a
// cargo ship, sheds and container stacks in the infield, palms along the quay, red lanterns along the
// switchbacks, and a hillside town of flat-roofed houses with water tanks and lit windows. All of it
// our own low-poly shapes and canvas-painted textures: no model or image files (docs/ASSETS.md).
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  type Material,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection } from '../../../shared/kart/track.ts'
import { harbourScene, kartScene, kartThemes } from '../../styles/kartTokens.ts'
import { grain, painted } from './textures.ts'
import type { ArtKit } from './trackArt.ts'

/** Where the land ends and the quay drops to the sea, z (the seafront straight runs at about -112) */
export const HARBOUR_COAST = -146
/** Where the land ends to the west, x: a beach down to the same sea, the sun setting beyond it */
export const HARBOUR_SHORE = -228
/** The sea lies this far below the quay */
const SEA_LEVEL = -1.6
/** Where the hillside south of the switchbacks starts to rise, z */
const HILL_FOOT = 184

interface Box {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}
const inside = (box: Box, x: number, z: number) =>
  x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ

/** The sheds and container stacks in the infield, between the straight and the switchbacks */
const TOWN: Box = { minX: -60, maxX: 176, minZ: -98, maxZ: 42 }
/** The terraces of houses on the hillside */
const TERRACES: Box = { minX: -205, maxX: 270, minZ: 194, maxZ: 336 }
/** The switchbacks, where the lanterns hang */
const SWITCHBACKS: Box = { minX: -22, maxX: 152, minZ: 44, maxZ: 174 }

/** The ground's height at (x, z): flat, but for the hillside rising south of the track */
export function harbourGround(x: number, z: number): number {
  const rise = (z - HILL_FOOT) / 150
  if (rise <= 0) return 0
  const steep = Math.pow(Math.min(rise, 1), 1.5) * 40 + Math.max(0, Math.min(rise, 2) - 1) * 30
  const ripple = Math.min(1, rise * 3) * 2.5 * Math.sin(x / 19 + z / 27)
  // Down to the beach at the western shore
  const fromShore = Math.max(0, Math.min(1, (x - HARBOUR_SHORE) / 90))
  const taper = fromShore * fromShore * (3 - 2 * fromShore)
  return Math.max(0, (steep * (0.85 + 0.15 * Math.sin(x / 41)) + ripple) * taper)
}

/** Whether (x, z) is out in the sea, beyond the quay or the beach, by `margin` metres */
export const inHarbourSea = (x: number, z: number, margin = 0): boolean =>
  z < HARBOUR_COAST - margin || x < HARBOUR_SHORE - margin

/** Where the shared trees may grow: not on the quay, not among the sheds or the houses */
export const harbourTreeFits = (x: number, z: number): boolean =>
  z > -98 && x > HARBOUR_SHORE + 34 && !inside(TOWN, x, z) && !inside(TERRACES, x, z)

/** A gable roof one unit each way: ridge along x at the top, eaves at y = 0 */
function gable(): BufferGeometry {
  // Non-indexed, so that each face keeps its own flat normal
  const p = [
    // Two slopes
    [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0],
    [0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0],
    // The gable ends
    [0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0],
    [-0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0],
  ].flat()
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** A boat's hull, 1 unit wide and long, deck at y = 1, keel at y = 0: a square stern, a pointed bow (-z) */
function hull(): BufferGeometry {
  const deck = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.15],
    [0, -0.5],
    [-0.5, -0.15],
  ] as const
  const positions: number[] = []
  const add = (...points: (readonly [number, number, number])[]) => {
    for (const point of points) positions.push(...point)
  }
  const top = deck.map(([x, z]) => [x, 1, z] as const)
  const bottom = deck.map(([x, z]) => [x * 0.55, 0, z * 0.92] as const)
  for (let index = 0; index < deck.length; index++) {
    const next = (index + 1) % deck.length
    add(top[index]!, bottom[index]!, bottom[next]!, top[index]!, bottom[next]!, top[next]!)
  }
  // The deck, as a fan
  for (let index = 1; index < deck.length - 1; index++) add(top[0]!, top[index + 1]!, top[index]!)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildHarbour(kit: ArtKit): { update(seconds: number): void } {
  const { track, level, group, textures, keep, own, ownTexture, standard, shadowed, place } = kit
  const rng = createRng(53)
  const random = () => rng.float()
  const count = (full: number, least = 1) => Math.max(least, Math.round(full * level.density))
  const dummy = new Object3D()
  const setMatrix = (
    instances: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number],
    rotation: [number, number, number],
  ) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(...rotation)
    dummy.scale.set(...scale)
    dummy.updateMatrix()
    instances.setMatrixAt(index, dummy.matrix)
  }
  const tinted = (instances: InstancedMesh, index: number, colour: string) =>
    instances.setColorAt(index, new Color(colour))
  const clearOfRoad = (x: number, z: number, metres: number) =>
    roadClearance(track.road, x, z) > metres
  const basic = (color: string) => own(new MeshBasicMaterial({ color }))

  // ── Textures of its own, painted at load ──
  const concrete = ownTexture(
    painted(
      256,
      51,
      (context, size, rand) => {
        context.fillStyle = harbourScene.concrete
        context.fillRect(0, 0, size, size)
        grain(context, size, rand, 5000, 0.14)
        // Slab joints
        context.fillStyle = 'rgba(0,0,0,0.22)'
        for (let at = 0; at < size; at += size / 4) {
          context.fillRect(at, 0, 2, size)
          context.fillRect(0, at, size, 2)
        }
      },
      level.anisotropy,
    ),
  )
  // Ribbed sheet metal, near white so that each shed or container tints it its own colour
  const ribbed = ownTexture(
    painted(
      128,
      52,
      (context, size, rand) => {
        context.fillStyle = '#f4f4f4'
        context.fillRect(0, 0, size, size)
        for (let x = 0; x < size; x += 8) {
          context.fillStyle = 'rgba(0,0,0,0.16)'
          context.fillRect(x, 0, 3, size)
          context.fillStyle = 'rgba(255,255,255,0.5)'
          context.fillRect(x + 4, 0, 1, size)
        }
        grain(context, size, rand, 800, 0.1)
      },
      level.anisotropy,
    ),
  )
  // A house front: windows in a grid; the glow map lights some of them, warm, for the dusk
  const lit: boolean[] = []
  for (let index = 0; index < 9; index++) lit.push(random() < 0.55)
  const windows = (context: CanvasRenderingContext2D, size: number, glow: boolean) => {
    context.fillStyle = glow ? '#000000' : '#f6f6f6'
    context.fillRect(0, 0, size, size)
    if (!glow) {
      context.fillStyle = 'rgba(0,0,0,0.12)'
      context.fillRect(0, size * 0.32, size, 3)
      context.fillRect(0, size * 0.65, size, 3)
    }
    const cell = size / 3
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const on = lit[row * 3 + column]!
        context.fillStyle = glow
          ? on
            ? harbourScene.windowLit
            : '#000000'
          : on
            ? harbourScene.windowLit
            : harbourScene.window
        context.fillRect(
          column * cell + cell * 0.25,
          row * cell + cell * 0.22,
          cell * 0.5,
          cell * 0.5,
        )
      }
    }
  }
  const facade = ownTexture(painted(128, 54, (context, size) => windows(context, size, false), 1))
  const facadeGlow = ownTexture(
    painted(128, 54, (context, size) => windows(context, size, true), 1),
  )
  // Short bright dashes for the sun's path on the water, fading to either side
  const glitter = ownTexture(
    painted(
      128,
      55,
      (context, size, rand) => {
        context.clearRect(0, 0, size, size)
        for (let index = 0; index < 520; index++) {
          const x = rand() * size
          const fade = Math.pow(1 - Math.abs(x / size - 0.5) * 2, 0.7)
          context.fillStyle = `rgba(255,255,255,${(0.45 + rand() * 0.55) * fade})`
          context.fillRect(x - 4, rand() * size, 3 + rand() * 10, 1 + rand() * 1.5)
        }
      },
      1,
    ),
  )

  // ── The sea, north and west, under the land too (the land hides it), and the sun's path on it ──
  const seaBox = { minX: -1900, maxX: 1500, minZ: HARBOUR_COAST - 1700, maxZ: 1250 }
  const seaWidth = seaBox.maxX - seaBox.minX
  const seaDepth = seaBox.maxZ - seaBox.minZ
  const water = textures.water
  water.repeat.set(seaWidth / 16, seaDepth / 16)
  const sea = new Mesh(
    keep(new PlaneGeometry(seaWidth, seaDepth)),
    own(new MeshLambertMaterial({ map: water, color: harbourScene.sea })),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.set((seaBox.minX + seaBox.maxX) / 2, SEA_LEVEL, (seaBox.minZ + seaBox.maxZ) / 2)
  group.add(shadowed(sea, false))
  const [sunX, , sunZ] = kartThemes.sunset.sunDirection
  const sunLength = Math.hypot(sunX, sunZ)
  const path = new Mesh(
    keep(new PlaneGeometry(110, 1300).rotateX(-Math.PI / 2)),
    own(
      new MeshBasicMaterial({
        map: glitter,
        color: kartThemes.sunset.sunGlow,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
  )
  glitter.repeat.set(1, 10)
  path.rotation.y = Math.atan2(-sunX / sunLength, -sunZ / sunLength)
  // From the corner where the quay meets the beach, out towards the sun
  path.position.set(
    HARBOUR_SHORE + (sunX / sunLength) * 700,
    SEA_LEVEL + 0.05,
    HARBOUR_COAST + (sunZ / sunLength) * 700,
  )
  group.add(path)

  // The beach along the western shore, sloping into the water
  const beachTop = HARBOUR_SHORE + 16
  const beachFoot = HARBOUR_SHORE - 22
  const beachLength = 1250 - HARBOUR_COAST
  const beachDrop = 0.03 - (SEA_LEVEL - 1)
  const beachRun = beachTop - beachFoot
  const beachGeometry = keep(
    new PlaneGeometry(Math.hypot(beachRun, beachDrop), beachLength).rotateX(-Math.PI / 2),
  )
  beachGeometry.rotateZ(Math.atan2(beachDrop, beachRun))
  const beach = new Mesh(beachGeometry, own(new MeshLambertMaterial({ map: textures.sand })))
  textures.sand.repeat.set(beachRun / 6, beachLength / 6)
  beach.position.set(
    (beachTop + beachFoot) / 2,
    0.03 - beachDrop / 2,
    HARBOUR_COAST + beachLength / 2,
  )
  group.add(shadowed(beach, false))

  // ── The quay: concrete to the edge, a sea wall down to the water, bollards ──
  const quay = { minX: -215, maxX: 262 }
  const quayDepth = -121.4 - HARBOUR_COAST
  const apron = new Mesh(
    keep(new PlaneGeometry(quay.maxX - quay.minX, quayDepth)),
    own(new MeshLambertMaterial({ map: concrete })),
  )
  concrete.repeat.set((quay.maxX - quay.minX) / 8, quayDepth / 8)
  apron.rotation.x = -Math.PI / 2
  apron.position.set((quay.minX + quay.maxX) / 2, 0.025, HARBOUR_COAST + quayDepth / 2)
  group.add(shadowed(apron, false))
  const wallHeight = 0.25 - (SEA_LEVEL - 0.6)
  const wallFrom = HARBOUR_SHORE - 8
  const seaWall = new Mesh(
    keep(new BoxGeometry(seaBox.maxX - wallFrom, wallHeight, 1.4)),
    standard(harbourScene.concreteDark),
  )
  seaWall.position.set((wallFrom + seaBox.maxX) / 2, 0.25 - wallHeight / 2, HARBOUR_COAST - 0.7)
  group.add(shadowed(seaWall))
  const edge = new Mesh(
    keep(new BoxGeometry(quay.maxX - quay.minX, 0.06, 0.45)),
    basic(harbourScene.quayEdge),
  )
  edge.position.set((quay.minX + quay.maxX) / 2, 0.28, HARBOUR_COAST - 0.3)
  group.add(edge)
  const bollardSpots: number[] = []
  for (let x = quay.minX + 6; x < quay.maxX; x += 11) bollardSpots.push(x)
  const bollards = new InstancedMesh(
    keep(new CylinderGeometry(0.22, 0.3, 0.7, 8)),
    standard(harbourScene.boatTrim),
    bollardSpots.length,
  )
  bollardSpots.forEach((x, index) => place(bollards, index, x, 0.6, HARBOUR_COAST + 0.9, [1, 1, 1]))
  group.add(shadowed(bollards))

  // ── Breakwaters, tetrapods and the harbour lights ──
  // Far from the road, these cast no shadows: the shadow map covers only ±45 m round the car
  const coast = HARBOUR_COAST
  const arms: [number, number, number, number][] = [
    [-95, coast, -95, coast - 120],
    [-95, coast - 120, -25, coast - 120],
    [165, coast, 165, coast - 82],
    [165, coast - 82, 78, coast - 82],
  ]
  const armTop = 1.0
  const armHeight = armTop - (SEA_LEVEL - 0.6)
  const armMaterial = standard(harbourScene.concrete)
  const tetraSpots: [number, number][] = []
  for (const [ax, az, bx, bz] of arms) {
    const span = Math.hypot(bx - ax, bz - az)
    const block = new Mesh(keep(new BoxGeometry(8, armHeight, span + 8)), armMaterial)
    block.position.set((ax + bx) / 2, armTop - armHeight / 2, (az + bz) / 2)
    block.rotation.y = Math.atan2(bx - ax, bz - az)
    group.add(shadowed(block, false))
    const along = { x: (bx - ax) / span, z: (bz - az) / span }
    const step = level.density < 0.5 ? 4 : 2.4
    for (let at = 2; at < span; at += step) {
      for (const sideOf of [-1, 1]) {
        const out = 5 + random() * 1.6
        tetraSpots.push([
          ax + along.x * at - along.z * out * sideOf,
          az + along.z * at + along.x * out * sideOf,
        ])
      }
    }
  }
  const tetrapods = new InstancedMesh(
    keep(new TetrahedronGeometry(1.4, 0)),
    standard(harbourScene.tetrapod),
    tetraSpots.length,
  )
  tetraSpots.forEach(([x, z], index) =>
    setMatrix(
      tetrapods,
      index,
      x,
      SEA_LEVEL + 0.5 + random() * 0.5,
      z,
      [1, 1, 1],
      [random() * 6, random() * 6, random() * 6],
    ),
  )
  group.add(shadowed(tetrapods, false))

  // The lighthouse, at the end of the western arm: red and white bands, a lit lantern, turning beams
  const lighthouse = new Group()
  const red = standard(harbourScene.lighthouseRed)
  const white = standard(harbourScene.lighthouseWhite)
  const plinth = new Mesh(keep(new CylinderGeometry(3.4, 3.8, 1.2, 12)), armMaterial)
  plinth.position.y = armTop + 0.6
  lighthouse.add(shadowed(plinth, false))
  const bands = 4
  const bandHeight = 3.3
  for (let band = 0; band < bands; band++) {
    const bottomRadius = 2.4 - band * 0.18
    const piece = new Mesh(
      keep(new CylinderGeometry(bottomRadius - 0.18, bottomRadius, bandHeight, 14)),
      band % 2 === 0 ? red : white,
    )
    piece.position.y = armTop + 1.2 + bandHeight * (band + 0.5)
    lighthouse.add(shadowed(piece, false))
  }
  const towerTop = armTop + 1.2 + bandHeight * bands
  const gallery = new Mesh(
    keep(new CylinderGeometry(2.3, 2.3, 0.35, 14)),
    standard(harbourScene.boatTrim),
  )
  gallery.position.y = towerTop + 0.17
  const lantern = new Mesh(
    keep(new CylinderGeometry(1.2, 1.2, 2, 10)),
    basic(harbourScene.lanternGlass),
  )
  lantern.position.y = towerTop + 1.35
  const cap = new Mesh(keep(new ConeGeometry(1.7, 1.6, 10)), red)
  cap.position.y = towerTop + 3.15
  lighthouse.add(shadowed(gallery, false), lantern, shadowed(cap, false))
  const beamLength = 80
  const beamGeometry = keep(new ConeGeometry(3.5, beamLength, 16, 4, true))
  beamGeometry.translate(0, -beamLength / 2, 0)
  beamGeometry.rotateZ(Math.PI / 2)
  // Bright at the lantern, fading to nothing at the far end (added light: black adds none)
  const beamPosition = beamGeometry.getAttribute('position')
  const beamColours: number[] = []
  for (let index = 0; index < beamPosition.count; index++) {
    const fade = Math.pow(Math.max(0, 1 - beamPosition.getX(index) / beamLength), 1.6)
    beamColours.push(fade, fade, fade)
  }
  beamGeometry.setAttribute('color', new Float32BufferAttribute(beamColours, 3))
  const beamMaterial = own(
    new MeshBasicMaterial({
      color: harbourScene.lanternGlass,
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  )
  const beams = new Group()
  for (const turn of [0, Math.PI]) {
    const beam = new Mesh(beamGeometry, beamMaterial)
    beam.rotation.y = turn
    beams.add(beam)
  }
  beams.position.y = towerTop + 1.35
  lighthouse.add(beams)
  lighthouse.position.set(-25, 0, coast - 120)
  group.add(lighthouse)

  // A small green light on the eastern arm, opposite
  const beacon = new Group()
  const green = new Mesh(
    keep(new CylinderGeometry(1, 1.3, 6, 10)),
    standard(harbourScene.harbourGreen),
  )
  green.position.y = armTop + 3
  const band = new Mesh(keep(new CylinderGeometry(1.02, 1.12, 1, 10)), white)
  band.position.y = armTop + 3.4
  const greenLamp = new Mesh(keep(new SphereGeometry(0.7, 10, 8)), basic('#9CFFB8'))
  greenLamp.position.y = armTop + 6.6
  beacon.add(shadowed(green, false), shadowed(band, false), greenLamp)
  beacon.position.set(78, 0, coast - 82)
  group.add(beacon)

  // ── Fishing boats at their moorings, bobbing ──
  const boatSpots = scatter(track.road, {
    seed: 41,
    count: count(14, 4),
    box: { minX: -82, maxX: 152, minZ: coast - 72, maxZ: coast - 7 },
    clearance: 0,
    spacing: 13,
  })
  const boats = boatSpots.map((spot) => ({
    x: spot.x,
    z: spot.z,
    // Alongside the quay near it, swinging at anchor further out
    yaw: spot.z > coast - 18 ? (spot.a < 0.5 ? Math.PI / 2 : -Math.PI / 2) : spot.a * Math.PI * 2,
    phase: spot.b * 10,
    length: 8 + spot.b * 4,
    colour:
      harbourScene.hulls[
        Math.floor(spot.a * harbourScene.hulls.length) % harbourScene.hulls.length
      ]!,
  }))
  const part = (geometry: BufferGeometry, material: Material) => {
    const instances = new InstancedMesh(keep(geometry), material, boats.length)
    group.add(shadowed(instances, false))
    return instances
  }
  const hulls = part(hull(), standard('#ffffff'))
  const cabins = part(new BoxGeometry(1, 1, 1), standard(harbourScene.cabin))
  const cabinRoofs = part(new BoxGeometry(1, 1, 1), standard(harbourScene.boatTrim))
  const masts = part(new CylinderGeometry(0.06, 0.09, 1, 5), standard(harbourScene.boatTrim))
  const flags = part(new BoxGeometry(0.04, 1, 1), standard(harbourScene.flag))
  boats.forEach((boat, index) => tinted(hulls, index, boat.colour))
  /** Each part's place and size on a boat of this length */
  const boatParts = (length: number) => {
    const beam = length * 0.36
    const matrix = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      new Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z)
    return [
      [hulls, matrix(0, -0.6, 0, beam, 1.7, length)],
      [cabins, matrix(0, 1.1 + 0.85, length * 0.14, beam * 0.7, 1.7, length * 0.28)],
      [cabinRoofs, matrix(0, 2.88, length * 0.14, beam * 0.78, 0.18, length * 0.31)],
      [masts, matrix(0, 1.1 + 2.6, -length * 0.22, 1, 5.2, 1)],
      [flags, matrix(0, 6, -length * 0.22 + 0.45, 1, 0.55, 0.9)],
    ] as const
  }
  const boatLayouts = boats.map((boat) => boatParts(boat.length))
  const boatMatrix = new Matrix4()
  const partMatrix = new Matrix4()
  const bob = (seconds: number) => {
    boats.forEach((boat, index) => {
      dummy.position.set(boat.x, SEA_LEVEL + Math.sin(seconds * 1.3 + boat.phase) * 0.09, boat.z)
      dummy.rotation.set(
        Math.sin(seconds * 1.1 + boat.phase * 1.7) * 0.02,
        boat.yaw,
        Math.sin(seconds * 0.9 + boat.phase) * 0.04,
      )
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      boatMatrix.copy(dummy.matrix)
      for (const [instances, local] of boatLayouts[index]!) {
        partMatrix.multiplyMatrices(boatMatrix, local)
        instances.setMatrixAt(index, partMatrix)
      }
    })
    for (const instances of [hulls, cabins, cabinRoofs, masts, flags])
      instances.instanceMatrix.needsUpdate = true
  }
  bob(0)

  // ── The cargo side: a crane on the quay, a ship alongside, containers ──
  const craneMaterial = standard(harbourScene.crane)
  const crane = new Group()
  for (const [x, z] of [
    [-6, -5],
    [6, -5],
    [-6, 5],
    [6, 5],
  ] as const) {
    const leg = new Mesh(keep(new BoxGeometry(1.2, 26, 1.2)), craneMaterial)
    leg.position.set(x, 13, z)
    crane.add(shadowed(leg, false))
  }
  const girder = new Mesh(keep(new BoxGeometry(14, 2, 12)), craneMaterial)
  girder.position.y = 26
  const boom = new Mesh(keep(new BoxGeometry(2, 1.6, 78)), craneMaterial)
  boom.position.set(0, 28, -24)
  const crab = new Mesh(keep(new BoxGeometry(3, 2.4, 3.4)), standard(harbourScene.cabin))
  crab.position.set(0, 25.6, -30)
  crane.add(shadowed(girder, false), shadowed(boom, false), shadowed(crab, false))
  crane.position.set(236, 0, coast + 6)
  group.add(crane)

  const ship = new Group()
  const shipHull = new Mesh(keep(hull()), standard(harbourScene.hulls[2]))
  shipHull.scale.set(20, 5.5, 84)
  shipHull.position.y = SEA_LEVEL - 1.6
  shipHull.rotation.y = Math.PI
  // The bow (the hull's -z) turned to +z, the bridge at the stern
  const bridgeHouse = new Mesh(keep(new BoxGeometry(14, 9, 8)), standard(harbourScene.cabin))
  bridgeHouse.position.set(0, SEA_LEVEL + 3.9 + 4.5, -32)
  const funnel = new Mesh(keep(new CylinderGeometry(1.6, 1.8, 5, 10)), red)
  funnel.position.set(0, SEA_LEVEL + 3.9 + 11, -35)
  ship.add(shadowed(shipHull, false), shadowed(bridgeHouse, false), shadowed(funnel, false))
  // Lying east-west beyond the crane, bow to the east
  ship.position.set(244, 0, coast - 22)
  ship.rotation.y = Math.PI / 2
  group.add(ship)

  // Containers: stacks on the quay by the crane, in the infield yard, and on the ship's deck
  const boxes: { x: number; y: number; z: number; turn: number; colour: string }[] = []
  const palette = harbourScene.containers
  const stack = (x: number, z: number, high: number, turn: number, base = 0) => {
    for (let level = 0; level < high; level++) {
      boxes.push({
        x,
        y: base + 1.3 + level * 2.6,
        z,
        turn,
        colour: palette[Math.floor(random() * palette.length)]!,
      })
    }
  }
  const keepShare = 0.4 + level.density * 0.6
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 5; column++) {
      if (random() > keepShare) continue
      stack(212 + column * 6.6, coast + 13 + row * 2.7, 1 + Math.floor(random() * 3), 0)
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 5; column++) {
      const x = 92 + column * 6.6
      const z = -88 + row * 2.7
      if (random() > keepShare || !clearOfRoad(x, z, 6)) continue
      stack(x, z, 1 + Math.floor(random() * 2), 0)
    }
  }
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 7; column++) {
      if (random() > keepShare) continue
      // Along the ship's deck, between its bridge and its bow
      stack(
        220 + column * 6.4,
        coast - 22 - 7.5 + row * 5,
        1 + Math.floor(random() * 2),
        0,
        SEA_LEVEL + 3.9,
      )
    }
  }
  const containers = new InstancedMesh(
    keep(new BoxGeometry(6.1, 2.6, 2.44)),
    standard('#ffffff', ribbed),
    boxes.length,
  )
  boxes.forEach((one, index) => {
    place(containers, index, one.x, one.y, one.z, [1, 1, 1], one.turn)
    tinted(containers, index, one.colour)
  })
  group.add(shadowed(containers))

  // ── Sheds in the infield, with gable roofs ──
  const shedSpots = scatter(track.road, {
    seed: 61,
    count: count(12, 5),
    box: TOWN,
    clearance: 12,
    spacing: 26,
    // Clear of the container yard and the grandstand by the line
    fits: (x, z) => !(x > 84 && x < 128 && z > -92 && z < -78) && !(x < -36 && z < -78),
  })
  const sheds = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    standard('#ffffff', ribbed),
    shedSpots.length,
  )
  const shedRoofs = new InstancedMesh(keep(gable()), standard('#ffffff'), shedSpots.length)
  shedSpots.forEach((spot, index) => {
    const w = 14 + spot.a * 10
    const d = 10 + spot.b * 5
    const h = 5.5 + spot.b * 3
    const turn = spot.a > 0.5 ? 0 : Math.PI / 2
    place(sheds, index, spot.x, h / 2, spot.z, [w, h, d], turn)
    place(shedRoofs, index, spot.x, h, spot.z, [w * 1.04, 2.6, d * 1.1], turn)
    tinted(sheds, index, harbourScene.shedWalls[index % harbourScene.shedWalls.length]!)
    tinted(shedRoofs, index, harbourScene.roofs[index % harbourScene.roofs.length]!)
  })
  group.add(shadowed(sheds), shadowed(shedRoofs))

  // ── Palms along the quay and among the sheds ──
  const palmSpots: { x: number; z: number; lean: number; turn: number }[] = []
  for (let x = quay.minX + 8; x < 200; x += 15) {
    palmSpots.push({
      x: x + random() * 3,
      z: coast + 5 + random() * 2,
      lean: random() * 0.12,
      turn: random() * 6,
    })
  }
  for (const spot of scatter(track.road, {
    seed: 62,
    count: count(14, 4),
    box: TOWN,
    clearance: 5,
    spacing: 9,
    fits: (x, z) =>
      !(x < -36 && z < -80) && shedSpots.every((shed) => Math.hypot(shed.x - x, shed.z - z) > 16),
  })) {
    palmSpots.push({ x: spot.x, z: spot.z, lean: spot.a * 0.15, turn: spot.b * 6 })
  }
  for (let z = HARBOUR_COAST + 14; z < 175; z += 17) {
    palmSpots.push({
      x: HARBOUR_SHORE + 9 + random() * 4,
      z: z + random() * 5,
      lean: 0.08 + random() * 0.14,
      turn: -Math.PI / 2 + (random() - 0.5),
    })
  }
  const fronds = 7
  const palmTrunks = new InstancedMesh(
    keep(new CylinderGeometry(0.16, 0.28, 7, 6).translate(0, 3.5, 0)),
    standard(harbourScene.palmTrunk),
    palmSpots.length,
  )
  const leaves = new InstancedMesh(
    keep(new ConeGeometry(0.55, 4.4, 3).translate(0, 2.2, 0).scale(1, 1, 0.3)),
    standard(harbourScene.palmLeaf),
    palmSpots.length * fronds,
  )
  palmSpots.forEach((palm, index) => {
    setMatrix(palmTrunks, index, palm.x, 0, palm.z, [1, 1, 1], [palm.lean, palm.turn, 0])
    // The crown sits at the top of the leaning trunk
    const topX = palm.x + Math.sin(palm.turn) * Math.sin(palm.lean) * 7
    const topZ = palm.z + Math.cos(palm.turn) * Math.sin(palm.lean) * 7
    for (let frond = 0; frond < fronds; frond++) {
      setMatrix(
        leaves,
        index * fronds + frond,
        topX,
        6.9,
        topZ,
        [1, 1, 1],
        [0, palm.turn + (frond / fronds) * Math.PI * 2, -1.15 - (frond % 2) * 0.25],
      )
    }
  })
  group.add(shadowed(palmTrunks), shadowed(leaves))

  // ── Red lanterns along the switchbacks, lit for the evening ──
  const lanternSpots: { x: number; z: number }[] = []
  track.road.forEach((point, index) => {
    if (index % 3 !== 0 || !inside(SWITCHBACKS, point.x, point.z)) return
    const { dx, dz } = roadDirection(track.road, index)
    for (const sideOf of [1, -1]) {
      const offset = point.width / 2 + 2.6
      const x = point.x + sideOf * dz * offset
      const z = point.z - sideOf * dx * offset
      if (
        clearOfRoad(x, z, 2) &&
        lanternSpots.every((other) => Math.hypot(other.x - x, other.z - z) > 7)
      ) {
        lanternSpots.push({ x, z })
      }
    }
  })
  const lanternPosts = new InstancedMesh(
    keep(new CylinderGeometry(0.07, 0.1, 4.4, 6)),
    standard(harbourScene.boatTrim),
    lanternSpots.length,
  )
  const lanterns = new InstancedMesh(
    keep(new SphereGeometry(0.45, 10, 8)),
    basic(harbourScene.lanternLit),
    lanternSpots.length,
  )
  const lanternCaps = new InstancedMesh(
    keep(new CylinderGeometry(0.22, 0.3, 0.16, 8)),
    standard(harbourScene.lantern),
    lanternSpots.length * 2,
  )
  lanternSpots.forEach((spot, index) => {
    place(lanternPosts, index, spot.x, 2.2, spot.z, [1, 1, 1])
    place(lanterns, index, spot.x, 4.0, spot.z, [1, 1.3, 1])
    place(lanternCaps, index * 2, spot.x, 4.62, spot.z, [1, 1, 1])
    place(lanternCaps, index * 2 + 1, spot.x, 3.4, spot.z, [1, 1, 1])
  })
  group.add(shadowed(lanternPosts), lanterns, shadowed(lanternCaps))

  // ── The hillside: the ground rising south of the track, terraced houses, pines higher up ──
  const hillEast = 1000
  const hillWidth = hillEast - HARBOUR_SHORE
  const hillDepth = 520
  const hillGeometry = keep(new PlaneGeometry(hillWidth, hillDepth, 60, 26))
  hillGeometry.rotateX(-Math.PI / 2)
  hillGeometry.translate((HARBOUR_SHORE + hillEast) / 2, 0, HILL_FOOT + hillDepth / 2)
  const hillPosition = hillGeometry.getAttribute('position')
  const low = new Color('#ffffff')
  const high = new Color('#C9B48E')
  const hillColours: number[] = []
  for (let index = 0; index < hillPosition.count; index++) {
    const height = harbourGround(hillPosition.getX(index), hillPosition.getZ(index))
    hillPosition.setY(index, height)
    const colour = low.clone().lerp(high, Math.min(1, height / 70))
    hillColours.push(colour.r, colour.g, colour.b)
  }
  hillGeometry.setAttribute('color', new Float32BufferAttribute(hillColours, 3))
  hillGeometry.computeVertexNormals()
  // The grass texture repeats every 10 m on the flat; the same here
  const hillUv = hillGeometry.getAttribute('uv')
  for (let index = 0; index < hillUv.count; index++) {
    hillUv.setXY(
      index,
      (hillUv.getX(index) * hillWidth) / 10,
      (hillUv.getY(index) * hillDepth) / 10,
    )
  }
  const grassTile = textures.grass.clone()
  grassTile.repeat.set(1, 1)
  grassTile.needsUpdate = true
  ownTexture(grassTile)
  const hill = new Mesh(
    hillGeometry,
    own(new MeshLambertMaterial({ map: grassTile, vertexColors: true })),
  )
  group.add(shadowed(hill, false))

  // Houses in terraces up the slope: flat roofs, a water tank on many, windows lit for the evening
  const houses: {
    x: number
    z: number
    w: number
    d: number
    base: number
    h: number
    colour: string
    tank: boolean
  }[] = []
  const housesShare = 0.2 + level.density * 0.32
  for (let row = 0; row * 15 + TERRACES.minZ < TERRACES.maxZ; row++) {
    for (let x = TERRACES.minX; x < TERRACES.maxX; x += 13) {
      const z = TERRACES.minZ + row * 15 + random() * 3
      const hx = x + random() * 3
      if (random() > housesShare || !clearOfRoad(hx, z, 16)) continue
      const w = 7 + random() * 3.5
      const d = 7 + random() * 2.5
      const front = harbourGround(hx, z - d / 2)
      const back = harbourGround(hx, z + d / 2)
      const floors = 2 + Math.floor(random() * 3)
      houses.push({
        x: hx,
        z,
        w,
        d,
        base: Math.min(front, back) - 0.4,
        h: floors * 3.1 + Math.abs(back - front),
        colour: harbourScene.walls[Math.floor(random() * harbourScene.walls.length)]!,
        tank: random() < 0.6,
      })
    }
  }
  const front = own(
    new MeshStandardMaterial({
      map: facade,
      emissiveMap: facadeGlow,
      emissive: '#ffffff',
      roughness: 0.9,
      flatShading: true,
    }),
  )
  const roofTop = standard(harbourScene.concrete)
  // BoxGeometry's faces in order: +x, -x, +y, -y, +z, -z; the top and bottom are plain concrete
  const houseBodies = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    [front, front, roofTop, roofTop, front, front],
    houses.length,
  )
  const tanks = houses.filter((house) => house.tank)
  const tankMeshes = new InstancedMesh(
    keep(new CylinderGeometry(0.8, 0.8, 1.5, 10)),
    standard(kartScene.metal),
    tanks.length,
  )
  houses.forEach((house, index) => {
    place(houseBodies, index, house.x, house.base + house.h / 2, house.z, [
      house.w,
      house.h,
      house.d,
    ])
    tinted(houseBodies, index, house.colour)
  })
  tanks.forEach((house, index) => {
    place(
      tankMeshes,
      index,
      house.x + house.w * 0.22,
      house.base + house.h + 1.2,
      house.z,
      [1, 1, 1],
    )
  })
  group.add(shadowed(houseBodies, false), shadowed(tankMeshes, false))

  // Pines on the upper slope beyond the houses, and trees between them
  const pineSpots = [
    ...scatter(track.road, {
      seed: 63,
      count: count(220, 30),
      box: {
        minX: HARBOUR_SHORE + 20,
        maxX: 700,
        minZ: TERRACES.maxZ + 4,
        maxZ: HILL_FOOT + hillDepth - 20,
      },
      clearance: 0,
      spacing: 10,
    }),
    ...scatter(track.road, {
      seed: 64,
      count: count(150, 20),
      box: TERRACES,
      clearance: 14,
      spacing: 7,
      fits: (x, z) =>
        houses.every((house) => Math.hypot(house.x - x, house.z - z) > Math.max(house.w, house.d)),
    }),
  ]
  const pines = new InstancedMesh(
    keep(new ConeGeometry(2.2, 7, 7)),
    standard(kartScene.leaf),
    pineSpots.length,
  )
  pineSpots.forEach((spot, index) => {
    const size = 0.8 + spot.a * 0.8
    place(
      pines,
      index,
      spot.x,
      harbourGround(spot.x, spot.z) + 3.2 * size,
      spot.z,
      [size, size, size],
      spot.b * 6,
    )
  })
  group.add(shadowed(pines, false))

  return {
    update(seconds) {
      water.offset.set(seconds * 0.01, seconds * 0.03)
      glitter.offset.set(0, seconds * 0.05)
      beams.rotation.y = seconds * 0.7
      bob(seconds)
    },
  }
}
