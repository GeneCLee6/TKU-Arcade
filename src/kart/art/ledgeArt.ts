// 2026-11-23 (shared/kart/ledges.ts, docs/KART-WORLD.md §6.5): the art of a track's high platforms.
// The platform's road itself is a branch's and forkArt.ts draws it at its own height; here is what
// it stands on and what shows the way onto it:
//
// - the building under it: walls from the ground up to the road's edge on both sides, a parapet
//   along the top, a row of lit windows, and the face across its front in warning stripes (always
//   drawn: it is the thing a kart hits);
// - the cues (skillCue.jump, the amber of the jumps, #115), shown or hidden with the rest by the
//   controls panel's track cues switch: chevrons on the road before the ramp leaning the way the
//   kart must leave it, lamps along the face's top and on a post at each of its ends. The lamps
//   pulse; nothing else moves.
//
// A track without platforms never comes here. Original, built in code like the rest.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { trackLedges, type Ledge } from '../../../shared/kart/ledges.ts'
import type { RoadPoint } from '../../../shared/kart/track.ts'
import { ledgeScene, skillCue } from '../../styles/kartTokens.ts'
import { chevronTexture } from './skillKit.ts'
import type { ArtKit } from './trackArt.ts'
import { forwardId } from '../../../shared/kart/tracks/reverseId.ts'

/** The building's walls reach this far below the ground, metres (no gap on a slope) */
const FOOTING = 1
/** The parapet: this high over the roof and this thick, metres */
const PARAPET = 0.5
const PARAPET_THICK = 0.4
/** A stripe on the face is this wide, metres */
const STRIPE = 1.2
/** A chevron is this big, and this far above the road; lamps this far apart along the face */
const CHEVRON = 5.2
const PAINT_LIFT = 0.13
const LAMP_EVERY = 2
const POST_HEIGHT = 3.2

export interface LedgeArt {
  update(seconds: number): void
  setVisible(on: boolean): void
}

/** The platform's own stretch of its branch: from the face's head to its last high point */
export function platformStretch(path: readonly RoadPoint[], rise: number, top: number): number[] {
  const indices: number[] = []
  for (let index = rise; index < path.length; index++) {
    // Its pits included (a gap's floor is a metre or two down), not the way down at its end
    if ((path[index]!.y ?? 0) < top - 2.5) break
    indices.push(index)
  }
  return indices
}

/** A wall of quads down from the edge points to the ground under them */
function skirt(
  edge: readonly { x: number; z: number; y: number }[],
  ground: (x: number, z: number) => number,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let run = 0
  edge.forEach((point, index) => {
    if (index > 0) run += Math.hypot(point.x - edge[index - 1]!.x, point.z - edge[index - 1]!.z)
    const low = ground(point.x, point.z) - FOOTING
    positions.push(point.x, point.y, point.z, point.x, low, point.z)
    uvs.push(run / 4, point.y - low, run / 4, 0)
    if (index > 0) {
      const at = (index - 1) * 2
      indices.push(at, at + 2, at + 1, at + 1, at + 2, at + 3)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function buildLedges(
  kit: ArtKit,
  ground: (x: number, z: number) => number,
): LedgeArt | null {
  const { track, keep, own, group, shadowed, standard } = kit
  const ledges = trackLedges(track)
  if (ledges.length === 0) return null
  const wallColour =
    ledgeScene.walls[forwardId(track.id) as keyof typeof ledgeScene.walls] ?? ledgeScene.walls.other
  const wall = standard(wallColour)
  wall.side = DoubleSide
  const parapet = standard(ledgeScene.parapet)
  const windows: { x: number; y: number; z: number; turn: number }[] = []
  const parapets: { x: number; y: number; z: number; turn: number; length: number }[] = []
  const stripes: { x: number; y: number; z: number; turn: number; height: number; dark: boolean }[] =
    []
  const cueMarks: { x: number; y: number; z: number; turn: number }[] = []
  const lamps: { x: number; y: number; z: number }[] = []
  const posts: { x: number; y: number; z: number }[] = []

  for (const ledge of ledges) {
    const fork = track.forks![ledge.fork]!
    const { path } = fork
    const stretch = platformStretch(path, fork.rise!, ledge.top)
    // ── The building: both sides' walls, from the face's foot to the platform's last point ──
    for (const side of [-1, 1] as const) {
      const edge = [fork.rise! - 1, ...stretch].map((index) => {
        const point = path[index]!
        const { dx, dz } = pathDirection(path, index, false)
        const half = point.width / 2 + 0.25
        // The road's right, facing along it, is (-dz, dx)
        return {
          x: point.x - dz * half * side,
          z: point.z + dx * half * side,
          y: index === fork.rise! - 1 ? ledge.top : (point.y ?? 0),
        }
      })
      group.add(shadowed(new Mesh(keep(skirt(edge, ground)), wall)))
      edge.forEach((point, index) => {
        const next = edge[index + 1]
        if (!next) return
        const length = Math.hypot(next.x - point.x, next.z - point.z)
        const turn = Math.atan2(-(next.z - point.z), next.x - point.x)
        parapets.push({
          x: (point.x + next.x) / 2,
          y: Math.max(point.y, next.y) + PARAPET / 2,
          z: (point.z + next.z) / 2,
          turn,
          length,
        })
        // A lit window under every other stretch, a storey down
        if (index % 2 === 0 && point.y - ground(point.x, point.z) > 2.2) {
          windows.push({ x: (point.x + next.x) / 2, y: point.y - 1.4, z: (point.z + next.z) / 2, turn })
        }
      })
    }
    // ── The face: warning stripes across the front, from the ground to the roof ──
    const { face } = ledge
    const span = Math.hypot(face.bx - face.ax, face.bz - face.az)
    const count = Math.max(2, Math.round(span / STRIPE))
    const turn = Math.atan2(-(face.bz - face.az), face.bx - face.ax)
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count
      const x = face.ax + (face.bx - face.ax) * t
      const z = face.az + (face.bz - face.az) * t
      const low = ground(x, z) - FOOTING
      stripes.push({ x, y: (ledge.top + low) / 2, z, turn, height: ledge.top - low, dark: k % 2 === 1 })
    }
    addCues(ledge, path, fork.rise!, cueMarks, lamps, posts, ground)
  }

  const drawn: (Mesh | InstancedMesh)[] = []
  const box = keep(new BoxGeometry(1, 1, 1))
  if (parapets.length > 0) {
    const mesh = new InstancedMesh(box, parapet, parapets.length)
    parapets.forEach((one, index) =>
      kit.place(mesh, index, one.x, one.y, one.z, [one.length + 0.2, PARAPET, PARAPET_THICK], one.turn),
    )
    group.add(shadowed(mesh))
  }
  if (windows.length > 0) {
    const mesh = new InstancedMesh(
      box,
      own(new MeshBasicMaterial({ color: ledgeScene.window })),
      windows.length,
    )
    windows.forEach((one, index) => kit.place(mesh, index, one.x, one.y, one.z, [2.2, 1, 0.62], one.turn))
    group.add(mesh)
  }
  for (const dark of [false, true]) {
    const some = stripes.filter((one) => one.dark === dark)
    if (some.length === 0) continue
    const mesh = new InstancedMesh(
      box,
      standard(dark ? skillCue.hazardDark : skillCue.hazard),
      some.length,
    )
    some.forEach((one, index) =>
      kit.place(mesh, index, one.x, one.y, one.z, [STRIPE, one.height, 0.5], one.turn),
    )
    group.add(shadowed(mesh))
  }

  // ── The cues: shown or hidden with the track cues switch ──
  const flat = keep(new PlaneGeometry(CHEVRON * 0.8, CHEVRON))
  flat.rotateX(-Math.PI / 2)
  const pulsing: { material: MeshBasicMaterial; base: Color }[] = []
  if (cueMarks.length > 0) {
    const material = own(
      new MeshBasicMaterial({
        color: skillCue.jump,
        map: chevronTexture(kit),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    const mesh = new InstancedMesh(flat, material, cueMarks.length)
    cueMarks.forEach((mark, index) => kit.place(mesh, index, mark.x, mark.y, mark.z, [1, 1, 1], mark.turn))
    mesh.renderOrder = 1
    group.add(mesh)
    drawn.push(mesh)
  }
  if (lamps.length > 0) {
    const material = own(new MeshBasicMaterial({ color: skillCue.jump }))
    const mesh = new InstancedMesh(keep(new SphereGeometry(0.32, 8, 6)), material, lamps.length)
    lamps.forEach((one, index) => kit.place(mesh, index, one.x, one.y, one.z, [1, 1, 1]))
    group.add(mesh)
    drawn.push(mesh)
    pulsing.push({ material, base: new Color(skillCue.jump) })
  }
  if (posts.length > 0) {
    const mesh = new InstancedMesh(keep(new BoxGeometry(0.22, POST_HEIGHT, 0.22)), standard(skillCue.post), posts.length)
    posts.forEach((one, index) => kit.place(mesh, index, one.x, one.y + POST_HEIGHT / 2, one.z, [1, 1, 1]))
    group.add(shadowed(mesh))
    drawn.push(mesh)
  }
  return {
    update(seconds) {
      for (const one of pulsing) {
        const beat = 0.55 + 0.45 * Math.max(0, Math.sin((seconds * 1.6 + 0.5) * Math.PI * 2))
        one.material.color.copy(one.base).multiplyScalar(beat)
      }
    },
    setVisible(on) {
      for (const mesh of drawn) mesh.visible = on
    },
  }
}

/** The turn that points a flat decal's -z along (dx, dz) */
const pointing = (dx: number, dz: number) => Math.atan2(-dx, -dz)

/**
 * A platform's cues: three chevrons up the ramp on the line from the road a little before the lip
 * through the lip's middle towards the face, lamps along the face's top, a post and lamp at each end
 */
function addCues(
  ledge: Ledge,
  path: readonly RoadPoint[],
  rise: number,
  marks: { x: number; y: number; z: number; turn: number }[],
  lamps: { x: number; y: number; z: number }[],
  posts: { x: number; y: number; z: number }[],
  ground: (x: number, z: number) => number,
): void {
  const { lip } = ledge
  // The slant: from the lip's middle towards the face's
  const reach = Math.hypot(ledge.faceX - lip.x, ledge.faceZ - lip.z) || 1
  const sx = (ledge.faceX - lip.x) / reach
  const sz = (ledge.faceZ - lip.z) / reach
  for (const back of [16, 10, 4]) {
    // Back along the slant from the lip, but kept on the road
    const x = lip.x - sx * back
    const z = lip.z - sz * back
    const across = (x - lip.x) * -lip.dz + (z - lip.z) * lip.dx
    const keep = Math.max(-lip.half + 3, Math.min(lip.half - 3, across))
    const along = (x - lip.x) * lip.dx + (z - lip.z) * lip.dz
    const px = lip.x + lip.dx * along - lip.dz * keep
    const pz = lip.z + lip.dz * along + lip.dx * keep
    marks.push({ x: px, y: ground(px, pz) + PAINT_LIFT, z: pz, turn: pointing(sx, sz) })
  }
  const { face } = ledge
  const span = Math.hypot(face.bx - face.ax, face.bz - face.az)
  const count = Math.max(2, Math.round(span / LAMP_EVERY))
  for (let k = 0; k <= count; k++) {
    const t = k / count
    lamps.push({
      x: face.ax + (face.bx - face.ax) * t,
      y: ledge.top + PARAPET + 0.3,
      z: face.az + (face.bz - face.az) * t,
    })
  }
  // A post at each end of the face, on the ground beside it
  const { dx, dz } = pathDirection(path, rise, false)
  for (const [x, z] of [
    [face.ax, face.az],
    [face.bx, face.bz],
  ] as const) {
    const px = x - dx * 1.2
    const pz = z - dz * 1.2
    const y = ground(px, pz)
    posts.push({ x: px, y, z: pz })
    lamps.push({ x: px, y: y + POST_HEIGHT + 0.25, z: pz })
  }
}
