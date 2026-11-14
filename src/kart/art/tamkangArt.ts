// 2026-11-14 (owner: "try making a Tamkang University map; shrink the characters, enlarge the
// buildings"): the Tamkang campus track's own scenery. A stylised 淡江大學 淡水校園 on its hilltop,
// drawn from well-known public landmarks in our own low-poly shapes, everything oversized beside
// the small karts: the lantern avenue (宮燈道) with its rows of palace lamps and its green-roofed,
// red-columned classrooms either side; a tall memorial tower on its plaza (驚聲); a big library
// (覺生); a plaza of white curling scroll panels (書卷廣場); a lawn (牧羊草坪); a glass business
// tower (商管); a museum shaped like a ship (海事博物館); the long stairway down the hill to the town
// (克難坡); and beyond the edge of the campus the town of 淡水 below, the wide river, and the
// mountain across it (觀音山). No logos, no real people, no model or image files: shapes in
// three.js and textures painted on canvases (docs/ASSETS.md). The only words are the plain name on
// a stone by the avenue.
//
// 2026-11-14 again: the track was drawn 1.5 times as big (TAMKANG_SCALE) with a 28 to 34 m road;
// the campus is placed in the same drawn units, `metres(n)`, so that every landmark stands where it
// did round the road, keeping its own size.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
} from 'three'
import { createRng } from '../../../shared/games/rng.ts'
import { scatter } from '../../../shared/kart/scenery.ts'
import { TAMKANG_SCALE } from '../../../shared/kart/tracks/tamkang.ts'
import { kartScene, kartThemes, tamkangScene } from '../../styles/kartTokens.ts'
import { grain, painted } from './textures.ts'
import type { ArtKit } from './trackArt.ts'

/** Metres, from the drawn units the layout and the campus are placed in */
const metres = (drawn: number): number => drawn * TAMKANG_SCALE

/** The campus is a flat hilltop: past this x to the west, the ground falls away to the town */
export const CAMPUS_WEST = metres(-300)
/** ... and past this z to the south */
export const CAMPUS_SOUTH = metres(280)
/**
 * How far below the campus the town and the river bank lie, metres: shallow enough that the river
 * shows over the campus's edge from a kart (from 3.4 m up, 50 m from the edge, the line of sight
 * falls about 7 cm a metre)
 */
const LOW = 24
/** Over how many metres the hillside falls */
const SLOPE = 170
/** The water's surface */
const WATER_LEVEL = -26.5

/** The river's north bank: a point on it and the unit normal pointing across the river */
const BANK = { x: metres(-300), z: metres(400) }
const ACROSS = { x: -0.41, z: 0.912 }
/** Bank to bank, metres */
const RIVER_WIDTH = metres(640)

interface Box {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}
const inside = (box: Box, x: number, z: number, margin = 0) =>
  x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin
/** A box `w` by `d` metres round the drawn point (x, z) */
const boxAround = (x: number, z: number, w: number, d: number): Box => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
})

// ── Where the landmarks stand: clear of the road (tests/kart/tamkangArt.test.ts checks) ──

// Positions in metres (drawn units times TAMKANG_SCALE), sizes in metres as they were
/** The classroom rows either side of the lantern avenue (x = 0): blocks along z */
const CLASSROOM_BLOCKS = [-62, -12, 80, 125].map(metres)
const CLASSROOM = { offset: metres(33), depth: 14, length: 36, height: 10 }
/** The palace lamps either side of the avenue, this far from its middle: 4 m off its 34 m road */
const LAMP_OFFSET = 21
/** The memorial tower on its plaza, inside the top corner */
const TOWER = { x: metres(-42), z: metres(-128), size: 18, height: 74 }
/** The library, north of the road past the top corner */
const LIBRARY = { x: metres(-108), z: metres(-270), w: 100, d: 40, height: 30 }
/** The scroll plaza, inside the kink */
const SCROLLS = { x: metres(-192), z: metres(-163), radius: 18 }
/** The lawn, between the western esses and the run up through the middle */
const LAWN: Box = { minX: metres(-212), maxX: metres(-170), minZ: metres(-100), maxZ: metres(68) }
/** The business tower, between the runs up and down the middle */
const BUSINESS = { x: metres(-117), z: metres(28), size: 22, podium: 32, height: 88 }
/** The ship-shaped museum, south of the museum hairpin */
const MUSEUM = { x: metres(-196), z: metres(224), length: 64, beam: 16 }
/** The stairway down the hill, westwards from the campus's edge */
const STAIRS = { z: metres(-40), width: 7, length: 190 }
/** The name stone, by the bottom of the avenue */
const SIGN = { x: metres(27), z: metres(176) }

/** Every building's ground, for keeping trees and other buildings off it */
export const TAMKANG_LANDMARKS: readonly Box[] = [
  ...CLASSROOM_BLOCKS.flatMap((z) =>
    [-1, 1].map((side) =>
      boxAround(side * CLASSROOM.offset, z, CLASSROOM.depth + 4, CLASSROOM.length + 4),
    ),
  ),
  boxAround(TOWER.x, TOWER.z, TOWER.size + 6, TOWER.size + 6),
  boxAround(LIBRARY.x, LIBRARY.z, LIBRARY.w + 8, LIBRARY.d + 12),
  boxAround(SCROLLS.x, SCROLLS.z, SCROLLS.radius * 2, SCROLLS.radius * 2),
  LAWN,
  boxAround(BUSINESS.x, BUSINESS.z, BUSINESS.podium + 4, BUSINESS.podium + 4),
  boxAround(MUSEUM.x, MUSEUM.z, MUSEUM.length + 8, MUSEUM.beam + 10),
  boxAround(SIGN.x, SIGN.z, 6, 12),
]

/** How far (x, z) lies across the river from its north bank: negative on the campus side */
const acrossRiver = (x: number, z: number) => (x - BANK.x) * ACROSS.x + (z - BANK.z) * ACROSS.z

const smooth = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * The ground's height at (x, z): the flat campus, the hillside falling west and south of it to the
 * town and the river bank, the riverbed under the water, and foothills rising far to the north
 */
export function tamkangGround(x: number, z: number): number {
  const past = Math.hypot(Math.max(0, CAMPUS_WEST - x), Math.max(0, z - CAMPUS_SOUTH))
  let height = past > 0 ? -LOW * smooth(past / SLOPE) : 0
  // A gentle roll on the hillside and the town, none on the campus
  if (past > 0) height += Math.min(1, past / 60) * 1.8 * Math.sin(x / 37 + z / 53)
  const far = (metres(-640) - z) / 420
  if (far > 0) height += Math.pow(Math.min(far, 1.4), 1.5) * 60 * (0.75 + 0.25 * Math.sin(x / 95))
  const across = acrossRiver(x, z)
  // Down the bank into the water, and the riverbed under it
  if (across > -24) height = Math.min(height, -LOW - 0.8 - (across + 24) * 0.25)
  if (across > 0 && across < RIVER_WIDTH) height = Math.min(height, -LOW - 7)
  return height
}

/** Whether (x, z) is in the river or on its bank */
export const inTamkangRiver = (x: number, z: number, margin = 0): boolean =>
  acrossRiver(x, z) > -margin

/** Where the race-day dressing (festival.ts) may stand: on land, off the landmarks */
export const tamkangFestivalFits = (x: number, z: number): boolean =>
  !inTamkangRiver(x, z, 20) && !TAMKANG_LANDMARKS.some((box) => inside(box, x, z, 2))

/** Where the shared trees may grow: on land, off the landmarks, the stairway and the plazas */
export const tamkangTreeFits = (x: number, z: number): boolean =>
  !inTamkangRiver(x, z, 30) &&
  !TAMKANG_LANDMARKS.some((box) => inside(box, x, z, 3)) &&
  !(x < CAMPUS_WEST + 6 && Math.abs(z - STAIRS.z) < STAIRS.width + 4) &&
  // The campus's western edge stays open: the view down to the river from the esses
  !(x > CAMPUS_WEST - 80 && x < CAMPUS_WEST + 40 && z > metres(-200) && z < metres(160))

/** A hip roof one unit each way: eaves at y = 0, a ridge along x at y = 1 */
function hipRoof(): BufferGeometry {
  const r = 0.32
  const ridgeA = [-0.5 + r, 1, 0]
  const ridgeB = [0.5 - r, 1, 0]
  const corner = (x: number, z: number) => [x * 0.5, 0, z * 0.5]
  const [nw, ne, se, sw] = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
  // Non-indexed: each face keeps its flat normal
  const faces = [
    [sw, se, ridgeB, sw, ridgeB, ridgeA],
    [ne, nw, ridgeA, ne, ridgeA, ridgeB],
    [se, ne, ridgeB],
    [nw, sw, ridgeA],
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(faces.flat(2), 3))
  geometry.computeVertexNormals()
  return geometry
}

/** A ship's hull, 1 unit each way, deck at y = 1: a square stern (+z), a pointed raked bow (-z) */
function shipHull(): BufferGeometry {
  const deck = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.2],
    [0, -0.5],
    [-0.5, -0.2],
  ] as const
  const top = deck.map(([x, z]) => [x, 1, z] as const)
  const bottom = deck.map(([x, z]) => [x * 0.8, 0, z * 0.8 + (z < 0 ? 0.08 : 0)] as const)
  const positions: number[] = []
  for (let index = 0; index < deck.length; index++) {
    const next = (index + 1) % deck.length
    positions.push(...top[index]!, ...bottom[index]!, ...bottom[next]!)
    positions.push(...top[index]!, ...bottom[next]!, ...top[next]!)
  }
  for (let index = 1; index < deck.length - 1; index++)
    positions.push(...top[0]!, ...top[index + 1]!, ...top[index]!)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildTamkang(kit: ArtKit): { update(seconds: number): void } {
  const { track, level, group, textures, keep, own, ownTexture, standard, shadowed, place } = kit
  const rng = createRng(77)
  const random = () => rng.float()
  const count = (full: number, least = 1) => Math.max(least, Math.round(full * level.density))
  const dummy = new Object3D()
  const turned = (
    instances: InstancedMesh,
    index: number,
    position: [number, number, number],
    scale: [number, number, number],
    rotation: [number, number, number],
  ) => {
    dummy.position.set(...position)
    dummy.rotation.set(...rotation)
    dummy.scale.set(...scale)
    dummy.updateMatrix()
    instances.setMatrixAt(index, dummy.matrix)
  }
  const tinted = (instances: InstancedMesh, index: number, colour: string) =>
    instances.setColorAt(index, new Color(colour))
  const basic = (color: string) => own(new MeshBasicMaterial({ color }))
  const add = <T extends Mesh | InstancedMesh>(object: T, cast = true) => {
    group.add(shadowed(object, cast))
    return object
  }
  const box = (
    w: number,
    h: number,
    d: number,
    material: Material | Material[],
    x: number,
    y: number,
    z: number,
    cast = true,
  ) => {
    const mesh = new Mesh(keep(new BoxGeometry(w, h, d)), material)
    mesh.position.set(x, y, z)
    return add(mesh, cast)
  }

  // ── Textures of its own ──
  const paving = ownTexture(
    painted(
      256,
      71,
      (context, size, rand) => {
        context.fillStyle = tamkangScene.paving
        context.fillRect(0, 0, size, size)
        grain(context, size, rand, 3000, 0.1)
        context.fillStyle = tamkangScene.pavingJoint
        for (let at = 0; at < size; at += size / 8) {
          context.fillRect(at, 0, 2, size)
          context.fillRect(0, at, size, 2)
        }
      },
      level.anisotropy,
    ),
  )
  /** A wall of windows, near white so that each building tints it: `rows` floors, `columns` bays */
  const windows = (rows: number, columns: number, tall: number, seed: number) =>
    ownTexture(
      painted(
        256,
        seed,
        (context, size, rand) => {
          context.fillStyle = '#f7f7f7'
          context.fillRect(0, 0, size, size)
          grain(context, size, rand, 900, 0.06)
          const cellW = size / columns
          const cellH = size / rows
          for (let row = 0; row < rows; row++) {
            context.fillStyle = 'rgba(0,0,0,0.08)'
            context.fillRect(0, row * cellH, size, 2)
            for (let column = 0; column < columns; column++) {
              context.fillStyle = rand() < 0.15 ? '#6d8296' : tamkangScene.window
              const w = cellW * 0.56
              const h = cellH * tall
              context.fillRect(
                column * cellW + (cellW - w) / 2,
                row * cellH + (cellH - h) / 2,
                w,
                h,
              )
            }
          }
        },
        level.anisotropy,
      ),
    )
  const classroomWall = windows(2, 6, 0.5, 72)
  const officeWall = windows(4, 4, 0.42, 73)
  const glassWall = windows(4, 4, 0.7, 81)
  const portholes = windows(1, 10, 0.32, 82)
  const towerWall = windows(8, 3, 0.62, 74)
  const libraryWall = windows(3, 10, 0.72, 75)
  // Glazed roof tiles: ridges running down the roof
  const roofTiles = ownTexture(
    painted(
      128,
      76,
      (context, size) => {
        context.fillStyle = tamkangScene.roofGreen
        context.fillRect(0, 0, size, size)
        for (let x = 0; x < size; x += 8) {
          context.fillStyle = 'rgba(0,0,0,0.22)'
          context.fillRect(x, 0, 2, size)
          context.fillStyle = 'rgba(255,255,255,0.18)'
          context.fillRect(x + 3, 0, 2, size)
        }
      },
      level.anisotropy,
    ),
  )
  roofTiles.repeat.set(6, 1)

  // ── The ground: the campus and its hillside, the town's low ground, the riverbed ──
  const west = -1100
  const east = 1500
  const north = -1500
  const south = 1000
  const cell = 20
  const groundGeometry = keep(
    new PlaneGeometry(east - west, south - north, (east - west) / cell, (south - north) / cell),
  )
  groundGeometry.rotateX(-Math.PI / 2)
  groundGeometry.translate((west + east) / 2, 0, (north + south) / 2)
  const groundPosition = groundGeometry.getAttribute('position')
  const lowColour = new Color('#C9BFA0')
  const hillColour = new Color('#9DBF84')
  const white = new Color('#ffffff')
  const groundColours: number[] = []
  for (let index = 0; index < groundPosition.count; index++) {
    const x = groundPosition.getX(index)
    const z = groundPosition.getZ(index)
    const height = tamkangGround(x, z)
    groundPosition.setY(index, height)
    // Grass on the campus and up the foothills, paler down the slope, the town's ground sandier
    const colour =
      height >= 0
        ? white.clone().lerp(hillColour, Math.min(1, height / 80))
        : white.clone().lerp(lowColour, Math.min(1, -height / LOW) * 0.8)
    groundColours.push(colour.r, colour.g, colour.b)
  }
  groundGeometry.setAttribute('color', new Float32BufferAttribute(groundColours, 3))
  groundGeometry.computeVertexNormals()
  const groundUv = groundGeometry.getAttribute('uv')
  for (let index = 0; index < groundUv.count; index++) {
    groundUv.setXY(
      index,
      (groundUv.getX(index) * (east - west)) / 10,
      (groundUv.getY(index) * (south - north)) / 10,
    )
  }
  const grassTile = ownTexture(textures.grass.clone())
  grassTile.repeat.set(1, 1)
  grassTile.needsUpdate = true
  add(
    new Mesh(
      groundGeometry,
      own(
        new MeshLambertMaterial({
          map: grassTile,
          vertexColors: true,
          // Pushed back like the flat ground (trackArt.ts): the road just above always wins
          polygonOffset: true,
          polygonOffsetFactor: 4,
          polygonOffsetUnits: 8,
        }),
      ),
    ),
    false,
  )

  // The river, under all the land (the land hides it where it rises above)
  const water = textures.water
  water.repeat.set(6000 / 16, 6000 / 16)
  const river = new Mesh(
    keep(new PlaneGeometry(6000, 6000)),
    own(new MeshLambertMaterial({ map: water, color: tamkangScene.river })),
  )
  river.rotation.x = -Math.PI / 2
  river.position.set(metres(-300), WATER_LEVEL, metres(900))
  add(river, false)

  // ── The mountain across the river: a long ridge of peaks, hazy with distance ──
  const along = { x: -ACROSS.z, z: -ACROSS.x }
  const ridgeAt = { x: BANK.x + ACROSS.x * metres(1000), z: BANK.z + ACROSS.z * metres(1000) }
  const ridgeLength = 2000
  const ridgeDepth = 720
  const mountainGeometry = keep(new PlaneGeometry(ridgeLength, ridgeDepth, 60, 22))
  mountainGeometry.rotateX(-Math.PI / 2)
  const peaks = [
    [-640, 120, 160],
    [-420, 190, 170],
    [-210, 250, 150],
    [-40, 285, 130],
    [130, 255, 150],
    [330, 215, 170],
    [560, 150, 190],
    [780, 90, 200],
  ] as const
  const mountainPosition = mountainGeometry.getAttribute('position')
  const foot = new Color(tamkangScene.mountain)
  const top = new Color(tamkangScene.mountainFar)
  const fog = new Color(kartThemes.campus.fog)
  const mountainColours: number[] = []
  for (let index = 0; index < mountainPosition.count; index++) {
    const u = mountainPosition.getX(index)
    const w = mountainPosition.getZ(index)
    let height = 0
    for (const [at, high, spread] of peaks) {
      height = Math.max(height, high * Math.exp(-(((u - at) / spread) ** 2)))
    }
    // Ridged, falling to the shore either side
    height *= Math.exp(-((w / 250) ** 2)) * (0.9 + 0.1 * Math.sin(u / 23 + w / 31))
    mountainPosition.setY(index, WATER_LEVEL + 1.5 + height)
    // Haze: the higher, the paler, and all of it partly into the sky's colour
    const colour = foot
      .clone()
      .lerp(top, Math.min(1, height / 280))
      .lerp(fog, 0.35)
    mountainColours.push(colour.r, colour.g, colour.b)
  }
  mountainGeometry.setAttribute('color', new Float32BufferAttribute(mountainColours, 3))
  mountainGeometry.computeVertexNormals()
  const mountain = new Mesh(
    mountainGeometry,
    // Beyond the fog's reach: its haze is painted in, so that every quality sees it
    own(new MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false })),
  )
  mountain.position.set(ridgeAt.x, 0, ridgeAt.z)
  mountain.rotation.y = Math.atan2(along.x, along.z) - Math.PI / 2
  group.add(mountain)

  // ── The lantern avenue: palace lamps down both sides of the straight ──
  const lampSpots: { x: number; z: number }[] = []
  for (let z = metres(-78); z <= metres(150); z += metres(15)) {
    // Clear of the finish gantry's legs
    if (Math.abs(z - track.road[0]!.z) < 6) continue
    for (const side of [-1, 1]) lampSpots.push({ x: side * LAMP_OFFSET, z })
  }
  const lampPosts = new InstancedMesh(
    keep(new CylinderGeometry(0.13, 0.18, 5.2, 8)),
    standard(tamkangScene.lanternFrame),
    lampSpots.length,
  )
  const lampBases = new InstancedMesh(
    keep(new BoxGeometry(0.8, 0.6, 0.8)),
    standard(tamkangScene.stone),
    lampSpots.length,
  )
  const lanterns = new InstancedMesh(
    keep(new BoxGeometry(0.85, 1.15, 0.85)),
    basic(tamkangScene.lanternGlass),
    lampSpots.length,
  )
  const lampCaps = new InstancedMesh(
    keep(new ConeGeometry(0.8, 0.6, 4)),
    standard(tamkangScene.lanternFrame),
    lampSpots.length * 2,
  )
  lampSpots.forEach((spot, index) => {
    place(lampBases, index, spot.x, 0.3, spot.z, [1, 1, 1])
    place(lampPosts, index, spot.x, 2.9, spot.z, [1, 1, 1])
    place(lanterns, index, spot.x, 6.05, spot.z, [1, 1, 1])
    // A little pagoda roof over the lantern, and its base under it
    place(lampCaps, index * 2, spot.x, 6.9, spot.z, [1, 1, 1], Math.PI / 4)
    place(lampCaps, index * 2 + 1, spot.x, 5.4, spot.z, [0.7, -0.4, 0.7], Math.PI / 4)
  })
  add(lampPosts)
  add(lampBases)
  group.add(lanterns)
  add(lampCaps)

  // ── The classrooms either side: pale walls, a red colonnade facing the avenue, green hip roofs ──
  const classrooms = CLASSROOM_BLOCKS.flatMap((z) => [-1, 1].map((side) => ({ side, z })))
  const plain = standard(tamkangScene.wallWhite)
  const classroomFront = own(
    new MeshStandardMaterial({
      color: tamkangScene.wallWhite,
      map: classroomWall,
      roughness: 0.9,
      flatShading: true,
    }),
  )
  classroomWall.repeat.set(4, 1)
  // BoxGeometry's faces: +x, -x, +y, -y, +z, -z
  const walls = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    [classroomFront, classroomFront, plain, plain, plain, plain],
    classrooms.length,
  )
  const roofs = new InstancedMesh(
    keep(hipRoof()),
    own(
      new MeshStandardMaterial({
        color: '#ffffff',
        map: roofTiles,
        roughness: 0.55,
        metalness: 0.1,
        flatShading: true,
      }),
    ),
    classrooms.length,
  )
  const eaves = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    standard(tamkangScene.roofGreenDark),
    classrooms.length,
  )
  const columnsPerRow = Math.floor(CLASSROOM.length / 4) + 1
  const columns = new InstancedMesh(
    keep(new CylinderGeometry(0.42, 0.48, CLASSROOM.height, 8)),
    standard(tamkangScene.column),
    classrooms.length * columnsPerRow,
  )
  const { offset, depth, length, height } = CLASSROOM
  classrooms.forEach(({ side, z }, index) => {
    const x = side * offset
    // The roof's ridge runs along the avenue: the hip roof's x turned to z
    place(walls, index, x, height / 2, z, [depth, height, length])
    place(eaves, index, x, height + 0.3, z, [depth + 5, 0.6, length + 5])
    place(roofs, index, x, height + 0.6, z, [length + 6, 6.5, depth + 6], Math.PI / 2)
    for (let column = 0; column < columnsPerRow; column++) {
      place(
        columns,
        index * columnsPerRow + column,
        x - side * (depth / 2 + 1.6),
        height / 2,
        z - length / 2 + column * 4,
        [1, 1, 1],
      )
    }
  })
  add(walls)
  add(roofs)
  add(eaves)
  add(columns)
  // A paved terrace along the front of each row, under the colonnade
  for (const side of [-1, 1]) {
    const terrace = new Mesh(
      keep(new PlaneGeometry(8, metres(230))),
      own(new MeshLambertMaterial({ map: paving })),
    )
    terrace.rotation.x = -Math.PI / 2
    // Just in front of the colonnade
    terrace.position.set(side * (CLASSROOM.offset - CLASSROOM.depth / 2 - 4), 0.03, metres(35))
    add(terrace, false)
  }
  paving.repeat.set(2, 2)

  // ── The memorial tower on its plaza ──
  const plaza = (x: number, z: number, radius: number) => {
    const disc = new Mesh(
      keep(new CylinderGeometry(radius, radius, 0.06, 40)),
      own(new MeshLambertMaterial({ map: paving })),
    )
    disc.position.set(x, 0.03, z)
    add(disc, false)
  }
  plaza(TOWER.x, TOWER.z, TOWER.size * 0.95)
  const towerFace = own(
    new MeshStandardMaterial({
      color: tamkangScene.tower,
      map: towerWall,
      roughness: 0.85,
      flatShading: true,
    }),
  )
  towerWall.repeat.set(2, 6)
  const towerTop = standard(tamkangScene.tower)
  const towerMaterials = [towerFace, towerFace, towerTop, towerTop, towerFace, towerFace]
  box(TOWER.size + 8, 6, TOWER.size + 8, standard(tamkangScene.stone), TOWER.x, 3, TOWER.z)
  box(TOWER.size, TOWER.height, TOWER.size, towerMaterials, TOWER.x, TOWER.height / 2, TOWER.z)
  // Bands every few floors and a crown on top
  for (let at = 14; at < TOWER.height; at += 15) {
    box(
      TOWER.size + 0.8,
      1.1,
      TOWER.size + 0.8,
      standard(tamkangScene.towerBand),
      TOWER.x,
      at,
      TOWER.z,
    )
  }
  box(TOWER.size * 0.62, 7, TOWER.size * 0.62, towerMaterials, TOWER.x, TOWER.height + 3.5, TOWER.z)
  const spire = new Mesh(
    keep(new ConeGeometry(TOWER.size * 0.4, 9, 4)),
    standard(tamkangScene.towerBand),
  )
  spire.position.set(TOWER.x, TOWER.height + 11.5, TOWER.z)
  spire.rotation.y = Math.PI / 4
  add(spire)

  // ── The library: a long pale block of tall windows over a stone base, a portico in front ──
  const libraryFace = own(
    new MeshStandardMaterial({
      color: tamkangScene.library,
      map: libraryWall,
      roughness: 0.85,
      flatShading: true,
    }),
  )
  libraryWall.repeat.set(3, 1)
  const libraryTop = standard(tamkangScene.library)
  const libraryMaterials = [
    libraryFace,
    libraryFace,
    libraryTop,
    libraryTop,
    libraryFace,
    libraryFace,
  ]
  box(LIBRARY.w + 6, 4, LIBRARY.d + 6, standard(tamkangScene.stone), LIBRARY.x, 2, LIBRARY.z)
  box(
    LIBRARY.w,
    LIBRARY.height,
    LIBRARY.d,
    libraryMaterials,
    LIBRARY.x,
    4 + LIBRARY.height / 2,
    LIBRARY.z,
  )
  box(
    LIBRARY.w * 0.6,
    8,
    LIBRARY.d * 0.7,
    libraryMaterials,
    LIBRARY.x,
    4 + LIBRARY.height + 4,
    LIBRARY.z,
  )
  box(LIBRARY.w + 2, 1.4, LIBRARY.d + 2, libraryTop, LIBRARY.x, 4 + LIBRARY.height, LIBRARY.z)
  // The portico facing the road (+z): a deep roof slab on tall columns, and steps up to it
  const front = LIBRARY.z + LIBRARY.d / 2
  box(46, 2, 12, libraryTop, LIBRARY.x, 22, front + 6)
  const porticoColumns = new InstancedMesh(
    keep(new CylinderGeometry(0.8, 0.9, 18, 10)),
    standard(tamkangScene.wallWhite),
    8,
  )
  for (let column = 0; column < 8; column++)
    place(porticoColumns, column, LIBRARY.x - 19.25 + column * 5.5, 13, front + 10, [1, 1, 1])
  add(porticoColumns)
  for (let step = 0; step < 4; step++)
    box(40, 1, 3, standard(tamkangScene.stone), LIBRARY.x, 3.5 - step, front + 2 + step * 3)
  box(46, 0.6, 30, own(new MeshLambertMaterial({ map: paving })), LIBRARY.x, 0.3, front + 20, false)

  // ── The scroll plaza: white panels curling up in a ring ──
  plaza(SCROLLS.x, SCROLLS.z, SCROLLS.radius)
  const scrollMaterial = own(
    new MeshStandardMaterial({
      color: tamkangScene.scroll,
      roughness: 0.35,
      metalness: 0.05,
      side: DoubleSide,
    }),
  )
  for (let panel = 0; panel < 6; panel++) {
    const angle = (panel / 6) * Math.PI * 2
    const tall = 11 + (panel % 3) * 3
    // A curled sheet: part of an open cylinder, standing on its edge
    const sheet = new Mesh(
      keep(new CylinderGeometry(3.2, 2.6, tall, 16, 1, true, 0, Math.PI * 1.25)),
      scrollMaterial,
    )
    sheet.position.set(
      SCROLLS.x + Math.cos(angle) * 5.5,
      tall / 2 + 0.6,
      SCROLLS.z + Math.sin(angle) * 5.5,
    )
    sheet.rotation.set(0.08 * Math.cos(angle * 3), -angle, 0.1 * Math.sin(angle))
    add(sheet)
  }
  box(14, 0.6, 14, standard(tamkangScene.stone), SCROLLS.x, 0.3, SCROLLS.z)

  // ── The lawn: a striped, mown green ──
  const lawnTexture = ownTexture(
    painted(
      128,
      78,
      (context, size, rand) => {
        context.fillStyle = tamkangScene.lawn
        context.fillRect(0, 0, size, size)
        context.fillStyle = 'rgba(255,255,255,0.12)'
        context.fillRect(0, 0, size / 2, size)
        grain(context, size, rand, 1200, 0.08)
      },
      level.anisotropy,
    ),
  )
  const lawnW = LAWN.maxX - LAWN.minX
  const lawnD = LAWN.maxZ - LAWN.minZ
  lawnTexture.repeat.set(lawnW / 12, 1)
  const lawn = new Mesh(
    keep(new PlaneGeometry(lawnW, lawnD)),
    own(new MeshLambertMaterial({ map: lawnTexture })),
  )
  lawn.rotation.x = -Math.PI / 2
  lawn.position.set((LAWN.minX + LAWN.maxX) / 2, 0.025, (LAWN.minZ + LAWN.maxZ) / 2)
  add(lawn, false)
  // Big old trees round its edge
  const lawnTrees: { x: number; z: number; size: number }[] = []
  for (let index = 0; index < 8; index++) {
    const along = index / 8
    const onLeft = index % 2 === 0
    lawnTrees.push({
      x: onLeft ? LAWN.minX + 4 : LAWN.maxX - 4,
      z: LAWN.minZ + 10 + along * (lawnD - 20),
      size: 1.6 + random() * 0.6,
    })
  }
  const lawnTrunks = new InstancedMesh(
    keep(new CylinderGeometry(0.35, 0.5, 4, 7)),
    standard(kartScene.trunk),
    lawnTrees.length,
  )
  const lawnCrowns = new InstancedMesh(
    keep(new SphereGeometry(3.2, 8, 6)),
    standard(kartScene.leaf),
    lawnTrees.length,
  )
  lawnTrees.forEach((tree, index) => {
    place(lawnTrunks, index, tree.x, 2 * tree.size, tree.z, [tree.size, tree.size, tree.size])
    place(lawnCrowns, index, tree.x, 5.6 * tree.size, tree.z, [
      tree.size,
      tree.size * 0.8,
      tree.size,
    ])
  })
  add(lawnTrunks)
  add(lawnCrowns)

  // ── The business tower: glass over a podium ──
  const glassFace = own(
    new MeshStandardMaterial({
      color: tamkangScene.glassTower,
      map: glassWall,
      roughness: 0.25,
      metalness: 0.4,
      flatShading: true,
    }),
  )
  glassWall.repeat.set(3, 8)
  officeWall.repeat.set(2.5, 2)
  portholes.repeat.set(3, 1)
  const glassTop = standard(tamkangScene.glassTower)
  box(
    BUSINESS.podium,
    10,
    BUSINESS.podium,
    [plain, plain, plain, plain, plain, plain],
    BUSINESS.x,
    5,
    BUSINESS.z,
  )
  box(
    BUSINESS.size,
    BUSINESS.height,
    BUSINESS.size,
    [glassFace, glassFace, glassTop, glassTop, glassFace, glassFace],
    BUSINESS.x,
    10 + BUSINESS.height / 2,
    BUSINESS.z,
  )
  // White fins up the corners and a crown
  for (const [cx, cz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    box(
      1.6,
      BUSINESS.height + 6,
      1.6,
      plain,
      BUSINESS.x + (cx * BUSINESS.size) / 2,
      10 + (BUSINESS.height + 6) / 2,
      BUSINESS.z + (cz * BUSINESS.size) / 2,
    )
  }
  box(
    BUSINESS.size * 0.7,
    5,
    BUSINESS.size * 0.7,
    plain,
    BUSINESS.x,
    10 + BUSINESS.height + 2.5,
    BUSINESS.z,
  )

  // ── The museum: a white ship on land, bow to the west ──
  const ship = new Group()
  const hull = new Mesh(keep(shipHull()), standard(tamkangScene.museumHull))
  hull.scale.set(MUSEUM.beam, 9, MUSEUM.length)
  ship.add(shadowed(hull))
  // A blue stripe along the hull and the decks stepping up to a bridge, a red funnel and a mast
  const stripe = new Mesh(
    keep(new BoxGeometry(MUSEUM.beam * 0.93, 1.2, MUSEUM.length * 0.7)),
    standard(tamkangScene.museumStripe),
  )
  stripe.position.set(0, 6.2, 8)
  ship.add(shadowed(stripe))
  const deckFace = own(
    new MeshStandardMaterial({
      color: tamkangScene.museumHull,
      map: portholes,
      roughness: 0.6,
      flatShading: true,
    }),
  )
  const decks = [
    [MUSEUM.beam * 0.86, 5, 30, 11.5, 10],
    [MUSEUM.beam * 0.72, 4.5, 20, 16.25, 12],
    [MUSEUM.beam * 0.58, 4, 10, 20.5, 14],
  ] as const
  for (const [w, h, d, y, z] of decks) {
    const deck = new Mesh(keep(new BoxGeometry(w, h, d)), deckFace)
    deck.position.set(0, y, z)
    ship.add(shadowed(deck))
  }
  const funnel = new Mesh(
    keep(new CylinderGeometry(1.8, 2.1, 7, 12)),
    standard(tamkangScene.museumFunnel),
  )
  funnel.position.set(0, 26, 20)
  ship.add(shadowed(funnel))
  const mast = new Mesh(keep(new CylinderGeometry(0.25, 0.3, 14, 6)), standard(kartScene.metal))
  mast.position.set(0, 25, 2)
  ship.add(shadowed(mast))
  ship.position.set(MUSEUM.x, 0.5, MUSEUM.z)
  // Lying east-west, its bow (-z) to the west
  ship.rotation.y = Math.PI / 2
  group.add(ship)
  box(MUSEUM.length + 6, 1, MUSEUM.beam + 8, standard(tamkangScene.stone), MUSEUM.x, 0.5, MUSEUM.z)

  // ── The name stone by the avenue: plain words, no emblem ──
  const signCanvas = document.createElement('canvas')
  signCanvas.width = 512
  signCanvas.height = 192
  const signContext = signCanvas.getContext('2d')
  if (signContext) {
    signContext.fillStyle = tamkangScene.stone
    signContext.fillRect(0, 0, 512, 192)
    signContext.fillStyle = tamkangScene.signText
    signContext.textAlign = 'center'
    signContext.textBaseline = 'middle'
    signContext.font = 'bold 96px serif'
    // Scenery, not interface: the stone reads the same in either language, like the real place's
    signContext.fillText('淡江大學', 256, 82) // i18n-ignore
    signContext.font = 'bold 30px sans-serif'
    signContext.fillText('TAMKANG UNIVERSITY', 256, 160)
  }
  const signTexture = ownTexture(new CanvasTexture(signCanvas))
  signTexture.colorSpace = SRGBColorSpace
  const stoneMaterial = standard(tamkangScene.stone)
  const signFace = own(new MeshStandardMaterial({ map: signTexture, roughness: 0.9 }))
  // Its words face the avenue (-x)
  box(
    1.6,
    3.6,
    9.6,
    [stoneMaterial, signFace, stoneMaterial, stoneMaterial, stoneMaterial, stoneMaterial],
    SIGN.x,
    2.3,
    SIGN.z,
  )
  box(2.6, 0.5, 11, standard(tamkangScene.stoneDark), SIGN.x, 0.25, SIGN.z)

  // ── The stairway down the hill to the town, with its rails, and an arch at the top ──
  const stepRun = 1.5
  const steps = Math.floor(STAIRS.length / stepRun)
  const stairSteps = new InstancedMesh(
    keep(new BoxGeometry(stepRun + 0.05, 1, STAIRS.width)),
    standard(tamkangScene.stone),
    steps,
  )
  const railPosts: { x: number; y: number; z: number }[] = []
  for (let step = 0; step < steps; step++) {
    const x = CAMPUS_WEST + 4 - step * stepRun
    const surface = tamkangGround(x - stepRun / 2, STAIRS.z) + 0.25
    // Deep enough to meet the ground beneath whichever way it rolls
    place(stairSteps, step, x - stepRun / 2, surface - 1.5, STAIRS.z, [1, 3, 1])
    if (step % 4 === 0) {
      for (const side of [-1, 1])
        railPosts.push({
          x: x - stepRun / 2,
          y: surface,
          z: STAIRS.z + side * (STAIRS.width / 2 + 0.2),
        })
    }
  }
  add(stairSteps, false)
  const posts = new InstancedMesh(
    keep(new BoxGeometry(0.15, 1.1, 0.15)),
    standard(tamkangScene.rail),
    railPosts.length,
  )
  railPosts.forEach((post, index) => place(posts, index, post.x, post.y + 0.55, post.z, [1, 1, 1]))
  add(posts, false)
  // The handrails: a bar from each post to the next on the same side
  const rails = new InstancedMesh(
    keep(new BoxGeometry(1, 0.1, 0.1)),
    standard(tamkangScene.rail),
    Math.max(0, railPosts.length - 2),
  )
  for (let index = 0; index + 2 < railPosts.length; index++) {
    const a = railPosts[index]!
    const b = railPosts[index + 2]!
    const run = Math.hypot(b.x - a.x, b.y - a.y)
    turned(
      rails,
      index,
      [(a.x + b.x) / 2, (a.y + b.y) / 2 + 1.1, a.z],
      [run, 1, 1],
      [0, 0, Math.atan2(b.y - a.y, b.x - a.x)],
    )
  }
  add(rails, false)
  for (const side of [-1, 1])
    box(1.6, 7, 1.6, stoneMaterial, CAMPUS_WEST + 5, 3.5, STAIRS.z + side * (STAIRS.width / 2 + 1))
  box(
    1.8,
    1.4,
    STAIRS.width + 4,
    own(new MeshStandardMaterial({ color: tamkangScene.roofGreen, map: roofTiles })),
    CAMPUS_WEST + 5,
    7.4,
    STAIRS.z,
  )
  box(
    12,
    0.08,
    STAIRS.width,
    own(new MeshLambertMaterial({ map: paving })),
    CAMPUS_WEST + 10,
    0.04,
    STAIRS.z,
    false,
  )

  // ── The campus's other buildings, and the town on the low ground below ──
  const officeFace = own(
    new MeshStandardMaterial({
      color: '#ffffff',
      map: officeWall,
      roughness: 0.9,
      flatShading: true,
    }),
  )
  const officeTop = standard(tamkangScene.stone)
  const keepOut = (x: number, z: number, margin: number) =>
    TAMKANG_LANDMARKS.some((one) => inside(one, x, z, margin))
  const buildings: {
    x: number
    z: number
    w: number
    d: number
    h: number
    base: number
    colour: string
  }[] = []
  // On the campus: big blocks, oversized like the rest
  for (const spot of scatter(track.road, {
    seed: 79,
    count: count(34, 12),
    box: { minX: CAMPUS_WEST + 20, maxX: metres(360), minZ: metres(-460), maxZ: CAMPUS_SOUTH - 20 },
    clearance: 22,
    spacing: 44,
    fits: (x, z) => !keepOut(x, z, 22) && !(x < CAMPUS_WEST + 40 && Math.abs(z - STAIRS.z) < 30),
  })) {
    buildings.push({
      x: spot.x,
      z: spot.z,
      w: 22 + spot.a * 18,
      d: 16 + spot.b * 12,
      h: 14 + Math.round(spot.a * 5) * 5,
      base: 0,
      colour: tamkangScene.walls[Math.floor(spot.b * tamkangScene.walls.length)]!,
    })
  }
  // In the town: smaller houses on the slope and the low ground, clear of the river
  for (const spot of scatter(track.road, {
    seed: 80,
    // 2026-11-14: more of the town, so the slopes round the campus are not bare
    count: count(320, 70),
    box: { minX: metres(-820), maxX: metres(700), minZ: metres(-520), maxZ: metres(900) },
    clearance: 40,
    spacing: 14,
    fits: (x, z) =>
      tamkangGround(x, z) < -3 &&
      !inTamkangRiver(x, z, 14) &&
      Math.abs(z - STAIRS.z) > 12 &&
      tamkangGround(x, z) > -LOW - 1,
  })) {
    const w = 8 + spot.a * 6
    const d = 8 + spot.b * 5
    const corners = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => tamkangGround(spot.x + (sx * w) / 2, spot.z + (sz * d) / 2)),
    )
    buildings.push({
      x: spot.x,
      z: spot.z,
      w,
      d,
      h: 6 + Math.floor(spot.b * 4) * 3,
      base: Math.min(...corners) - 0.5,
      colour: tamkangScene.walls[Math.floor(spot.a * tamkangScene.walls.length)]!,
    })
  }
  const blocks = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    [officeFace, officeFace, officeTop, officeTop, officeFace, officeFace],
    buildings.length,
  )
  const roofBoxes = new InstancedMesh(
    keep(new BoxGeometry(1, 1, 1)),
    standard(tamkangScene.stoneDark),
    buildings.length,
  )
  buildings.forEach((one, index) => {
    const turn = one.base < 0 ? (one.x * 0.013) % 0.6 : 0
    place(blocks, index, one.x, one.base + one.h / 2, one.z, [one.w, one.h, one.d], turn)
    tinted(blocks, index, one.colour)
    place(
      roofBoxes,
      index,
      one.x + one.w * 0.15,
      one.base + one.h + 1,
      one.z,
      [one.w * 0.3, 2, one.d * 0.4],
      turn,
    )
    tinted(roofBoxes, index, tamkangScene.townRoofs[index % tamkangScene.townRoofs.length]!)
  })
  add(blocks, false)
  add(roofBoxes, false)

  return {
    update(seconds) {
      water.offset.set(seconds * 0.008, seconds * 0.025)
    },
  }
}
