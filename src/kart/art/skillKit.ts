// 2026-11-20 (owner: "more and more lifelike, cooler"; docs/KART-WORLD.md §6): what the three tracks
// to learn by heart are dressed with (wharfArt.ts, lanesArt.ts, worksArt.ts, skillWalls.ts,
// skillCues.ts). A batch of boxes, prisms and tubes merged into one geometry, each part its own
// colour (one draw for a whole quarter's plain parts), and the textures they share, painted on a
// canvas at load. All of it our own simple shapes: no model or image files.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { pathDirection, type Fork } from '../../../shared/kart/branches.ts'
import { roadDirection, type RoadPoint, type Track } from '../../../shared/kart/track.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { roadClearance } from '../../../shared/kart/scenery.ts'
import { skillCue, wharfScene, worksScene } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

const colour = new Color()

/**
 * Boxes, prisms, tubes and flat panels merged into one geometry, each its own colour (vertex
 * colours) and, where `every` is given, with its texture repeating every that many metres
 */
export class Batch {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly uvs: number[] = []
  private readonly colours: number[] = []
  private readonly indices: number[] = []

  get empty(): boolean {
    return this.indices.length === 0
  }

  /** One flat face: four corners in order round it, its normal, uv at each corner */
  private face(
    corners: readonly Point3[],
    normal: Point3,
    uv: readonly (readonly [number, number])[],
    tint: string,
  ): void {
    colour.set(tint)
    const at = this.positions.length / 3
    corners.forEach((corner, index) => {
      this.positions.push(corner.x, corner.y, corner.z)
      this.normals.push(normal.x, normal.y, normal.z)
      this.uvs.push(uv[index]![0], uv[index]![1])
      this.colours.push(colour.r, colour.g, colour.b)
    })
    for (let k = 1; k + 1 < corners.length; k++) this.indices.push(at, at + k, at + k + 1)
  }

  /**
   * A box `size` (along, up, across) centred on `centre`, turned `turn` about the vertical (as an
   * Object3D's rotation.y). `every`: the texture repeats every that many metres; 0, once a face
   */
  box(centre: Point3, size: readonly [number, number, number], turn: number, tint: string, every = 0) {
    const [sx, sy, sz] = size
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    const world = (x: number, y: number, z: number): Point3 => ({
      x: centre.x + c * x + s * z,
      y: centre.y + y,
      z: centre.z - s * x + c * z,
    })
    const dir = (x: number, y: number, z: number): Point3 => ({ x: c * x + s * z, y, z: -s * x + c * z })
    const hx = sx / 2
    const hy = sy / 2
    const hz = sz / 2
    const u = (metres: number) => (every > 0 ? metres / every : 1)
    // +z and -z faces: along by up
    this.face(
      [world(-hx, -hy, hz), world(hx, -hy, hz), world(hx, hy, hz), world(-hx, hy, hz)],
      dir(0, 0, 1),
      [[0, 0], [u(sx), 0], [u(sx), u(sy)], [0, u(sy)]],
      tint,
    )
    this.face(
      [world(hx, -hy, -hz), world(-hx, -hy, -hz), world(-hx, hy, -hz), world(hx, hy, -hz)],
      dir(0, 0, -1),
      [[0, 0], [u(sx), 0], [u(sx), u(sy)], [0, u(sy)]],
      tint,
    )
    // +x and -x faces: across by up
    this.face(
      [world(hx, -hy, hz), world(hx, -hy, -hz), world(hx, hy, -hz), world(hx, hy, hz)],
      dir(1, 0, 0),
      [[0, 0], [u(sz), 0], [u(sz), u(sy)], [0, u(sy)]],
      tint,
    )
    this.face(
      [world(-hx, -hy, -hz), world(-hx, -hy, hz), world(-hx, hy, hz), world(-hx, hy, -hz)],
      dir(-1, 0, 0),
      [[0, 0], [u(sz), 0], [u(sz), u(sy)], [0, u(sy)]],
      tint,
    )
    // Top and bottom
    this.face(
      [world(-hx, hy, hz), world(hx, hy, hz), world(hx, hy, -hz), world(-hx, hy, -hz)],
      dir(0, 1, 0),
      [[0, 0], [u(sx), 0], [u(sx), u(sz)], [0, u(sz)]],
      tint,
    )
    this.face(
      [world(-hx, -hy, -hz), world(hx, -hy, -hz), world(hx, -hy, hz), world(-hx, -hy, hz)],
      dir(0, -1, 0),
      [[0, 0], [u(sx), 0], [u(sx), u(sz)], [0, u(sz)]],
      tint,
    )
  }

  /**
   * A prism: the convex outline `profile` (along, up; counter-clockwise seen from +z) drawn `depth`
   * deep across, its middle at `centre`, turned `turn`. A gable roof, a sawtooth roof's tooth, a hull
   */
  prism(
    centre: Point3,
    profile: readonly (readonly [number, number])[],
    depth: number,
    turn: number,
    tint: string,
    every = 0,
  ) {
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    const world = (x: number, y: number, z: number): Point3 => ({
      x: centre.x + c * x + s * z,
      y: centre.y + y,
      z: centre.z - s * x + c * z,
    })
    const dir = (x: number, y: number, z: number): Point3 => ({ x: c * x + s * z, y, z: -s * x + c * z })
    const hz = depth / 2
    const u = (metres: number) => (every > 0 ? metres / every : 1)
    // The two ends
    this.face(
      profile.map(([x, y]) => world(x, y, hz)),
      dir(0, 0, 1),
      profile.map(([x, y]) => [u(x), u(y)] as const),
      tint,
    )
    this.face(
      [...profile].reverse().map(([x, y]) => world(x, y, -hz)),
      dir(0, 0, -1),
      [...profile].reverse().map(([x, y]) => [u(x), u(y)] as const),
      tint,
    )
    // The sides, each edge of the outline drawn across
    profile.forEach(([x0, y0], index) => {
      const [x1, y1] = profile[(index + 1) % profile.length]!
      const length = Math.hypot(x1 - x0, y1 - y0)
      if (length < 1e-6) return
      const nx = (y1 - y0) / length
      const ny = -(x1 - x0) / length
      this.face(
        [world(x0, y0, hz), world(x0, y0, -hz), world(x1, y1, -hz), world(x1, y1, hz)],
        dir(nx, ny, 0),
        [[0, 0], [u(depth), 0], [u(depth), u(length)], [0, u(length)]],
        tint,
      )
    })
  }

  /** A round tube from `a` to `b` (a pipe, a pole, a rail, a wire), `sides` faces round, no ends */
  tube(a: Point3, b: Point3, radius: number, tint: string, sides = 8) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const length = Math.hypot(dx, dy, dz)
    if (length < 1e-6) return
    const ax = { x: dx / length, y: dy / length, z: dz / length }
    // Any vector not along the axis, crossed twice: the ring's two directions
    const helper = Math.abs(ax.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
    const p = normalise(cross(ax, helper))
    const q = cross(ax, p)
    const ring = (angle: number) => ({
      x: p.x * Math.cos(angle) + q.x * Math.sin(angle),
      y: p.y * Math.cos(angle) + q.y * Math.sin(angle),
      z: p.z * Math.cos(angle) + q.z * Math.sin(angle),
    })
    for (let side = 0; side < sides; side++) {
      const r0 = ring((side / sides) * Math.PI * 2)
      const r1 = ring(((side + 1) / sides) * Math.PI * 2)
      const mid = normalise({ x: r0.x + r1.x, y: r0.y + r1.y, z: r0.z + r1.z })
      const at = (from: Point3, r: Point3) => ({
        x: from.x + r.x * radius,
        y: from.y + r.y * radius,
        z: from.z + r.z * radius,
      })
      this.face([at(a, r0), at(b, r0), at(b, r1), at(a, r1)], mid, [[0, 0], [1, 0], [1, 1], [0, 1]], tint)
    }
  }

  /**
   * A flat upright panel `width` by `height`, centred on `centre`, facing `turn` (its front is the
   * box's +z face), showing the part `rect` (u0, v0, u1, v1) of the texture: a sign, a number
   */
  panel(
    centre: Point3,
    width: number,
    height: number,
    turn: number,
    tint: string,
    rect: readonly [number, number, number, number] = [0, 0, 1, 1],
  ) {
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    const world = (x: number, y: number): Point3 => ({
      x: centre.x + c * x,
      y: centre.y + y,
      z: centre.z - s * x,
    })
    const [u0, v0, u1, v1] = rect
    this.face(
      [world(-width / 2, -height / 2), world(width / 2, -height / 2), world(width / 2, height / 2), world(-width / 2, height / 2)],
      { x: s, y: 0, z: c },
      [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
      tint,
    )
  }

  /** The geometry, or null if nothing was added */
  build(): BufferGeometry | null {
    if (this.empty) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2))
    geometry.setAttribute('color', new Float32BufferAttribute(this.colours, 3))
    geometry.setIndex(this.indices)
    geometry.computeBoundingSphere()
    return geometry
  }
}

function cross(a: Point3, b: Point3): Point3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
function normalise(a: Point3): Point3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / length, y: a.y / length, z: a.z / length }
}

/** A batch as a mesh in the kit's group: its colours, an optional texture, freed with the art */
export function addBatch(
  kit: ArtKit,
  batch: Batch,
  options: { map?: Texture; cast?: boolean; emissive?: boolean; transparent?: boolean } = {},
): Mesh | null {
  const geometry = batch.build()
  if (!geometry) return null
  kit.keep(geometry)
  const material = kit.own(
    new MeshStandardMaterial({
      vertexColors: true,
      map: options.map ?? null,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
      transparent: options.transparent ?? false,
      alphaTest: options.transparent ? 0.5 : 0,
    }),
  )
  if (options.emissive) {
    // A glow: lit by itself, whatever the sun
    material.emissive.set('#ffffff')
    material.emissiveMap = options.map ?? null
    material.emissiveIntensity = 0.9
  }
  const mesh = new Mesh(geometry, material)
  kit.group.add(options.emissive ? mesh : kit.shadowed(mesh, options.cast ?? true))
  return mesh
}

// ── Textures ─────────────────────────────────────────────────────────────────────────────────

function canvasTexture(kit: ArtKit, size: number, paint: (context: CanvasRenderingContext2D, size: number) => void, repeat = true): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) paint(context, size)
  const texture = kit.ownTexture(new CanvasTexture(canvas))
  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
  }
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = kit.level.anisotropy
  return texture
}

/** Yellow and black stripes on the slant, one pair every metre of the texture (uv in metres / 1) */
export function hazardTexture(kit: ArtKit): Texture {
  return canvasTexture(kit, 128, (context, size) => {
    context.fillStyle = skillCue.hazard
    context.fillRect(0, 0, size, size)
    context.fillStyle = skillCue.hazardDark
    for (let k = -2; k < 3; k++) {
      context.beginPath()
      context.moveTo(k * size, size)
      context.lineTo(k * size + size / 2, size)
      context.lineTo(k * size + size, 0)
      context.lineTo(k * size + size / 2, 0)
      context.closePath()
      context.fill()
    }
  })
}

/**
 * A container's side in white (the instance's colour tints it): the corrugations, the frame, and at
 * one end the two doors with their locking bars. Once a face
 */
export function containerTexture(kit: ArtKit): Texture {
  return canvasTexture(kit, 256, (context, size) => {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    // Corrugations: light and shade, a rib every 1/24
    for (let rib = 0; rib < 24; rib++) {
      const x = (rib / 24) * size
      context.fillStyle = 'rgba(0,0,0,0.16)'
      context.fillRect(x, 0, size / 48, size)
      context.fillStyle = 'rgba(255,255,255,0.18)'
      context.fillRect(x + size / 48, 0, size / 96, size)
    }
    // The frame: rails top and bottom, posts at each end
    context.fillStyle = 'rgba(0,0,0,0.35)'
    context.fillRect(0, 0, size, size * 0.06)
    context.fillRect(0, size * 0.94, size, size * 0.06)
    context.fillRect(0, 0, size * 0.03, size)
    context.fillRect(size * 0.97, 0, size * 0.03, size)
    // The doors at one end: a seam and four locking bars, handles
    context.fillStyle = 'rgba(0,0,0,0.45)'
    context.fillRect(size * 0.86, size * 0.06, size * 0.006, size * 0.88)
    for (const x of [0.79, 0.83, 0.89, 0.93]) {
      context.fillRect(size * x, size * 0.08, size * 0.008, size * 0.84)
      context.fillRect(size * (x - 0.012), size * 0.48, size * 0.03, size * 0.03)
    }
    // A stencilled code panel, pale: bars of our own, no lettering
    context.fillStyle = 'rgba(255,255,255,0.7)'
    context.fillRect(size * 0.08, size * 0.14, size * 0.16, size * 0.05)
    context.fillRect(size * 0.08, size * 0.22, size * 0.1, size * 0.04)
  }, false)
}

/** Corrugated sheet metal in white (tinted by the part's colour); uv in metres / 4 */
export function corrugatedTexture(kit: ArtKit): Texture {
  return canvasTexture(kit, 128, (context, size) => {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    for (let rib = 0; rib < 16; rib++) {
      const x = (rib / 16) * size
      const gradient = context.createLinearGradient(x, 0, x + size / 16, 0)
      gradient.addColorStop(0, 'rgba(0,0,0,0.18)')
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.12)')
      gradient.addColorStop(1, 'rgba(0,0,0,0.18)')
      context.fillStyle = gradient
      context.fillRect(x, 0, size / 16, size)
    }
    // A seam where two sheets overlap
    context.fillStyle = 'rgba(0,0,0,0.25)'
    context.fillRect(0, size * 0.5, size, 2)
  })
}

/** Brick in white mortar, the bricks white too (the part's colour tints both); uv in metres / 2 */
export function brickTexture(kit: ArtKit, seed: number): Texture {
  const rng = createRng(seed)
  return canvasTexture(kit, 256, (context, size) => {
    context.fillStyle = '#d9d2c6'
    context.fillRect(0, 0, size, size)
    const rows = 26
    const height = size / rows
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : height * 1.1
      for (let x = -offset; x < size; x += height * 2.2) {
        const shade = Math.round(205 + rng.float() * 50)
        context.fillStyle = `rgb(${shade},${shade},${shade})`
        context.fillRect(x + 1, row * height + 1, height * 2.2 - 2, height - 2)
      }
    }
  })
}

/** Roof tiles in rows, in white (tinted); uv in metres / 2 */
export function tileTexture(kit: ArtKit): Texture {
  return canvasTexture(kit, 128, (context, size) => {
    context.fillStyle = '#bdbdbd'
    context.fillRect(0, 0, size, size)
    for (let column = 0; column < 8; column++) {
      const x = (column / 8) * size
      const gradient = context.createLinearGradient(x, 0, x + size / 8, 0)
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)')
      gradient.addColorStop(1, 'rgba(0,0,0,0.35)')
      context.fillStyle = gradient
      context.fillRect(x, 0, size / 8, size)
    }
    context.fillStyle = 'rgba(0,0,0,0.3)'
    for (let row = 0; row < 4; row++) context.fillRect(0, (row / 4) * size, size, 2)
  })
}

/**
 * A chevron painted on the road, pointing up the texture (-z of a decal laid flat), in white (the
 * decal's colour tints it), soft-edged
 */
export function chevronTexture(kit: ArtKit): Texture {
  return canvasTexture(kit, 128, (context, size) => {
    context.clearRect(0, 0, size, size)
    context.fillStyle = '#ffffff'
    for (const top of [0.12, 0.48]) {
      context.beginPath()
      context.moveTo(size * 0.5, size * top)
      context.lineTo(size * 0.92, size * (top + 0.3))
      context.lineTo(size * 0.92, size * (top + 0.44))
      context.lineTo(size * 0.5, size * (top + 0.14))
      context.lineTo(size * 0.08, size * (top + 0.44))
      context.lineTo(size * 0.08, size * (top + 0.3))
      context.closePath()
      context.fill()
    }
  }, false)
}

/**
 * Numbers for the sheds, eight to a texture (two rows of four): white figures on a dark plate.
 * `numberRect(k)` is the k-th one's part of it
 */
export function numberTexture(kit: ArtKit, numbers: readonly string[]): Texture {
  return canvasTexture(kit, 512, (context, size) => {
    const cellW = size / 4
    const cellH = size / 2
    numbers.slice(0, 8).forEach((text, index) => {
      const x = (index % 4) * cellW
      const y = Math.floor(index / 4) * cellH
      context.fillStyle = wharfScene.numberBack
      context.fillRect(x + 4, y + 4, cellW - 8, cellH - 8)
      context.strokeStyle = wharfScene.number
      context.lineWidth = 6
      context.strokeRect(x + 14, y + 14, cellW - 28, cellH - 28)
      context.fillStyle = wharfScene.number
      context.font = `bold ${Math.round(cellH * 0.55)}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, x + cellW / 2, y + cellH / 2 + 4)
    })
  }, false)
}

/** The k-th of numberTexture's eight cells, as a panel's rect (v runs up) */
export const numberRect = (k: number): [number, number, number, number] => {
  const column = k % 4
  const row = Math.floor(k / 4) % 2
  return [column / 4, 1 - (row + 1) / 2, (column + 1) / 4, 1 - row / 2]
}

/**
 * Spray paint of our own on a wall (works' alley): abstract shapes, no lettering or anyone's
 * marks. Four pieces in one texture (two by two), on a transparent ground
 */
export function graffitiTexture(kit: ArtKit, seed: number): Texture {
  const rng = createRng(seed)
  const paints = worksScene.graffiti
  return canvasTexture(kit, 512, (context, size) => {
    context.clearRect(0, 0, size, size)
    const half = size / 2
    for (let piece = 0; piece < 4; piece++) {
      const ox = (piece % 2) * half
      const oy = Math.floor(piece / 2) * half
      const main = paints[Math.floor(rng.float() * paints.length)]!
      const second = paints[Math.floor(rng.float() * paints.length)]!
      context.save()
      context.translate(ox + half / 2, oy + half / 2)
      // A fat outlined blob made of overlapping round strokes
      context.lineCap = 'round'
      context.lineJoin = 'round'
      const path = () => {
        context.beginPath()
        const turns = 3 + Math.floor(rng.float() * 3)
        for (let k = 0; k <= turns; k++) {
          const angle = (k / turns) * Math.PI * 2 + rng.float() * 0.6
          const r = half * (0.18 + rng.float() * 0.2)
          const x = Math.cos(angle) * r * 1.4
          const y = Math.sin(angle) * r * 0.8
          if (k === 0) context.moveTo(x, y)
          else context.quadraticCurveTo(x * 1.3, -y * 0.4, x, y)
        }
      }
      path()
      context.strokeStyle = '#111111'
      context.lineWidth = half * 0.2
      context.stroke()
      context.strokeStyle = main
      context.lineWidth = half * 0.14
      context.stroke()
      // Highlights and a few drips
      context.strokeStyle = second
      context.lineWidth = half * 0.03
      context.stroke()
      context.fillStyle = main
      for (let drip = 0; drip < 5; drip++) {
        const x = (rng.float() - 0.5) * half * 0.7
        context.fillRect(x, half * 0.05, 3, half * (0.08 + rng.float() * 0.12))
      }
      // Stars
      context.fillStyle = second
      for (let star = 0; star < 3; star++) {
        const x = (rng.float() - 0.5) * half * 0.8
        const y = (rng.float() - 0.5) * half * 0.8
        context.beginPath()
        for (let k = 0; k < 8; k++) {
          const r = k % 2 === 0 ? 10 : 3
          const angle = (k / 8) * Math.PI * 2
          context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
        }
        context.fill()
      }
      context.restore()
    }
  }, false)
}

// ── Where things are ────────────────────────────────────────────────────────────────────────

/** Distance from (x, z) to the main road's centre line, less half its width (no branches) */
export function mainClearance(road: readonly RoadPoint[], x: number, z: number): number {
  let best = Infinity
  for (let index = 0; index < road.length; index++) {
    const a = road[index]!
    const b = road[(index + 1) % road.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length2 = dx * dx + dz * dz
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2))
    const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) - Math.max(a.width, b.width) / 2
    if (distance < best) best = distance
  }
  return best
}

/** The road nearest (x, z), the main one or a branch: which way it runs there, and how high it is */
export function roadAt(
  track: Pick<Track, 'road' | 'forks'>,
  x: number,
  z: number,
): { dx: number; dz: number; y: number; distance: number } {
  let best = { dx: 0, dz: -1, y: 0, distance: Infinity }
  const consider = (path: readonly RoadPoint[], fork: Fork | null) => {
    path.forEach((point, index) => {
      const distance = Math.hypot(point.x - x, point.z - z)
      if (distance >= best.distance) return
      const { dx, dz } = fork ? pathDirection(path, index, false) : roadDirection(path, index)
      best = { dx, dz, y: point.y ?? 0, distance }
    })
  }
  consider(track.road, null)
  for (const fork of track.forks ?? []) consider(fork.path, fork)
  return best
}

/** A building's footprint, metres: its middle, its size along and across, which way it is turned */
export interface Footprint {
  readonly x: number
  readonly z: number
  readonly along: number
  readonly across: number
  readonly turn: number
}

export const insideFootprint = (one: Footprint, x: number, z: number, margin: number) => {
  const c = Math.cos(one.turn)
  const s = Math.sin(one.turn)
  const dx = x - one.x
  const dz = z - one.z
  // Back into the footprint's own axes (the inverse of an Object3D's rotation.y)
  const along = c * dx - s * dz
  const across = s * dx + c * dz
  return Math.abs(along) < one.along / 2 + margin && Math.abs(across) < one.across / 2 + margin
}

/**
 * The biggest rectangle up to `most` (along, across) turned `turn` round (x, z) that keeps `margin`
 * metres off every road (the branches counted), or null
 */
export function fitRect(
  road: Track['road'],
  x: number,
  z: number,
  turn: number,
  most: readonly [number, number],
  margin: number,
): Footprint | null {
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  for (let shrink = 1; shrink > 0.3; shrink -= 0.05) {
    const along = most[0] * shrink
    const across = most[1] * shrink
    let clear = true
    for (let i = 0; i <= 4 && clear; i++) {
      for (let j = 0; j <= 4 && clear; j++) {
        const a = (i / 4 - 0.5) * along
        const b = (j / 4 - 0.5) * across
        if (roadClearance(road, x + c * a + s * b, z - s * a + c * b) < margin) clear = false
      }
    }
    if (clear) return { x, z, along, across, turn }
  }
  return null
}
