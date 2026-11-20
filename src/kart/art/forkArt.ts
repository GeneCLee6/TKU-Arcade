// 2026-11-20: the art of a track's branches (shared/kart/branches.ts, docs/ARCHITECTURE.md §4.41):
// each branch's asphalt and painted kerbs along its own centre line, at its own heights, and the
// crash barriers on every kerb of the track as the physics has them (the main road's open at each
// branch's mouth). A track without branches never comes here: trackArt.ts draws its barriers as one
// strip round the loop, as it always did. Built in code like the rest.
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
} from 'three'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { courseOf, type RoadPoint } from '../../../shared/kart/track.ts'
import { groundAt } from '../../../shared/kart/terrain.ts'
import type { Wall } from '../../../shared/kart/walls.ts'
import { ASPHALT_LENGTH, BARRIER_LENGTH, KERB_LENGTH } from './textures.ts'
import type { ArtKit } from './trackArt.ts'

const KERB_WIDTH = 0.9
const BARRIER_HEIGHT = 0.95
const BARRIER_THICKNESS = 0.45
/** A branch lies this little above the main road where the two overlap, metres */
const LIFT = { road: 0.06, kerb: 0.08 }

function mesh(positions: number[], uvs: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A strip between two open lines of points, u across, v along every `every` metres */
function openStrip(
  inner: readonly { x: number; z: number }[],
  outer: readonly { x: number; z: number }[],
  heights: readonly number[],
  along: readonly number[],
  every: number,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  inner.forEach((a, index) => {
    const b = outer[index]!
    const y = heights[index]!
    positions.push(a.x, y, a.z, b.x, y, b.z)
    uvs.push(0, along[index]! / every, 1, along[index]! / every)
    if (index > 0) {
      const at = (index - 1) * 2
      indices.push(at, at + 2, at + 1, at + 1, at + 2, at + 3)
    }
  })
  return mesh(positions, uvs, indices)
}

/** Each point's two edges, `inset` metres in from the kerb */
function openEdges(path: readonly RoadPoint[], inset = 0) {
  return path.map((point, index) => {
    const { dx, dz } = pathDirection(path, index, false)
    const half = point.width / 2 - inset
    return {
      left: { x: point.x + dz * half, z: point.z - dx * half },
      right: { x: point.x - dz * half, z: point.z + dx * half },
    }
  })
}

/** Barriers on wall segments, all in one mesh: a face, a top and a back down to the ground below */
function segmentBarriers(walls: readonly Wall[], heightAt: (x: number, z: number) => number) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const wall of walls) {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az)
    if (length < 0.05) continue
    // Square to the wall; which side faces the road does not matter, both are drawn
    const nx = -(wall.bz - wall.az) / length
    const nz = (wall.bx - wall.ax) / length
    const ends = [
      { x: wall.ax, z: wall.az, u: 0 },
      { x: wall.bx, z: wall.bz, u: length / BARRIER_LENGTH },
    ]
    const start = positions.length / 3
    for (const end of ends) {
      const base = heightAt(end.x, end.z)
      const bx = end.x + nx * BARRIER_THICKNESS
      const bz = end.z + nz * BARRIER_THICKNESS
      positions.push(
        end.x,
        base,
        end.z,
        end.x,
        base + BARRIER_HEIGHT,
        end.z,
        bx,
        base + BARRIER_HEIGHT,
        bz,
        bx,
        base - 4,
        bz,
      )
      uvs.push(end.u, 0, end.u, 0.82, end.u, 1, end.u, 0)
    }
    const a = start
    const b = start + 4
    indices.push(a, b, a + 1, a + 1, b, b + 1)
    indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
    indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3)
  }
  return mesh(positions, uvs, indices)
}

/** The branches' roads and kerbs, and the barriers on every kerb of the track */
export function buildForks(kit: ArtKit): void {
  const { track, keep, own, textures, group, shadowed } = kit
  const forks = track.forks ?? []
  if (forks.length === 0) return
  const terrain = courseOf(track).terrain
  const heightAt = (x: number, z: number) => (terrain ? groundAt(terrain, x, z).y : 0)
  const asphalt = own(
    new MeshLambertMaterial({
      map: textures.asphalt,
      side: DoubleSide,
      // Over the main road where the two overlap, at any distance
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }),
  )
  const kerb = own(new MeshLambertMaterial({ map: textures.kerb, side: DoubleSide }))
  for (const fork of forks) {
    const { path } = fork
    const along = [0]
    for (let index = 1; index < path.length; index++) {
      const a = path[index - 1]!
      const b = path[index]!
      along.push(along[index - 1]! + Math.hypot(b.x - a.x, b.z - a.z))
    }
    const heights = path.map((point) => point.y ?? 0)
    const sides = openEdges(path)
    const inner = openEdges(path, KERB_WIDTH)
    group.add(
      shadowed(
        new Mesh(
          keep(
            openStrip(
              sides.map((side) => side.left),
              sides.map((side) => side.right),
              heights.map((y) => y + LIFT.road),
              along,
              ASPHALT_LENGTH,
            ),
          ),
          asphalt,
        ),
        false,
      ),
    )
    for (const side of ['left', 'right'] as const) {
      group.add(
        shadowed(
          new Mesh(
            keep(
              openStrip(
                sides.map((edge) => edge[side]),
                inner.map((edge) => edge[side]),
                heights.map((y) => y + LIFT.kerb),
                along,
                KERB_LENGTH,
              ),
            ),
            kerb,
          ),
          false,
        ),
      )
    }
  }
  // The kerbs as the physics has them: every wall but the track's own extra ones, which come last
  const kerbs = track.allWalls.slice(0, track.allWalls.length - track.walls.length)
  group.add(
    shadowed(
      new Mesh(
        keep(segmentBarriers(kerbs, heightAt)),
        own(new MeshLambertMaterial({ map: textures.barrier, side: DoubleSide })),
      ),
    ),
  )
}
