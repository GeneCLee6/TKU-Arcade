// 2026-11-17: the art of a track with slopes and jumps (shared/kart/terrain.ts, docs/ARCHITECTURE.md
// §4.26): the ground rising and falling with the road (a height field, the road's height near it
// fading back to the plain far off), and each jump's ramp, a red and white wedge with dark sides.
// The road, kerbs and barriers themselves follow the road points' heights in trackArt.ts. Original,
// built in code like the rest.
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { groundAt, lowestRoadNear, terrainOf, type Terrain } from '../../../shared/kart/terrain.ts'
import { roadDirection, trackBounds, type Track } from '../../../shared/kart/track.ts'
import { kartScene } from '../../styles/kartTokens.ts'
import type { ArtKit } from './trackArt.ts'

/** The ground under the road's edges sits this far below the road */
const SINK = 0.45
/** The ground keeps the road's height this far from its centre line ... */
const NEAR = 26
/** ... and fades back to the plain over this many metres more */
const FADE = 110
/** The height field's cell, metres */
const CELL = 8
/** Beyond the road's box, the height field reaches this far */
const MARGIN = 260

/**
 * The terrain the ground follows: the road's, but with each jump's ramp taken out (the ramp is a
 * wedge standing on the road, not a hump in the hillside)
 */
function groundTerrain(terrain: Terrain, rises: readonly (number | undefined)[] = []): Terrain {
  const points = terrain.points.map((point) => ({ ...point }))
  // A high platform (2026-11-23, ledgeArt.ts) stands on a building, not on a hump of earth: the
  // ground under it stays at its face's foot
  const forks = terrain.forks?.map((fork, k) => {
    const rise = rises[k]
    if (rise === undefined) return fork.map((point) => ({ ...point }))
    const foot = fork[rise - 1]!.y
    return fork.map((point, index) => (index >= rise ? { ...point, y: Math.min(point.y, foot) } : { ...point }))
  })
  const count = points.length
  for (const lip of terrain.lips) {
    // A branch's ramp (2026-11-20): on its own centre line, which is open at both ends
    if (lip.fork !== undefined) {
      const line = forks?.[lip.fork]
      if (!line) continue
      const foot = line[Math.max(0, lip.index - 2)]!.y
      line[Math.max(0, lip.index - 1)]!.y = foot
      line[lip.index]!.y = foot
      continue
    }
    const foot = points[(lip.index - 2 + count) % count]!.y
    points[(lip.index - 1 + count) % count]!.y = foot
    points[lip.index]!.y = foot
  }
  // A crossing's and a bank's (2026-11-22) are kept: the ground goes by them too
  const more = {
    ...(terrain.crossings ? { crossings: terrain.crossings, halves: terrain.halves ?? [] } : {}),
    ...(terrain.banked ? { banked: terrain.banked } : {}),
  }
  return forks
    ? { points, lips: [], forks, halves: terrain.halves ?? [], ...more }
    : { points, lips: [], ...more }
}

/** At a crossing the ground lies at the underpass for this far either side of it, metres */
const UNDER_REACH = 16

/**
 * How high the ground is at (x, z) on a track with terrain; null for a flat track (whose ground is
 * at 0 everywhere, as it always was)
 */
export function hillGround(
  track: Track,
  /** How far the ground keeps the road's height, and over how far it then fades (an embankment: short) */
  reach: { near: number; fade: number } = { near: NEAR, fade: FADE },
): ((x: number, z: number) => number) | null {
  const terrain = terrainOf(track)
  if (!terrain) return null
  const ground = groundTerrain(
    terrain,
    (track.forks ?? []).map((fork) => fork.rise),
  )
  return (x, z) => {
    // At a crossing (2026-11-22): the ground at the underpass beside it, the viaduct over it on its
    // deck (crossingArt.ts), not on a bank of earth across the underpass
    const under = lowestRoadNear(ground, x, z, UNDER_REACH)
    if (under !== null) return under - SINK
    const near = groundAt(ground, x, z)
    const t = Math.max(0, Math.min(1, (near.distance - reach.near) / reach.fade))
    const fade = 1 - t * t * (3 - 2 * t)
    return (near.y - SINK) * fade
  }
}

/** The ground as a height field round the road, grass like the plain one */
export function buildHillGround(kit: ArtKit, height: (x: number, z: number) => number): Mesh {
  const { track, keep, own, textures } = kit
  const box = trackBounds(track)
  const west = box.minX - MARGIN
  const north = box.minZ - MARGIN
  const width = box.maxX - box.minX + 2 * MARGIN
  const depth = box.maxZ - box.minZ + 2 * MARGIN
  const columns = Math.ceil(width / CELL)
  const rows = Math.ceil(depth / CELL)
  const geometry = keep(new PlaneGeometry(width, depth, columns, rows))
  // Lying down: the plane's y becomes -z
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(west + width / 2, 0, north + depth / 2)
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index++) {
    position.setY(index, height(position.getX(index), position.getZ(index)))
  }
  geometry.computeVertexNormals()
  const material = own(
    new MeshLambertMaterial({
      map: textures.grass,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 8,
    }),
  )
  const mesh = new Mesh(geometry, material)
  mesh.receiveShadow = kit.level.shadows
  return mesh
}

/** A mesh of plain arrays, normals worked out */
function mesh(positions: number[], uvs: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Each jump's ramp: a striped top from the foot of the ramp to its lip, a little above the road, and
 * dark sides and back down to the road beyond the lip
 */
export function buildJumpRamps(kit: ArtKit): Mesh[] {
  const { track, keep, own, textures } = kit
  const terrain = terrainOf(track)
  if (!terrain || terrain.lips.length === 0) return []
  const top: { p: number[]; uv: number[]; i: number[] } = { p: [], uv: [], i: [] }
  const sides: { p: number[]; uv: number[]; i: number[] } = { p: [], uv: [], i: [] }
  for (const lip of terrain.lips) {
    // A branch's ramp (2026-11-20) stands on the branch's own, open centre line
    const branch = lip.fork === undefined ? null : track.forks?.[lip.fork]
    if (lip.fork !== undefined && !branch) continue
    const road = branch ? branch.path : track.road
    const count = road.length
    const step = (index: number) =>
      branch ? Math.max(0, index) : ((index % count) + count) % count
    const foot = step(lip.index - 2)
    const rampPoints = [foot, step(lip.index - 1), lip.index]
    const base = road[foot]!.y ?? 0
    const edges = rampPoints.map((index) => {
      const point = road[index]!
      const { dx, dz } = branch ? pathDirection(road, index, false) : roadDirection(road, index)
      const half = point.width / 2 - 0.9
      const y = (point.y ?? 0) + 0.12
      return {
        left: [point.x + dz * half, y, point.z - dx * half],
        right: [point.x - dz * half, y, point.z + dx * half],
        y,
      }
    })
    // The striped top: across it u, along it v, a stripe every couple of metres
    const start = top.p.length / 3
    edges.forEach((edge, at) => {
      top.p.push(...edge.left, ...edge.right)
      top.uv.push(0, at * 2, 1, at * 2)
      if (at > 0) {
        const a = start + (at - 1) * 2
        top.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
    // Each side: down from the top's edge to the road
    for (const side of ['left', 'right'] as const) {
      const s = sides.p.length / 3
      edges.forEach((edge, at) => {
        const [x, y, z] = edge[side] as [number, number, number]
        sides.p.push(x, y, z, x, base, z)
        sides.uv.push(at / 2, 1, at / 2, 0)
        if (at > 0) {
          const a = s + (at - 1) * 2
          sides.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      })
    }
    // The back, under the lip, from kerb to kerb
    const lipEdge = edges[2]!
    const b = sides.p.length / 3
    const [lx, ly, lz] = lipEdge.left as [number, number, number]
    const [rx, ry, rz] = lipEdge.right as [number, number, number]
    sides.p.push(lx, ly, lz, rx, ry, rz, lx, base, lz, rx, base, rz)
    sides.uv.push(0, 1, 1, 1, 0, 0, 1, 0)
    sides.i.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
  }
  const ramps = new Mesh(
    keep(mesh(top.p, top.uv, top.i)),
    own(new MeshLambertMaterial({ map: textures.kerb, side: DoubleSide })),
  )
  const walls = new Mesh(
    keep(mesh(sides.p, sides.uv, sides.i)),
    own(new MeshLambertMaterial({ color: kartScene.barrier, side: DoubleSide })),
  )
  for (const one of [ramps, walls]) {
    one.castShadow = kit.level.shadows
    one.receiveShadow = kit.level.shadows
  }
  return [ramps, walls]
}
