// 2026-11-20 (owner: "a technical track you learn by heart"; docs/KART-WORLD.md §6.4): what makes
// the places that tell the drivers apart easy to see and to remember, without telling anyone how to
// drive them. The way through in one colour (skillCue.path): light strips down both sides of every
// slot, a lamp on each, chevrons painted on the road leading in; the same chevrons into every
// branch, beacons at its mouth. The drift jumps in another (skillCue.jump): lamps on posts at both
// ends of the lip, chevrons on the line a drift jump takes, leaning the way the drift goes. A fence
// a flier clears blinks along its top. The lamps pulse; nothing else moves. Instanced: five draws.
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import { pathDirection } from '../../../shared/kart/branches.ts'
import { roadDirection } from '../../../shared/kart/track.ts'
import { acrossRoad, type TrackGuide } from '../../../shared/kart/tracks/guide.ts'
import { roadClearance } from '../../../shared/kart/scenery.ts'
import { skillCue } from '../../styles/kartTokens.ts'
import { chevronTexture, roadAt } from './skillKit.ts'
import type { Slot, WallRun } from './skillWalls.ts'
import type { ArtKit } from './trackArt.ts'

/** A chevron painted on the road is this big, metres, and this far above it */
const CHEVRON = 5.2
const PAINT_LIFT = 0.13
const POST_HEIGHT = 3.2

interface Mark {
  readonly x: number
  readonly y: number
  readonly z: number
  /** As an Object3D's rotation.y: a decal laid flat points its -z this way */
  readonly turn: number
}

/** The turn that points a flat decal's -z along (dx, dz) */
const pointing = (dx: number, dz: number) => Math.atan2(-dx, -dz)

export interface SkillCues {
  update(seconds: number): void
}

export function buildSkillCues(
  kit: ArtKit,
  options: {
    readonly guide: TrackGuide | null
    readonly runs: readonly WallRun[]
    readonly slots: readonly Slot[]
    readonly roadHeight: (index: number) => number
  },
): SkillCues {
  const { track } = kit
  const { road } = track
  const { slots, runs, roadHeight } = options
  // A guide drawn for another road (an editor copy of the track) is no use here
  const guide = options.guide && options.guide.tech.length === road.length ? options.guide : null

  const pathMarks: Mark[] = []
  const jumpMarks: Mark[] = []
  const pathLamps: { x: number; y: number; z: number }[] = []
  const jumpLamps: { x: number; y: number; z: number }[] = []
  const strips: { x: number; y: number; z: number; turn: number; height: number }[] = []
  const posts: { x: number; y: number; z: number }[] = []

  // ── Slots: a light strip down each end, a lamp on top, chevrons on the road leading in ──
  for (const slot of slots) {
    const turn = -Math.atan2(slot.uz, slot.ux)
    for (const end of slot.ends) {
      // On the end's face, toward the gap
      const toward = end === slot.ends[0] ? 1 : -1
      strips.push({
        x: end.x + slot.ux * toward * 0.12,
        y: slot.base + 3,
        z: end.z + slot.uz * toward * 0.12,
        turn,
        height: 5.2,
      })
      pathLamps.push({ x: end.x, y: slot.base + 8.1, z: end.z })
    }
    // The way through runs across the gap; driven the way the road runs there
    const near = roadAt(track, slot.x, slot.z)
    let nx = -slot.uz
    let nz = slot.ux
    if (nx * near.dx + nz * near.dz < 0) {
      nx = -nx
      nz = -nz
    }
    for (const back of [7, 13, 19]) {
      const x = slot.x - nx * back
      const z = slot.z - nz * back
      if (roadClearance(road, x, z) > -CHEVRON / 2) continue
      pathMarks.push({ x, y: roadAt(track, x, z).y + PAINT_LIFT, z, turn: pointing(nx, nz) })
    }
  }

  // ── Branches: chevrons where each leaves the road, a beacon each side of its mouth ──
  for (const fork of track.forks ?? []) {
    const { path } = fork
    // Down its first few points, every other one
    for (let index = 1; index < Math.min(path.length - 1, 6); index += 2) {
      const point = path[index]!
      const { dx, dz } = pathDirection(path, index, false)
      pathMarks.push({ x: point.x, y: (point.y ?? 0) + PAINT_LIFT + 0.04, z: point.z, turn: pointing(dx, dz) })
    }
    const mouth = Math.min(path.length - 2, 4)
    const at = path[mouth]!
    const { dx, dz } = pathDirection(path, mouth, false)
    for (const side of [-1, 1]) {
      const reach = at.width / 2 + 1.6
      const x = at.x - dz * reach * side
      const z = at.z + dx * reach * side
      if (roadClearance(road, x, z) < 0.3) continue
      posts.push({ x, y: at.y ?? 0, z })
      pathLamps.push({ x, y: (at.y ?? 0) + POST_HEIGHT + 0.25, z })
    }
  }

  // ── Jumps: lamps at both ends of the lip; chevrons up the line a drift jump takes ──
  for (const lip of track.jumps ?? []) {
    const point = road[lip]!
    const { dx, dz } = roadDirection(road, lip)
    for (const side of [-1, 1]) {
      const reach = point.width / 2 + 1.4
      const x = point.x - dz * reach * side
      const z = point.z + dx * reach * side
      if (roadClearance(road, x, z) < 0.3) continue
      posts.push({ x, y: roadHeight(lip), z })
      jumpLamps.push({ x, y: roadHeight(lip) + POST_HEIGHT + 0.25, z })
    }
    const cue = guide?.cues.find((one) => one.lip === lip)
    // The way a branch leaves from the lip, if one does (the works' deck): the drift goes that way
    const fork = (track.forks ?? []).find((one) => Math.abs(one.from - lip) <= 2)
    let way = cue?.way ?? 0
    if (!cue && fork) {
      const far = fork.path[Math.min(fork.path.length - 1, 6)]!
      way = (far.x - point.x) * -dz + (far.z - point.z) * dx > 0 ? 1 : -1
    }
    const steps = [10, 7, 4]
    steps.forEach((back, k) => {
      const index = lip - back
      if (index < 0) return
      const across = guide ? guide.tech[index]! : way * -4
      const place = acrossRoad(road, index, across)
      const here = roadDirection(road, index)
      // Leaning further into the drift the nearer the lip
      const lean = way * (0.18 + k * 0.14)
      const c = Math.cos(lean)
      const s = Math.sin(lean)
      // Turning (dx, dz) right by `lean`: right of the road is (-dz, dx)
      const tx = here.dx * c - here.dz * s
      const tz = here.dz * c + here.dx * s
      jumpMarks.push({ x: place.x, y: roadHeight(index) + PAINT_LIFT, z: place.z, turn: pointing(tx, tz) })
    })
  }

  // ── A fence a flier clears: lamps along its top ──
  for (const run of runs.filter((one) => one.fence)) {
    const count = Math.max(2, Math.round(run.span / 5))
    for (let k = 0; k <= count; k++) {
      const share = k / count
      jumpLamps.push({
        x: run.ax + (run.bx - run.ax) * share,
        y: run.base + Math.max(0.95, run.height) + 0.25,
        z: run.az + (run.bz - run.az) * share,
      })
    }
  }

  // ── Drawn ──
  const chevron = chevronTexture(kit)
  const flat = kit.keep(new PlaneGeometry(CHEVRON * 0.8, CHEVRON))
  flat.rotateX(-Math.PI / 2)
  const paint = (marks: readonly Mark[], hex: string) => {
    if (marks.length === 0) return
    const material = kit.own(
      new MeshBasicMaterial({
        color: hex,
        map: chevron,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    const mesh = new InstancedMesh(flat, material, marks.length)
    marks.forEach((mark, index) => kit.place(mesh, index, mark.x, mark.y, mark.z, [1, 1, 1], mark.turn))
    mesh.renderOrder = 1
    kit.group.add(mesh)
  }
  paint(pathMarks, skillCue.path)
  paint(jumpMarks, skillCue.jump)

  const pulsing: { material: MeshBasicMaterial; base: Color; phase: number }[] = []
  const lamp = kit.keep(new SphereGeometry(0.32, 8, 6))
  const lamps = (where: readonly { x: number; y: number; z: number }[], hex: string, phase: number) => {
    if (where.length === 0) return
    const material = kit.own(new MeshBasicMaterial({ color: hex }))
    const mesh = new InstancedMesh(lamp, material, where.length)
    where.forEach((one, index) => kit.place(mesh, index, one.x, one.y, one.z, [1, 1, 1]))
    kit.group.add(mesh)
    pulsing.push({ material, base: new Color(hex), phase })
  }
  lamps(pathLamps, skillCue.path, 0)
  lamps(jumpLamps, skillCue.jump, 0.5)

  if (strips.length > 0) {
    const material = kit.own(new MeshBasicMaterial({ color: skillCue.path }))
    const mesh = new InstancedMesh(kit.keep(new BoxGeometry(0.22, 1, 0.5)), material, strips.length)
    strips.forEach((one, index) => kit.place(mesh, index, one.x, one.y, one.z, [1, one.height, 1], one.turn))
    kit.group.add(mesh)
  }
  if (posts.length > 0) {
    const mesh = new InstancedMesh(
      kit.keep(new BoxGeometry(0.22, POST_HEIGHT, 0.22)),
      kit.standard(skillCue.post),
      posts.length,
    )
    posts.forEach((one, index) => kit.place(mesh, index, one.x, one.y + POST_HEIGHT / 2, one.z, [1, 1, 1]))
    kit.group.add(kit.shadowed(mesh))
  }

  return {
    update(seconds) {
      for (const one of pulsing) {
        // A slow beat: bright, then dimmer, never dark
        const beat = 0.55 + 0.45 * Math.max(0, Math.sin((seconds * 1.6 + one.phase) * Math.PI * 2))
        one.material.color.copy(one.base).multiplyScalar(beat)
      }
    },
  }
}
