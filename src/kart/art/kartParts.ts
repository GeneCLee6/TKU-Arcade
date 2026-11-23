// 2026-11-18 (owner: "the karts need designing again ... more and more real, more striking"): what
// the six karts are built from, all made in code. Lofted hulls (a skin drawn through cross-sections,
// so a body has the lines of a designed machine rather than of a ball), plates, fins and thruster
// bells; metallic paint, a carbon weave, bare metal, glass and lit strips, all catching an
// environment map made here too (a pale sky over a dark floor with three bright panels); and the
// bookkeeping of a change of shape: any part may be given a second place to be, which it moves to
// while a full boost runs (boostFx.ts).
//
// A kart is many small parts; drawn one by one, eight karts would be hundreds of draw calls.
// `flatten` merges everything in a group that shares a material into one mesh, so a kart is about a
// dozen. The parts that move by themselves are groups of their own, and are merged within themselves.
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  SkinnedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { DETAIL_BUMP } from './bodyDetail.ts'
import { bakeSkinned } from './driverSkin.ts'
import { kartParts } from '../../styles/kartTokens.ts'

// ── The environment the paint reflects ──────────────────────────────────────────────────────────

/**
 * A small environment map, made once per scene: a sky fading to a pale horizon over a dark floor,
 * and three bright panels overhead and to the sides, which are what make metallic paint read as
 * metal. `sky` and `horizon` are the track's own, so a sunset kart reflects a sunset
 */
export function buildKartEnvironment(
  renderer: WebGLRenderer,
  sky: string = kartParts.envSky,
  horizon: string = kartParts.envHorizon,
): Texture {
  const room = new Scene()
  const dome = new SphereGeometry(20, 24, 16)
  const top = new Color(sky)
  const edge = new Color(horizon)
  const floor = new Color(kartParts.envFloor)
  const position = dome.getAttribute('position')
  const colours = new Float32Array(position.count * 3)
  const mixed = new Color()
  for (let index = 0; index < position.count; index++) {
    const height = position.getY(index) / 20
    if (height >= 0) mixed.copy(edge).lerp(top, Math.min(1, height * 1.6))
    else mixed.copy(edge).lerp(floor, Math.min(1, -height * 5))
    colours.set([mixed.r, mixed.g, mixed.b], index * 3)
  }
  dome.setAttribute('color', new BufferAttribute(colours, 3))
  const domeMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide })
  room.add(new Mesh(dome, domeMaterial))
  // The panels: brighter than white, so that they still read after the blur of a rough surface
  const panelMaterial = new MeshBasicMaterial({ color: new Color(kartParts.envPanel).multiplyScalar(2.6) })
  const panel = new BoxGeometry(1, 1, 1)
  for (const [x, y, z, sx, sy, sz] of [
    [0, 14, 0, 14, 0.4, 5],
    [-15, 5, 2, 0.4, 5, 12],
    [15, 5, -2, 0.4, 5, 12],
    [0, 6, 16, 10, 3, 0.4],
  ] as const) {
    const mesh = new Mesh(panel, panelMaterial)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    room.add(mesh)
  }
  const generator = new PMREMGenerator(renderer)
  // Small: a kart is a few hundred pixels across, and the blur of its paint hides the rest
  const target = generator.fromScene(room, 0.04, 0.1, 100, { size: 64 })
  generator.dispose()
  dome.dispose()
  domeMaterial.dispose()
  panel.dispose()
  panelMaterial.dispose()
  return target.texture
}

/**
 * A carbon weave: a small tile of two threads over and under each other, repeated. `fine` (the high
 * quality, 2026-11-22, bodyDetail.ts): a 2/2 twill on a tile twice the size, each tow with its sheen
 */
export function carbonTexture(fine = false): CanvasTexture {
  if (fine) return twillTexture()
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = kartParts.carbon
    context.fillRect(0, 0, size, size)
    const half = size / 2
    for (const [x, y, upright] of [
      [0, 0, true],
      [half, half, true],
      [half, 0, false],
      [0, half, false],
    ] as const) {
      const gradient = upright
        ? context.createLinearGradient(x, 0, x + half, 0)
        : context.createLinearGradient(0, y, 0, y + half)
      gradient.addColorStop(0, kartParts.carbon)
      gradient.addColorStop(0.5, kartParts.carbonThread)
      gradient.addColorStop(1, kartParts.carbon)
      context.fillStyle = gradient
      context.fillRect(x, y, half, half)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** The fine weave: tows two over two under, stepping one along each row, each lit along its length */
function twillTexture(): CanvasTexture {
  const size = 64
  const tows = 8
  const step = size / tows
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = kartParts.carbon
    context.fillRect(0, 0, size, size)
    for (let row = 0; row < tows; row++) {
      for (let column = 0; column < tows; column++) {
        // Two over, two under, the pattern one tow along on each row: the twill's diagonal
        const upright = (column + row) % 4 < 2
        const x = column * step
        const y = row * step
        const gradient = upright
          ? context.createLinearGradient(x, 0, x + step, 0)
          : context.createLinearGradient(0, y, 0, y + step)
        gradient.addColorStop(0, kartParts.carbon)
        gradient.addColorStop(0.45, kartParts.carbonThread)
        gradient.addColorStop(0.55, kartParts.carbonThread)
        gradient.addColorStop(1, kartParts.carbon)
        context.fillStyle = gradient
        context.fillRect(x, y, step, step)
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(0.5, 0.5)
  texture.colorSpace = SRGBColorSpace
  return texture
}

// ── Shapes ──────────────────────────────────────────────────────────────────────────────────────

/** One cross-section of a hull, looking along the kart */
export interface Section {
  /** Where along the kart, metres: -z is forward */
  readonly z: number
  /** Half its width */
  readonly w: number
  /** How far it rises above its middle line, and how far it hangs below */
  readonly top: number
  readonly bottom: number
  /** The middle line's height; 0 when left out */
  readonly y?: number
  /** How square it is: 2 an ellipse, 4 and up a box with round corners; 2.6 when left out */
  readonly n?: number
}

const signedPower = (value: number, exponent: number): number =>
  Math.sign(value) * Math.abs(value) ** exponent

/**
 * A skin through `sections`, front to back, closed at both ends: a hull. Smooth, with texture
 * coordinates that run round it and along it (the carbon weave)
 */
export function loft(sections: readonly Section[], around = 20): BufferGeometry {
  const rings = sections.length
  const positions: number[] = []
  const uvs: number[] = []
  for (const section of sections) {
    const exponent = 2 / (section.n ?? 2.6)
    for (let step = 0; step <= around; step++) {
      const angle = (step / around) * Math.PI * 2
      const across = signedPower(Math.cos(angle), exponent)
      const up = signedPower(Math.sin(angle), exponent)
      positions.push(
        section.w * across,
        (section.y ?? 0) + (up >= 0 ? section.top : section.bottom) * up,
        section.z,
      )
      uvs.push((step / around) * 6, section.z * 3)
    }
  }
  const indices: number[] = []
  const row = around + 1
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let step = 0; step < around; step++) {
      const a = ring * row + step
      const b = a + 1
      const c = a + row
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }
  // The ends: a fan to the middle of each
  for (const [ring, flip] of [
    [0, false],
    [rings - 1, true],
  ] as const) {
    const section = sections[ring]!
    const centre = positions.length / 3
    positions.push(0, (section.y ?? 0) + (section.top - section.bottom) / 2, section.z)
    uvs.push(0, section.z * 3)
    for (let step = 0; step < around; step++) {
      const a = ring * row + step
      const b = a + 1
      if (flip) indices.push(centre, a, b)
      else indices.push(centre, b, a)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** One cross-section of a faceted hull, looking along the kart: a crest, shoulders, a belt line, a keel */
export interface Facet {
  /** Where along the kart, metres: -z is forward */
  readonly z: number
  /** Half its width at the belt line, its widest */
  readonly w: number
  /** How far the crest rises above the belt line, and how far the keel hangs below */
  readonly top: number
  readonly bottom: number
  /** The belt line's height; 0 when left out */
  readonly y?: number
  /** The shoulders: their share of the half width (0.6) and of the height (0.8) */
  readonly sw?: number
  readonly sh?: number
  /** The keel's edges: their share of the half width (0.7) */
  readonly kw?: number
}

/**
 * 2026-11-18 (owner: "more esports ... it looks like a child's toy"): a hull of flat faces through
 * `sections`, front to back, closed at both ends. Eight edges run its length (the crest, a shoulder
 * and a belt line each side, two keel edges and the belly), and every face is flat, so the light
 * breaks on it as on a machine cut from sheet, not blown like a balloon
 */
export function hull(sections: readonly Facet[]): BufferGeometry {
  const rings = sections.map((s) => {
    const y = s.y ?? 0
    const sw = s.w * (s.sw ?? 0.6)
    const sy = y + s.top * (s.sh ?? 0.8)
    const kw = s.w * (s.kw ?? 0.7)
    return [
      [0, y + s.top, s.z],
      [sw, sy, s.z],
      [s.w, y, s.z],
      [kw, y - s.bottom, s.z],
      [0, y - s.bottom, s.z],
      [-kw, y - s.bottom, s.z],
      [-s.w, y, s.z],
      [-sw, sy, s.z],
    ] as const
  })
  const positions: number[] = []
  const uvs: number[] = []
  const corner = (ring: number, step: number) => {
    const point = rings[ring]![step % 8]!
    positions.push(point[0], point[1], point[2])
    uvs.push(point[0] * 3 + point[1] * 3, point[2] * 3)
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let step = 0; step < 8; step++) {
      // Two triangles a face, each with corners of its own: flat
      corner(ring, step)
      corner(ring + 1, step)
      corner(ring, step + 1)
      corner(ring, step + 1)
      corner(ring + 1, step)
      corner(ring + 1, step + 1)
    }
  }
  for (const [ring, flip] of [
    [0, false],
    [rings.length - 1, true],
  ] as const) {
    for (let step = 1; step < 7; step++) {
      corner(ring, 0)
      corner(ring, flip ? step + 1 : step)
      corner(ring, flip ? step : step + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A wedge: `w` across and `l` long, `h0` high at the front (-z) and `h1` at the back, its underside
 * on y = 0 and its middle at the origin. Splitters, ramps, intakes, a helmet's spoiler
 */
export function wedge(w: number, l: number, h0: number, h1: number): BufferGeometry {
  const geometry = blade(
    [
      [-l / 2, 0],
      [l / 2, 0],
      [l / 2, h1],
      [-l / 2, Math.max(h0, 0.004)],
    ],
    w,
  )
  return geometry
}

/**
 * A livery mark as a texture, see-through round what `draw` paints: a racing number, a team's
 * abstract sign. `draw` is given a canvas `width` by `height` to paint on
 */
export function decalTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) draw(context, width, height)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * A flat outline in the kart's plane, (x, z) with -z forward, `height` thick with its underside on
 * y = 0; `bevel` rounds its edges
 */
export function plate(
  outline: readonly (readonly [number, number])[],
  height: number,
  bevel = 0,
): BufferGeometry {
  const shape = new Shape()
  outline.forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)))
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  })
  // The shape's y is the kart's z; the depth goes up
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, height - bevel, 0)
  return geometry
}

/**
 * An upright blade from a side view: `profile` is (z, y) points, -z forward; `thick` across, its
 * middle on x = 0. Fins, pylons, end plates
 */
export function blade(profile: readonly (readonly [number, number])[], thick = 0.04): BufferGeometry {
  const shape = new Shape()
  profile.forEach(([z, y], index) => (index === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)))
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false })
  // The shape's x runs along the kart (+z back), its y up; the depth across
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(thick / 2, 0, 0)
  return geometry
}

/** A thruster's bell, pointing back (+z) with its mouth on z = 0: `radius` at the mouth */
export function bell(radius: number, length: number, throat = 0.62): BufferGeometry {
  const points = [
    new Vector2(radius * throat * 0.9, -length),
    new Vector2(radius * throat, -length * 0.72),
    new Vector2(radius * (throat + (1 - throat) * 0.55), -length * 0.3),
    new Vector2(radius, 0),
    // The lip, then back inside to a dark throat
    new Vector2(radius * 0.86, 0),
    new Vector2(radius * throat * 0.7, -length * 0.55),
  ]
  const geometry = new LatheGeometry(points, 18)
  // A lathe turns about y: lay it back along z
  geometry.rotateX(Math.PI / 2)
  return geometry
}

/** A ring standing across the kart (its hole along z): a thruster's lip, a hoop */
export function hoop(radius: number, tube: number, around = 20): BufferGeometry {
  const points: Vector2[] = []
  for (let step = 0; step <= 6; step++) {
    const angle = (step / 6) * Math.PI * 2
    points.push(new Vector2(radius + Math.cos(angle) * tube, Math.sin(angle) * tube))
  }
  const geometry = new LatheGeometry(points, around)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

// ── Merging ─────────────────────────────────────────────────────────────────────────────────────

/** Marks a mesh that is moved or scaled by itself each frame: `flatten` leaves it alone */
export const live = <T extends Object3D>(object: T): T => {
  object.userData.live = true
  return object
}

/**
 * 2026-11-20 (docs/KART-PERF.md): what a plain paint is (kartModel.ts's `colour`, and the carbon
 * weave), kept on its material so that `flatten` can draw every paint of a group as one: the colour,
 * the roughness and metalness, the glow (already times its intensity), how much of the environment
 * it reflects and whether the weave is on it. All linear colours
 */
export interface PaintLook {
  readonly color: Color
  readonly roughness: number
  readonly metalness: number
  readonly emissive: Color
  readonly env: number
  readonly woven: boolean
}

/** Marks `material` as a paint that looks like `look` */
export function markPaint<T extends Material>(material: T, look: PaintLook): T {
  material.userData.paint = look
  return material
}

const paintOf = (material: Material): PaintLook | undefined =>
  material.userData.paint as PaintLook | undefined

/**
 * One material for every paint of a kart, each vertex carrying its own colour, roughness,
 * metalness, glow, reflection and weave: the same shading as a MeshStandardMaterial of each
 * (three.js's own shader, with those numbers read per vertex rather than per material)
 */
export function createPaintMaterial(
  environment: Texture | null,
  weave: Texture | null,
  /** The body's fine detail (bodyDetail.ts), read as a bump map: seams, screws, wear; none on low */
  detail: Texture | null = null,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: weave,
    envMap: environment,
    roughness: 1,
    metalness: 1,
    ...(detail ? { bumpMap: detail, bumpScale: DETAIL_BUMP } : {}),
  })
  const varyings = 'varying vec2 vPaintRM;\nvarying vec3 vPaintEmissive;\nvarying vec2 vPaintEnv;'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec2 paintRM;\nattribute vec3 paintEmissive;\nattribute vec2 paintEnv;\n${varyings}`,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPaintRM = paintRM;\nvPaintEmissive = paintEmissive;\nvPaintEnv = paintEnv;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${varyings}`)
      .replace(
        '#include <envmap_physical_pars_fragment>',
        '#define envMapIntensity vPaintEnv.x\n#include <envmap_physical_pars_fragment>',
      )
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n  diffuseColor *= mix(vec4(1.0), texture2D(map, vMapUv), vPaintEnv.y);\n#endif',
      )
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vPaintEmissive;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPaintRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPaintRM.y;')
  }
  material.customProgramCacheKey = () => (detail ? 'kart-paint-detail' : 'kart-paint')
  return material
}

function mergeInto(meshes: readonly Mesh[], painted = false): BufferGeometry {
  let count = 0
  const pieces = meshes.map((mesh) => {
    mesh.updateMatrix()
    const source = mesh.geometry
    const piece = source.index ? source.toNonIndexed() : source.clone()
    piece.applyMatrix4(mesh.matrix)
    count += piece.getAttribute('position').count
    return piece
  })
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const colours = painted ? new Float32Array(count * 3) : null
  const rms = painted ? new Float32Array(count * 2) : null
  const glows = painted ? new Float32Array(count * 3) : null
  const envs = painted ? new Float32Array(count * 2) : null
  let at = 0
  pieces.forEach((piece, index) => {
    const position = piece.getAttribute('position')
    if (!piece.getAttribute('normal')) piece.computeVertexNormals()
    const normal = piece.getAttribute('normal')
    const uv = piece.getAttribute('uv')
    positions.set(position.array as Float32Array, at * 3)
    normals.set(normal.array as Float32Array, at * 3)
    if (uv) uvs.set(uv.array as Float32Array, at * 2)
    const look = colours && rms && glows && envs ? paintOf(meshes[index]!.material as Material) : undefined
    if (look && colours && rms && glows && envs) {
      for (let vertex = at; vertex < at + position.count; vertex++) {
        colours[vertex * 3] = look.color.r
        colours[vertex * 3 + 1] = look.color.g
        colours[vertex * 3 + 2] = look.color.b
        rms[vertex * 2] = look.roughness
        rms[vertex * 2 + 1] = look.metalness
        glows[vertex * 3] = look.emissive.r
        glows[vertex * 3 + 1] = look.emissive.g
        glows[vertex * 3 + 2] = look.emissive.b
        envs[vertex * 2] = look.env
        envs[vertex * 2 + 1] = look.woven ? 1 : 0
      }
    }
    at += position.count
    piece.dispose()
  })
  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(positions, 3))
  merged.setAttribute('normal', new BufferAttribute(normals, 3))
  merged.setAttribute('uv', new BufferAttribute(uvs, 2))
  if (colours && rms && glows && envs) {
    merged.setAttribute('color', new BufferAttribute(colours, 3))
    merged.setAttribute('paintRM', new BufferAttribute(rms, 2))
    merged.setAttribute('paintEmissive', new BufferAttribute(glows, 3))
    merged.setAttribute('paintEnv', new BufferAttribute(envs, 2))
  }
  return merged
}

/**
 * Merges, in every group under `root`, the meshes that share a material into one. `keep` is told of
 * each merged geometry (to free it later); the parts' own geometries are freed here. Given `paint`
 * (2026-11-20), every paint of a group (markPaint) is merged into one mesh of that material, whatever
 * its own paint was
 */
export function flatten(
  root: Group,
  keep: (geometry: BufferGeometry) => void,
  shadows: boolean,
  paint?: Material,
): void {
  const groups: Object3D[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh)) groups.push(object)
  })
  for (const group of groups) {
    const byMaterial = new Map<Material, Mesh[]>()
    for (const child of group.children) {
      if (!(child instanceof Mesh) || child.userData.live || Array.isArray(child.material)) continue
      const own = child.material as Material
      const key = paint && paintOf(own) ? paint : own
      const bucket = byMaterial.get(key)
      if (bucket) bucket.push(child)
      else byMaterial.set(key, [child])
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue
      const geometry = mergeInto(meshes, material === paint)
      keep(geometry)
      for (const mesh of meshes) {
        group.remove(mesh)
        mesh.geometry.dispose()
      }
      const merged = new Mesh(geometry, material)
      merged.castShadow = shadows
      group.add(merged)
    }
  }
}

/**
 * 2026-11-20 (docs/KART-PERF.md): `meshes` (all under `root`) as they stand now, merged into as few
 * meshes as there are materials (or into one, `material` given, its looks ignored: a shadow's
 * stand-in), placed in `root`'s own frame. Every attribute the meshes of a material share is kept
 */
export function mergeTree(
  root: Object3D,
  meshes: readonly Mesh[],
  keep: (geometry: BufferGeometry) => void,
  material?: Material,
): Mesh[] {
  root.updateMatrixWorld(true)
  const toRoot = new Matrix4().copy(root.matrixWorld).invert()
  const relative = new Matrix4()
  const byMaterial = new Map<Material, BufferGeometry[]>()
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) continue
    const own = material ?? (mesh.material as Material)
    const source = mesh.geometry
    // 2026-11-23 (§4.91): a skinned limb as its bones hold it now (driverSkin.ts)
    const piece =
      mesh instanceof SkinnedMesh ? bakeSkinned(mesh) : source.index ? source.toNonIndexed() : source.clone()
    if (material) for (const name of Object.keys(piece.attributes)) if (name !== 'position') piece.deleteAttribute(name)
    piece.applyMatrix4(relative.multiplyMatrices(toRoot, mesh.matrixWorld))
    const list = byMaterial.get(own)
    if (list) list.push(piece)
    else byMaterial.set(own, [piece])
  }
  const merged: Mesh[] = []
  for (const [own, pieces] of byMaterial) {
    const names = Object.keys(pieces[0]!.attributes).filter((name) =>
      pieces.every((piece) => piece.getAttribute(name)?.itemSize === pieces[0]!.getAttribute(name).itemSize),
    )
    const count = pieces.reduce((sum, piece) => sum + piece.getAttribute('position').count, 0)
    const geometry = new BufferGeometry()
    for (const name of names) {
      const size = pieces[0]!.getAttribute(name).itemSize
      const array = new Float32Array(count * size)
      let at = 0
      for (const piece of pieces) {
        const attribute = piece.getAttribute(name)
        array.set(attribute.array as Float32Array, at)
        at += attribute.count * size
      }
      geometry.setAttribute(name, new BufferAttribute(array, size))
    }
    for (const piece of pieces) piece.dispose()
    keep(geometry)
    merged.push(new Mesh(geometry, own))
  }
  return merged
}

// ── A change of shape ───────────────────────────────────────────────────────────────────────────

/** Where a part goes when the kart's shape changes: what is left out stays as it is */
export interface MorphTo {
  readonly x?: number
  readonly y?: number
  readonly z?: number
  readonly rx?: number
  readonly ry?: number
  readonly rz?: number
  /** Its size, all ways or each way */
  readonly s?: number
  readonly sx?: number
  readonly sy?: number
  readonly sz?: number
  /** The share of the whole change this part moves over: the start and the end, 0 to 1 */
  readonly from?: number
  readonly until?: number
}

/** A function that puts one part where it belongs at `amount` of the change, 0 (closed) to 1 */
export type Morph = (amount: number) => void

/** The part's move from where it is now to `to`, as a function of how far the change has gone */
export function morphOf(object: Object3D, to: MorphTo, ease: (share: number) => number): Morph {
  const from = {
    x: object.position.x,
    y: object.position.y,
    z: object.position.z,
    rx: object.rotation.x,
    ry: object.rotation.y,
    rz: object.rotation.z,
    sx: object.scale.x,
    sy: object.scale.y,
    sz: object.scale.z,
  }
  const target = {
    x: to.x ?? from.x,
    y: to.y ?? from.y,
    z: to.z ?? from.z,
    rx: to.rx ?? from.rx,
    ry: to.ry ?? from.ry,
    rz: to.rz ?? from.rz,
    sx: to.sx ?? to.s ?? from.sx,
    sy: to.sy ?? to.s ?? from.sy,
    sz: to.sz ?? to.s ?? from.sz,
  }
  const start = to.from ?? 0
  const end = to.until ?? 1
  return (amount) => {
    const share = ease(Math.max(0, Math.min(1, (amount - start) / (end - start))))
    const mix = (a: number, b: number) => a + (b - a) * share
    object.position.set(mix(from.x, target.x), mix(from.y, target.y), mix(from.z, target.z))
    object.rotation.set(mix(from.rx, target.rx), mix(from.ry, target.ry), mix(from.rz, target.rz))
    object.scale.set(mix(from.sx, target.sx), mix(from.sy, target.sy), mix(from.sz, target.sz))
  }
}

/** A group at a place, added to `parent`: a part that moves by itself */
export function hinge(parent: Object3D, x = 0, y = 0, z = 0): Group {
  const group = new Group()
  group.position.set(x, y, z)
  parent.add(group)
  return group
}

// ── What a body is built with ───────────────────────────────────────────────────────────────────

export interface BodyPaint {
  /** The kart's three colours as metallic paint */
  readonly main: Material
  readonly second: Material
  readonly accent: Material
  readonly carbon: Material
  readonly metal: Material
  readonly glass: Material
  /** The inside of a vent or a thruster */
  readonly dark: Material
  /** Lit strips in the kart's glow colour */
  readonly glow: Material
  /** What a change of shape uncovers: dim when closed, blazing when open */
  readonly core: Material
  readonly headLamp: Material
  readonly tailLamp: Material
}

/** The livery's marks: the driver's racing number, and the kart's own abstract team sign */
export type DecalKind = 'number' | 'mark'
/** Which way a mark faces: up from a deck, out from a side, back from a tail */
export type DecalFace = 'up' | 'left' | 'right' | 'back'

/** What kartModel.ts lends a body (kartBodies.ts) and the driver to build with */
export interface BodyKit {
  readonly paint: BodyPaint
  /**
   * 2026-11-23 (§4.91): every paint of a part drawn as one (createPaintMaterial), for what is merged
   * outside `flatten` (the driver's skinned limbs, driverSkin.ts); none on a ghost
   */
  readonly allPaint?: Material
  /** A mesh at a place, added to `parent`; turn or scale it afterwards as needed */
  put(
    parent: Object3D,
    geometry: BufferGeometry,
    material: Material,
    x?: number,
    y?: number,
    z?: number,
  ): Mesh
  /**
   * A paint of the kit's kind (metallic, catching the environment) in another colour; `emissive`
   * above 0 lights it a little from within (a neon panel)
   */
  colour(color: string, roughness?: number, metalness?: number, emissive?: number): Material
  /** `object` moves to `to` while a full boost runs */
  morph(object: Object3D, to: MorphTo): void
  /** A thruster pointing back, its mouth at this place: bell, lit lip, and where its flame starts */
  nozzle(parent: Object3D, x: number, y: number, z: number, radius: number): void
  /** A lit strip `length` long along the kart, turned `turn` radians about the upright */
  strip(
    parent: Object3D,
    x: number,
    y: number,
    z: number,
    length: number,
    turn?: number,
    material?: Material,
  ): Mesh
  /**
   * A livery mark, `w` wide and `l` tall as read: lying flat (its top forward) or standing, facing
   * a side or the back. None on a ghost
   */
  decal(
    parent: Object3D,
    kind: DecalKind,
    w: number,
    l: number,
    x: number,
    y: number,
    z: number,
    face?: DecalFace,
    /** Tipped this far about the kart's width, radians: a mark on a sloping nose */
    tilt?: number,
  ): Mesh | null
}

export interface BodyFit {
  /** Where the driver sits, on the chassis */
  readonly seat: { readonly y: number; readonly z: number }
  /** Under the back corners, (x, z): where the drift trails and sparks start */
  readonly rearContacts: [number, number][]
  /**
   * A bike (2026-11-19, bikeBodies.ts): the rider sits astride it and lies forward, `crouch`
   * radians (negative is forward), to bars at `bar` on the chassis; the model leans it deep into a
   * turn. Left out, a kart: the driver sits in it, at a yoke
   */
  readonly bike?: {
    readonly bar: { readonly y: number; readonly z: number }
    readonly crouch: number
  }
}
