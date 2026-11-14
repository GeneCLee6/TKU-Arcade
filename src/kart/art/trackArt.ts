// e8-t05b: a track's art, built in code from its JSON: the road and its kerbs, crash barriers on the
// physics walls, grass, a sky, the finish gantry, and scenery placed where the track leaves room
// (shared/kart/scenery.ts). Riverside gets its river, bridge, town and hills; the harbour (N1) its
// sea, breakwaters, boats and hillside town at sunset (harbourArt.ts). All of it original: a
// low-poly look of our own (the PRD's Q4), no model or image files.
import {
  BackSide,
  DoubleSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type Texture,
} from 'three'
import { roadClearance, roadDistances, scatter } from '../../../shared/kart/scenery.ts'
import { roadDirection, trackBounds, type Track } from '../../../shared/kart/track.ts'
import { kartScene, kartThemes, type KartTheme } from '../../styles/kartTokens.ts'
import {
  buildHarbour,
  HARBOUR_COAST,
  HARBOUR_SHORE,
  harbourGround,
  harbourTreeFits,
  inHarbourSea,
} from './harbourArt.ts'
import {
  buildTamkang,
  inTamkangRiver,
  tamkangFestivalFits,
  tamkangGround,
  tamkangTreeFits,
} from './tamkangArt.ts'
import { buildFestival } from './festival.ts'
import {
  ASPHALT_LENGTH,
  BARRIER_LENGTH,
  KERB_LENGTH,
  painted,
  trackTextures,
  type TrackTextures,
} from './textures.ts'

/** How much the art does: set by the quality option (quality.ts) */
export interface ArtLevel {
  /** 0 to 1: how much scenery */
  readonly density: number
  readonly shadows: boolean
  readonly anisotropy: number
}

export interface TrackArt {
  readonly group: Group
  /** Every frame: the water flows */
  update(seconds: number): void
  dispose(): void
}

/** A track's sky and light: the harbour's sunset, or the sunny afternoon of every other track */
export const themeOf = (track: Pick<Track, 'id'>): KartTheme =>
  track.id === 'harbour'
    ? kartThemes.sunset
    : track.id === 'tamkang'
      ? kartThemes.campus
      : kartThemes.day

/** What a track's own scenery (harbourArt.ts) builds with: shared, and freed with the rest */
export interface ArtKit {
  readonly track: Track
  readonly level: ArtLevel
  readonly group: Group
  readonly textures: TrackTextures
  keep<T extends BufferGeometry>(geometry: T): T
  own<T extends Material>(material: T): T
  /** A texture freed with the art */
  ownTexture<T extends Texture>(texture: T): T
  standard(color: string, map?: Texture): MeshStandardMaterial
  shadowed<T extends Mesh | InstancedMesh>(object: T, cast?: boolean): T
  place(
    instances: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number],
    turn?: number,
  ): void
}

const BARRIER_HEIGHT = 0.95
const BARRIER_THICKNESS = 0.45
const KERB_WIDTH = 0.9
const LIFT = { road: 0.05, kerb: 0.07, line: 0.09 }

/** A mesh made of plain arrays, normals worked out */
function mesh(positions: number[], uvs: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Each road point's left and right edge, `inset` metres in from the kerb line */
function edges(track: Pick<Track, 'road'>, inset = 0) {
  return track.road.map((point, index) => {
    const { dx, dz } = roadDirection(track.road, index)
    const half = point.width / 2 - inset
    return {
      left: { x: point.x + dz * half, z: point.z - dx * half },
      right: { x: point.x - dz * half, z: point.z + dx * half },
      // Outwards from the road on each side
      leftOut: { x: dz, z: -dx },
      rightOut: { x: -dz, z: dx },
    }
  })
}

/** A strip between two lines of points round the loop, u across it, v along it every `every` m */
function strip(
  inner: { x: number; z: number }[],
  outer: { x: number; z: number }[],
  y: number,
  along: number[],
  length: number,
  every: number,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const count = inner.length
  // One more column than points, so the texture's last repeat closes the loop without a seam
  for (let index = 0; index <= count; index++) {
    const at = index % count
    const v = (index === count ? length : along[at]!) / every
    positions.push(inner[at]!.x, y, inner[at]!.z, outer[at]!.x, y, outer[at]!.z)
    uvs.push(0, v, 1, v)
    if (index < count) {
      const a = index * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  return mesh(positions, uvs, indices)
}

/** A low wall standing on a line of points round the loop, its face towards the road */
function barrier(
  line: { x: number; z: number }[],
  out: { x: number; z: number }[],
  along: number[],
  length: number,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const count = line.length
  for (let index = 0; index <= count; index++) {
    const at = index % count
    const p = line[at]!
    const o = out[at]!
    const u = (index === count ? length : along[at]!) / BARRIER_LENGTH
    const backX = p.x + o.x * BARRIER_THICKNESS
    const backZ = p.z + o.z * BARRIER_THICKNESS
    // Face (bottom, top), top's back edge, back face bottom
    positions.push(
      p.x,
      0,
      p.z,
      p.x,
      BARRIER_HEIGHT,
      p.z,
      backX,
      BARRIER_HEIGHT,
      backZ,
      backX,
      0,
      backZ,
    )
    uvs.push(u, 0, u, 0.82, u, 1, u, 0)
    if (index < count) {
      const a = index * 4
      const b = a + 4
      indices.push(a, b, a + 1, a + 1, b, b + 1) // face
      indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2) // top
      indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3) // back
    }
  }
  return mesh(positions, uvs, indices)
}

/** A dome from the horizon's haze to the deep colour overhead */
function sky(theme: KartTheme): Mesh {
  const geometry = new SphereGeometry(1400, 24, 12)
  const top = new Color(theme.skyTop)
  const middle = new Color(theme.skyMiddle)
  const horizon = new Color(theme.skyHorizon)
  const day = theme === kartThemes.day
  const colours: number[] = []
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index++) {
    const height = Math.max(0, position.getY(index) / 1400)
    // The day sky is K1's two-colour blend, as it was; others go through the middle colour
    const t = Math.pow(height, 0.6)
    const colour = day
      ? horizon.clone().lerp(top, t)
      : t < 0.45
        ? horizon.clone().lerp(middle, t / 0.45)
        : middle.clone().lerp(top, (t - 0.45) / 0.55)
    colours.push(colour.r, colour.g, colour.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: BackSide,
    fog: false,
    depthWrite: false,
  })
  const dome = new Mesh(geometry, material)
  dome.renderOrder = -1
  return dome
}

/** The sun low on the sky: a bright disc in a soft glow, one plane facing the middle of the dome */
function sunDisc(
  theme: KartTheme,
  keep: <T extends BufferGeometry>(geometry: T) => T,
  own: <T extends Material>(material: T) => T,
  ownTexture: <T extends Texture>(texture: T) => T,
): Mesh {
  const disc = theme.sunDisc ?? '#ffffff'
  const glowColour = theme.sunGlow ?? disc
  const glow = ownTexture(
    painted(
      256,
      31,
      (context, size) => {
        const middle = size / 2
        const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle)
        gradient.addColorStop(0, disc)
        gradient.addColorStop(0.15, disc)
        gradient.addColorStop(0.19, glowColour)
        gradient.addColorStop(0.45, `${glowColour}55`)
        gradient.addColorStop(1, `${glowColour}00`)
        context.fillStyle = gradient
        context.fillRect(0, 0, size, size)
      },
      1,
    ),
  )
  const mesh = new Mesh(
    keep(new PlaneGeometry(520, 520)),
    own(new MeshBasicMaterial({ map: glow, transparent: true, fog: false, depthWrite: false })),
  )
  const [x, y, z] = theme.sunDirection
  const length = Math.hypot(x, y, z)
  mesh.position.set((x / length) * 1300, (y / length) * 1300, (z / length) * 1300)
  mesh.lookAt(0, 0, 0)
  return mesh
}

export function buildTrackArt(track: Track, level: ArtLevel): TrackArt {
  const group = new Group()
  const textures = trackTextures(level.anisotropy)
  const theme = themeOf(track)
  const harbour = track.id === 'harbour'
  // The campus on its hilltop (2026-11-14): its own ground, falling away beyond the campus
  const tamkang = track.id === 'tamkang'
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const extraTextures: Texture[] = []
  const keep = <T extends BufferGeometry>(geometry: T) => (geometries.push(geometry), geometry)
  const own = <T extends Material>(material: T) => (materials.push(material), material)
  const ownTexture = <T extends Texture>(texture: T) => (extraTextures.push(texture), texture)
  /** How high the ground is: flat but for the harbour's hillside */
  const groundAt = harbour ? harbourGround : tamkang ? tamkangGround : () => 0
  const standard = (color: string, map?: Texture) =>
    own(
      new MeshStandardMaterial({
        color,
        map: map ?? null,
        roughness: 0.9,
        metalness: 0,
        flatShading: true,
      }),
    )
  const shadowed = <T extends Mesh | InstancedMesh>(object: T, cast = true) => {
    object.castShadow = cast && level.shadows
    object.receiveShadow = level.shadows
    return object
  }

  const { along, length } = roadDistances(track.road)
  const sides = edges(track)
  const kerbInner = edges(track, KERB_WIDTH)

  // ── The ground ──
  const box = trackBounds(track)
  const centreX = (box.minX + box.maxX) / 2
  const centreZ = (box.minZ + box.maxZ) / 2
  const groundSize = 2400
  // At the harbour the land ends at the quay and the beach; the sea lies lower, beyond them
  const groundNorth = harbour ? HARBOUR_COAST : centreZ - groundSize / 2
  const groundDepth = centreZ + groundSize / 2 - groundNorth
  const groundWest = harbour ? HARBOUR_SHORE : centreX - groundSize / 2
  const groundWidth = centreX + groundSize / 2 - groundWest
  const ground = new Mesh(
    keep(new PlaneGeometry(groundWidth, groundDepth)),
    own(
      new MeshLambertMaterial({
        map: textures.grass,
        // Pushed back in the depth buffer: the road lying just above must always win, at any distance
        polygonOffset: true,
        polygonOffsetFactor: 4,
        polygonOffsetUnits: 8,
      }),
    ),
  )
  textures.grass.repeat.set(groundWidth / 10, groundDepth / 10)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(groundWest + groundWidth / 2, 0, groundNorth + groundDepth / 2)
  // The campus brings its own ground, with the hillside in it
  if (!tamkang) group.add(shadowed(ground, false))
  const dome = sky(theme)
  keep(dome.geometry)
  own(dome.material as Material)
  group.add(dome)
  if (theme.sunDisc && theme.sunGlow) group.add(sunDisc(theme, keep, own, ownTexture))

  // ── The road, kerbs and barriers ──
  const roadGeometry = keep(
    strip(
      sides.map((side) => side.left),
      sides.map((side) => side.right),
      LIFT.road,
      along,
      length,
      ASPHALT_LENGTH,
    ),
  )
  // The asphalt's u runs kerb to kerb: v alone repeats
  const road = new Mesh(
    roadGeometry,
    own(new MeshLambertMaterial({ map: textures.asphalt, side: DoubleSide })),
  )
  group.add(shadowed(road, false))
  // Both sides: a strip's winding depends on which way the road bends, and must never hide it
  const kerbMaterial = own(new MeshLambertMaterial({ map: textures.kerb, side: DoubleSide }))
  for (const side of ['left', 'right'] as const) {
    const kerb = new Mesh(
      keep(
        strip(
          sides.map((edge) => edge[side]),
          kerbInner.map((edge) => edge[side]),
          LIFT.kerb,
          along,
          length,
          KERB_LENGTH,
        ),
      ),
      kerbMaterial,
    )
    group.add(shadowed(kerb, false))
    const wall = new Mesh(
      keep(
        barrier(
          sides.map((edge) => edge[side]),
          sides.map((edge) => edge[`${side}Out`]),
          along,
          length,
        ),
      ),
      own(new MeshLambertMaterial({ map: textures.barrier, side: DoubleSide })),
    )
    group.add(shadowed(wall))
  }
  for (const extra of track.walls) {
    const span = Math.hypot(extra.bx - extra.ax, extra.bz - extra.az)
    const block = new Mesh(
      keep(new BoxGeometry(span, BARRIER_HEIGHT, BARRIER_THICKNESS)),
      standard(kartScene.barrier, textures.barrier),
    )
    block.position.set((extra.ax + extra.bx) / 2, BARRIER_HEIGHT / 2, (extra.az + extra.bz) / 2)
    block.rotation.y = -Math.atan2(extra.bz - extra.az, extra.bx - extra.ax)
    group.add(shadowed(block))
  }

  // ── The finish: a checkered band and a gantry over it ──
  const finish = track.gates[0]
  if (finish) {
    const span = Math.hypot(finish.bx - finish.ax, finish.bz - finish.az)
    const angle = -Math.atan2(finish.bz - finish.az, finish.bx - finish.ax)
    const midX = (finish.ax + finish.bx) / 2
    const midZ = (finish.az + finish.bz) / 2
    const band = new Mesh(
      keep(new PlaneGeometry(span, 2.4)),
      own(new MeshLambertMaterial({ map: textures.checker })),
    )
    textures.checker.repeat.set(span / 2.4, 1)
    band.rotation.set(-Math.PI / 2, 0, angle)
    band.position.set(midX, LIFT.line, midZ)
    group.add(shadowed(band, false))
    const gantry = new Group()
    const steel = standard(kartScene.metal)
    for (const end of [-1, 1]) {
      const pillar = new Mesh(keep(new BoxGeometry(0.7, 6.5, 0.7)), steel)
      pillar.position.set(end * (span / 2 + 1.2), 3.25, 0)
      gantry.add(shadowed(pillar))
    }
    const beam = new Mesh(
      keep(new BoxGeometry(span + 3.4, 1.6, 0.8)),
      standard('#ffffff', textures.checker),
    )
    beam.position.set(0, 6.3, 0)
    gantry.add(shadowed(beam))
    gantry.position.set(midX, 0, midZ)
    gantry.rotation.y = angle
    group.add(gantry)
  }

  // ── Scenery ──
  const river = track.id === 'riverside' ? { minX: box.minX - 120, maxX: box.minX - 42 } : null
  const inRiver = (x: number) => river !== null && x > river.minX - 6 && x < river.maxX + 6
  const reach = {
    minX: box.minX - 160,
    maxX: box.maxX + 160,
    minZ: box.minZ - 160,
    maxZ: box.maxZ + 160,
  }
  const dummy = new Object3D()
  const place = (
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

  // Trees: round broadleaves and pointed pines, in two greens
  const trees = scatter(track.road, {
    seed: 7,
    count: Math.round(420 * level.density),
    box: reach,
    clearance: 7,
    spacing: 4.5,
    fits: (x, z) =>
      !inRiver(x) && (!harbour || harbourTreeFits(x, z)) && (!tamkang || tamkangTreeFits(x, z)),
  })
  const trunks = new InstancedMesh(
    keep(new CylinderGeometry(0.22, 0.32, 2.2, 6)),
    standard(kartScene.trunk),
    trees.length,
  )
  const round = trees.filter((tree) => tree.a < 0.6)
  const pointed = trees.filter((tree) => tree.a >= 0.6)
  const crowns = new InstancedMesh(
    keep(new IcosahedronGeometry(1.8, 0)),
    standard(kartScene.leaf),
    round.length,
  )
  const pines = new InstancedMesh(
    keep(new ConeGeometry(1.6, 4.4, 7)),
    standard(kartScene.leafLight),
    pointed.length,
  )
  trees.forEach((tree, index) => {
    const size = 0.8 + tree.b * 0.9
    place(trunks, index, tree.x, groundAt(tree.x, tree.z) + 1.1 * size, tree.z, [size, size, size])
  })
  round.forEach((tree, index) => {
    const size = 0.8 + tree.b * 0.9
    place(
      crowns,
      index,
      tree.x,
      groundAt(tree.x, tree.z) + 3.2 * size,
      tree.z,
      [size, size * 1.1, size],
      tree.a * 6,
    )
  })
  pointed.forEach((tree, index) => {
    const size = 0.8 + tree.b * 0.9
    place(
      pines,
      index,
      tree.x,
      groundAt(tree.x, tree.z) + 4 * size,
      tree.z,
      [size, size, size],
      tree.a * 6,
    )
  })
  for (const instances of [trunks, crowns, pines]) group.add(shadowed(instances))

  // Hills all round, far off, the fog turning them blue
  const hills = new InstancedMesh(keep(new ConeGeometry(1, 1, 7)), standard(kartScene.hill), 18)
  const hillsFar = new InstancedMesh(
    keep(new ConeGeometry(1, 1, 6)),
    standard(kartScene.hillFar),
    14,
  )
  for (let index = 0; index < 18; index++) {
    const angle = (index / 18) * Math.PI * 2 + 0.3
    const distance = 620 + (index % 3) * 70
    const radius = 140 + ((index * 37) % 90)
    place(
      hills,
      index,
      centreX + Math.cos(angle) * distance,
      0,
      centreZ + Math.sin(angle) * distance,
      [radius, 70 + ((index * 53) % 80), radius],
      index,
    )
  }
  for (let index = 0; index < 14; index++) {
    const angle = (index / 14) * Math.PI * 2
    const distance = 900
    const radius = 220 + ((index * 41) % 120)
    place(
      hillsFar,
      index,
      centreX + Math.cos(angle) * distance,
      0,
      centreZ + Math.sin(angle) * distance,
      [radius, 110 + ((index * 29) % 110), radius],
    )
  }
  // A cone's centre is half its height up: lift each by half of its own height
  for (const instances of [hills, hillsFar]) {
    const matrix = new Matrix4()
    for (let index = 0; index < instances.count; index++) {
      instances.getMatrixAt(index, matrix)
      // At the harbour, the hills out in the sea are low islands, so that the horizon stays open
      if (harbour && inHarbourSea(matrix.elements[12]!, matrix.elements[14]!, 40)) {
        matrix.scale(new Vector3(0.45, 0.22, 0.45))
      }
      // At the campus, none stands in the river: the mountain across it is its own (tamkangArt.ts)
      if (tamkang && inTamkangRiver(matrix.elements[12]!, matrix.elements[14]!, 160)) {
        matrix.scale(new Vector3(0.001, 0.001, 0.001))
      }
      // The y scale is the cone's height; its centre sits half of that up, on the ground
      const base = tamkang ? tamkangGround(matrix.elements[12]!, matrix.elements[14]!) : 0
      matrix.elements[13] = matrix.elements[5]! / 2 - 2 + base
      instances.setMatrixAt(index, matrix)
    }
    group.add(instances)
  }

  // Lamp posts along the straights: where the road runs straight for a while
  const lamps: { x: number; z: number; turn: number }[] = []
  const lampEvery = level.density < 0.5 ? 60 : 36
  let lastLamp = -Infinity
  track.road.forEach((point, index) => {
    // The campus has its own palace lamps instead
    if (tamkang || along[index]! - lastLamp < lampEvery) return
    const a = roadDirection(track.road, index)
    const b = roadDirection(track.road, (index + 3) % track.road.length)
    if (a.dx * b.dx + a.dz * b.dz < 0.995) return
    lastLamp = along[index]!
    for (const side of [1, -1]) {
      const offset = point.width / 2 + 2.2
      lamps.push({
        x: point.x + side * a.dz * offset,
        z: point.z - side * a.dx * offset,
        turn: Math.atan2(a.dx, a.dz) + (side > 0 ? 0 : Math.PI),
      })
    }
  })
  const poles = new InstancedMesh(
    keep(new CylinderGeometry(0.12, 0.16, 7, 6)),
    standard(kartScene.metal),
    lamps.length,
  )
  const heads = new InstancedMesh(
    keep(new BoxGeometry(1.4, 0.25, 0.5)),
    own(new MeshBasicMaterial({ color: kartScene.lamp })),
    lamps.length,
  )
  lamps.forEach((lamp, index) => {
    place(poles, index, lamp.x, 3.5, lamp.z, [1, 1, 1])
    dummy.position.set(lamp.x, 6.9, lamp.z)
    dummy.rotation.set(0, lamp.turn + Math.PI / 2, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    heads.setMatrixAt(index, dummy.matrix)
  })
  group.add(shadowed(poles), heads)

  // Tyre stacks on the outside of the tightest bends
  const stacks: { x: number; z: number }[] = []
  track.road.forEach((point, index) => {
    const a = roadDirection(track.road, index)
    const b = roadDirection(track.road, (index + 2) % track.road.length)
    const turn = a.dx * b.dz - a.dz * b.dx
    if (Math.abs(turn) < 0.12 || index % 2 !== 0) return
    // Outside is the side the road bends away from
    const side = turn > 0 ? 1 : -1
    const offset = point.width / 2 + 1.4
    const x = point.x + side * a.dz * offset
    const z = point.z - side * a.dx * offset
    if (roadClearance(track.road, x, z) > 0.6) stacks.push({ x, z })
  })
  const tyres = new InstancedMesh(
    keep(new TorusGeometry(0.42, 0.2, 6, 10)),
    standard(kartScene.tyre),
    stacks.length * 3,
  )
  stacks.forEach((stack, index) => {
    for (let level = 0; level < 3; level++) {
      dummy.position.set(stack.x, 0.2 + level * 0.38, stack.z)
      dummy.rotation.set(Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      tyres.setMatrixAt(index * 3 + level, dummy.matrix)
    }
  })
  group.add(shadowed(tyres))

  // A grandstand beside the start, facing the line; the campus has its classrooms there instead
  if (finish && !tamkang) {
    const start = track.road[0]!
    const { dx, dz } = roadDirection(track.road, 0)
    const stand = new Group()
    for (let row = 0; row < 5; row++) {
      const step = new Mesh(
        keep(new BoxGeometry(40, 0.6, 1.4)),
        standard(row % 2 === 0 ? kartScene.seat : kartScene.kerbWhite),
      )
      step.position.set(0, 0.3 + row * 0.6, row * 1.4)
      stand.add(shadowed(step))
    }
    const back = new Mesh(keep(new BoxGeometry(40, 5, 0.4)), standard(kartScene.metal))
    back.position.set(0, 2.5, 7.2)
    const roof = new Mesh(keep(new BoxGeometry(42, 0.3, 8.5)), standard(kartScene.barrier))
    roof.position.set(0, 5.3, 3.4)
    stand.add(shadowed(back), shadowed(roof))
    const side = 1
    const offset = start.width / 2 + 10
    stand.position.set(
      start.x - side * dz * offset - dx * 10,
      0,
      start.z + side * dx * offset - dz * 10,
    )
    stand.rotation.y = Math.atan2(dx, dz) - Math.PI / 2
    if (roadClearance(track.road, stand.position.x, stand.position.z) > 4) group.add(stand)
  }

  // ── Race-day dressing on every track: arch, flags, grandstands and crowds, flowers, a Ferris
  // wheel, balloons, a skyline (festival.ts) ──
  const festival = buildFestival(
    { track, level, group, textures, keep, own, ownTexture, standard, shadowed, place },
    {
      groundAt,
      fits: (x, z) =>
        harbour ? !inHarbourSea(x, z, 8) : tamkang ? tamkangFestivalFits(x, z) : !inRiver(x),
    },
  )

  // ── Riverside: the river, its banks, a bridge, and a brick town beyond ──
  let water: Texture | null = null
  if (river) {
    const width = river.maxX - river.minX
    const span = box.maxZ - box.minZ + 1400
    const surface = new Mesh(
      keep(new PlaneGeometry(width, span)),
      own(new MeshLambertMaterial({ map: textures.water })),
    )
    textures.water.repeat.set(width / 14, span / 14)
    surface.rotation.x = -Math.PI / 2
    surface.position.set((river.minX + river.maxX) / 2, 0.05, centreZ)
    group.add(shadowed(surface, false))
    water = textures.water
    for (const bankX of [river.minX - 3, river.maxX + 3]) {
      const bank = new Mesh(
        keep(new PlaneGeometry(6, span)),
        own(new MeshLambertMaterial({ map: textures.sand })),
      )
      textures.sand.repeat.set(1, span / 6)
      bank.rotation.x = -Math.PI / 2
      bank.position.set(bankX, 0.04, centreZ)
      group.add(shadowed(bank, false))
    }
    // An arch footbridge over the river, by the start
    const bridge = new Group()
    const deck = new Mesh(keep(new BoxGeometry(width + 16, 0.6, 4)), standard(kartScene.mortar))
    deck.position.y = 5
    const arch = new Mesh(
      keep(new TorusGeometry(width / 2, 0.5, 6, 24, Math.PI)),
      standard(kartScene.kerbRed),
    )
    arch.position.y = 5
    // A low, wide arch: flattened to a fifth of its span
    arch.scale.y = 0.2
    bridge.add(shadowed(deck), shadowed(arch))
    for (const end of [-1, 1]) {
      const pier = new Mesh(keep(new BoxGeometry(2, 5, 4)), standard(kartScene.mortar))
      pier.position.set((end * (width + 12)) / 2, 2.5, 0)
      bridge.add(shadowed(pier))
    }
    bridge.position.set((river.minX + river.maxX) / 2, 0, track.road[0]!.z - 60)
    group.add(bridge)

    // The old town across the water: brick houses in rows, red roofs, our own simple shapes
    const houses = scatter(track.road, {
      seed: 21,
      count: Math.round(70 * level.density) + 10,
      box: {
        minX: river.minX - 170,
        maxX: river.minX - 12,
        minZ: box.minZ - 200,
        maxZ: box.maxZ + 200,
      },
      clearance: 20,
      spacing: 13,
    })
    const bodies = new InstancedMesh(
      keep(new BoxGeometry(1, 1, 1)),
      standard('#ffffff', textures.brick),
      houses.length,
    )
    const roofs = new InstancedMesh(
      keep(new ConeGeometry(0.72, 1, 4)),
      standard(kartScene.roof),
      houses.length,
    )
    houses.forEach((house, index) => {
      const w = 8 + house.a * 6
      const d = 7 + house.b * 5
      const h = 5 + Math.round(house.a * 2) * 3.2
      const turn = Math.round(house.b * 3) * (Math.PI / 2) + Math.PI / 4
      place(bodies, index, house.x, h / 2, house.z, [w, h, d], turn - Math.PI / 4)
      place(roofs, index, house.x, h + 1.6, house.z, [w * 1.05, 3.2, d * 1.05], turn)
    })
    group.add(shadowed(bodies), shadowed(roofs))
  }

  // ── The harbour: its sea, quay, breakwaters, lighthouse, boats and hillside town ──
  const harbourScenery = harbour
    ? buildHarbour({
        track,
        level,
        group,
        textures,
        keep,
        own,
        ownTexture,
        standard,
        shadowed,
        place,
      })
    : null

  // ── The campus: its hillside, landmarks, town, river and mountain ──
  const tamkangScenery = tamkang
    ? buildTamkang({
        track,
        level,
        group,
        textures,
        keep,
        own,
        ownTexture,
        standard,
        shadowed,
        place,
      })
    : null

  for (const instances of group.children) {
    if (instances instanceof InstancedMesh) {
      instances.instanceMatrix.setUsage(DynamicDrawUsage)
      instances.instanceMatrix.needsUpdate = true
      instances.computeBoundingSphere()
    }
  }

  return {
    group,
    update(seconds) {
      if (water) water.offset.set(seconds * 0.012, seconds * 0.04)
      harbourScenery?.update(seconds)
      festival.update(seconds)
      tamkangScenery?.update(seconds)
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of extraTextures) texture.dispose()
      textures.dispose()
    },
  }
}
