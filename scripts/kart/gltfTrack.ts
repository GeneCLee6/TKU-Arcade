// e8-t04: a track from a Blender scene exported as glTF (.gltf, JSON), by the names of its empties.
// The pure part of scripts/kart/build-track.ts, so that tests can run it on a scene made in code.
//
// The naming convention (docs/ARCHITECTURE.md §4.3). Every empty sits at the top level of the scene
// (not parented): only its own position and rotation are read. Positions are on the ground plane.
//
//   road.000, road.001, …   the centre line, in driving order, as a closed loop. Custom property
//                           `width` (metres); without it, DEFAULT_WIDTH
//   gate.00, gate.01, …     optional: a gate across the road at each, gate.00 the finish line; its
//                           width is the road's there. Without any, one every `gateEvery` road
//                           points (custom property on the scene, default 6)
//   grid.0, grid.1, …       the starting grid, pole first
//   wall.<name>.000, …      an extra wall through these points; `closed: true` on .000 closes it
//   boost.0, …              a boost pad; custom properties `length` and `width`
//   item.0, …               an item box
//   decor.<model>.0, …      a model from the track's assets; its scale is the empty's
//
// Facing: an empty faces along its local +Y axis in Blender (glTF's -Z after export), so grid places
// and boost pads point where a "single arrow" empty, rotated onto +Y, points.
import type { Spot } from '../../shared/kart/course.ts'
import {
  gatesAlong,
  headingOf,
  roadDirection,
  TRACK_FORMAT,
  type BoostPad,
  type Decor,
  type Gate,
  type RoadPoint,
  type TrackJson,
} from '../../shared/kart/track.ts'
import type { Wall } from '../../shared/kart/walls.ts'

export const DEFAULT_WIDTH = 12
export const DEFAULT_GATE_EVERY = 6

export interface GltfNode {
  name?: string
  translation?: [number, number, number]
  rotation?: [number, number, number, number]
  scale?: [number, number, number]
  extras?: Record<string, unknown>
}

export interface Gltf {
  scene?: number
  scenes?: { nodes?: number[]; extras?: Record<string, unknown> }[]
  nodes?: GltfNode[]
}

export interface TrackMeta {
  id: string
  name: { en: string; 'zh-TW': string }
  laps: number
}

const at = (node: GltfNode) => ({ x: node.translation?.[0] ?? 0, z: node.translation?.[2] ?? 0 })

/** The heading the node's -Z axis points along, flattened onto the ground */
export function headingOfNode(node: GltfNode): number {
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  // (0, 0, -1) rotated by the quaternion
  const fx = -(2 * (qx * qz + qw * qy))
  const fz = -(1 - 2 * (qx * qx + qy * qy))
  // + 0: no -0 in a file someone reads
  return Math.atan2(fx, -fz) + 0
}

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

type Named = { node: GltfNode; match: RegExpExecArray }

/** Nodes whose name matches `pattern`, in the order of the number it ends with */
function numbered(nodes: readonly GltfNode[], pattern: RegExp): Named[] {
  return nodes
    .map((node) => ({ node, match: pattern.exec(node.name ?? '') }))
    .filter((entry): entry is Named => entry.match !== null)
    .sort((a, b) => Number(a.match.at(-1)) - Number(b.match.at(-1)))
}

/** The track a scene describes; `parseTrack` checks it afterwards */
export function trackFromGltf(gltf: Gltf, meta: TrackMeta): TrackJson {
  const scene = gltf.scenes?.[gltf.scene ?? 0]
  const all = gltf.nodes ?? []
  const nodes = (scene?.nodes ?? all.map((_, index) => index))
    .map((index) => all[index])
    .filter((node): node is GltfNode => node !== undefined)

  const road: RoadPoint[] = numbered(nodes, /^road\.(\d+)$/).map(({ node }) => ({
    ...at(node),
    width: number(node.extras?.width, DEFAULT_WIDTH),
  }))

  let gates: Gate[] = []
  let respawns: Spot[] = []
  const gateNodes = numbered(nodes, /^gate\.(\d+)$/)
  if (gateNodes.length > 0 && road.length > 0) {
    for (const { node } of gateNodes) {
      const { x, z } = at(node)
      // The road point nearest the gate says how wide the road is and which way it goes there
      let nearest = 0
      road.forEach((point, index) => {
        const best = road[nearest]!
        if (Math.hypot(point.x - x, point.z - z) < Math.hypot(best.x - x, best.z - z))
          nearest = index
      })
      const direction = roadDirection(road, nearest)
      const half = road[nearest]!.width / 2
      gates.push({
        ax: x + direction.dz * half,
        az: z - direction.dx * half,
        bx: x - direction.dz * half,
        bz: z + direction.dx * half,
      })
      respawns.push({ x, z, heading: headingOf(direction) })
    }
  } else if (road.length > 0) {
    ;({ gates, respawns } = gatesAlong(road, number(scene?.extras?.gateEvery, DEFAULT_GATE_EVERY)))
  }

  const spotOf = (node: GltfNode): Spot => ({ ...at(node), heading: headingOfNode(node) })
  const grid = numbered(nodes, /^grid\.(\d+)$/).map(({ node }) => spotOf(node))

  const chains = new Map<string, GltfNode[]>()
  for (const { node, match } of numbered(nodes, /^wall\.([a-z0-9-]+)\.(\d+)$/)) {
    const name = match[1]!
    chains.set(name, [...(chains.get(name) ?? []), node])
  }
  const walls: Wall[] = []
  for (const chain of chains.values()) {
    const closed = chain[0]?.extras?.closed === true
    const count = closed ? chain.length : chain.length - 1
    for (let index = 0; index < count; index++) {
      const a = at(chain[index]!)
      const b = at(chain[(index + 1) % chain.length]!)
      walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z })
    }
  }

  const boostPads: BoostPad[] = numbered(nodes, /^boost\.(\d+)$/).map(({ node }) => ({
    ...spotOf(node),
    length: number(node.extras?.length, 8),
    width: number(node.extras?.width, 4),
  }))
  const itemBoxes = numbered(nodes, /^item\.(\d+)$/).map(({ node }) => at(node))
  const decor: Decor[] = numbered(nodes, /^decor\.([a-z0-9-]+)\.(\d+)$/).map(({ node, match }) => ({
    ...spotOf(node),
    model: match[1]!,
    scale: node.scale?.[0] ?? 1,
  }))

  return {
    format: TRACK_FORMAT,
    id: meta.id,
    name: meta.name,
    laps: meta.laps,
    road,
    gates,
    respawns,
    grid,
    walls,
    boostPads,
    itemBoxes,
    decor,
  }
}
