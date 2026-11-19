// The drivers (e10-t05b): four racers of our own, made in code, card suits made people (the club is
// our bridge club; docs/KART-WORLD.md). 2026-11-18 (owner: "the people need to be more esports ...
// they look like a child's toy"): no longer chibi. A racer of a person's proportions, seated: a
// full-face helmet cut in flat faces with a mirror visor, the suit's sign on its crown as the team's
// logo (seen from the chase camera behind), a race suit in colour blocks with the racing number on
// its back, gloves and boots. Looks only: every driver drives the same. The kart model mounts the
// driver at its seat (kartModel.ts), so any driver sits in any kart, and moves them: the torso
// leans into a turn and is thrown back by a boost, the arms stay on the yoke, a hit makes them sway.
import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Shape,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import { kartDrivers } from '../../styles/kartTokens.ts'
import { hull, wedge, type BodyKit } from './kartParts.ts'

export interface DriverModel {
  /** Placed at the kart's seat */
  readonly group: Group
  /** Everything above the seat: leans into a turn, back in a boost, sways when stunned */
  readonly torso: Group
  /** Turns to look where the driver steers */
  readonly head: Group
  /** Left and right, from the shoulder to the yoke: they follow it */
  readonly arms: readonly [Group, Group]
}

/** The suit's sign, flat in x (across) and y (up), about 0.27 tall, its foot at the origin */
function crestShapes(driver: DriverId): Shape[] {
  const shape = new Shape()
  switch (driver) {
    case 'spade':
      // A point on top, two round lobes, a short flared stem
      shape.moveTo(0, 0.27)
      shape.bezierCurveTo(0.05, 0.2, 0.15, 0.15, 0.13, 0.08)
      shape.bezierCurveTo(0.11, 0.02, 0.04, 0.03, 0.02, 0.06)
      shape.lineTo(0.06, 0)
      shape.lineTo(-0.06, 0)
      shape.lineTo(-0.02, 0.06)
      shape.bezierCurveTo(-0.04, 0.03, -0.11, 0.02, -0.13, 0.08)
      shape.bezierCurveTo(-0.15, 0.15, -0.05, 0.2, 0, 0.27)
      return [shape]
    case 'heart':
      shape.moveTo(0, 0)
      shape.bezierCurveTo(0.08, 0.06, 0.16, 0.12, 0.14, 0.2)
      shape.bezierCurveTo(0.12, 0.27, 0.03, 0.27, 0, 0.2)
      shape.bezierCurveTo(-0.03, 0.27, -0.12, 0.27, -0.14, 0.2)
      shape.bezierCurveTo(-0.16, 0.12, -0.08, 0.06, 0, 0)
      return [shape]
    case 'diamond':
      shape.moveTo(0, 0)
      shape.lineTo(0.1, 0.13)
      shape.lineTo(0, 0.27)
      shape.lineTo(-0.1, 0.13)
      shape.closePath()
      return [shape]
    case 'club': {
      // Three discs and a flared stem
      const discs = (
        [
          [0, 0.2],
          [-0.075, 0.1],
          [0.075, 0.1],
        ] as const
      ).map(([x, y]) => {
        const disc = new Shape()
        disc.absarc(x, y, 0.07, 0, Math.PI * 2, false)
        return disc
      })
      shape.moveTo(-0.05, 0)
      shape.lineTo(0.05, 0)
      shape.lineTo(0.015, 0.12)
      shape.lineTo(-0.015, 0.12)
      shape.closePath()
      return [...discs, shape]
    }
  }
}

const UP = new Vector3(0, 1, 0)
type Point = readonly [number, number, number]

/** A limb from `a` to `b`, `r0` thick at `a` and `r1` at `b` */
function limb(
  kit: BodyKit,
  parent: Object3D,
  material: Material,
  a: Point,
  b: Point,
  r0: number,
  r1: number,
): void {
  const from = new Vector3(...a)
  const along = new Vector3(...b).sub(from)
  const length = along.length()
  const mesh = kit.put(
    parent,
    new CylinderGeometry(r1, r0, length, 6),
    material,
    from.x + along.x / 2,
    from.y + along.y / 2,
    from.z + along.z / 2,
  )
  mesh.quaternion.setFromUnitVectors(UP, along.normalize())
}

/** A hull standing up: its sections' `z` is the height, its crest the front, its keel the back */
const standing = (sections: Parameters<typeof hull>[0]) => hull(sections).rotateX(-Math.PI / 2)

/**
 * `astride` (2026-11-19): on a bike. The legs go down either side to the pegs, knees forward,
 * instead of out ahead into a kart's nose; the model lays the torso forward (kartModel.ts)
 */
export function buildDriver(kit: BodyKit, driver: DriverId, astride = false): DriverModel {
  const colours = kartDrivers[driver]
  const suit = kit.colour(colours.suit, 0.8, 0.05)
  const panel = kit.colour(colours.panel, 0.55, 0.1, 0.12)
  const helmet = kit.colour(colours.helmet, 0.28, 0.25)
  const crest = kit.colour(colours.crest, 0.35, 0.2, 0.5)
  const trim = kit.colour(colours.trim, 0.6, 0.1)
  // A mirror: all reflection, tinted
  const visor = kit.colour(colours.visor, 0.05, 1)
  const { carbon } = kit.paint

  const group = new Group()
  // Seated: the thighs forward and up to the knees, the shins down into the nose, boots
  for (const side of [-1, 1]) {
    if (astride) {
      // Astride: the thighs forward and down round the tank, the shins back to the pegs, boots
      const knee: Point = [side * 0.215, -0.02, -0.34]
      const ankle: Point = [side * 0.2, -0.21, -0.04]
      limb(kit, group, suit, [side * 0.1, 0.09, 0], knee, 0.085, 0.066)
      limb(kit, group, suit, knee, ankle, 0.062, 0.046)
      limb(kit, group, panel, [side * 0.2, 0.0, -0.26], [side * 0.222, -0.03, -0.37], 0.066, 0.072)
      limb(kit, group, trim, ankle, [side * 0.2, -0.24, -0.17], 0.05, 0.04)
      continue
    }
    limb(kit, group, suit, [side * 0.09, 0.1, 0], [side * 0.12, 0.21, -0.4], 0.085, 0.065)
    limb(kit, group, suit, [side * 0.12, 0.21, -0.4], [side * 0.1, 0.07, -0.76], 0.06, 0.045)
    limb(kit, group, panel, [side * 0.117, 0.24, -0.3], [side * 0.123, 0.26, -0.4], 0.062, 0.07)
    limb(kit, group, trim, [side * 0.1, 0.07, -0.76], [side * 0.1, 0.11, -0.9], 0.05, 0.04)
  }

  const torso = new Group()
  torso.position.set(0, 0.1, 0)
  group.add(torso)
  // The trunk: hips, a waist, a chest, shoulders
  kit.put(
    torso,
    standing([
      { z: -0.04, w: 0.15, top: 0.1, bottom: 0.1 },
      { z: 0.06, w: 0.17, top: 0.11, bottom: 0.11 },
      { z: 0.22, w: 0.15, top: 0.1, bottom: 0.09 },
      { z: 0.4, w: 0.2, top: 0.12, bottom: 0.1 },
      { z: 0.49, w: 0.19, top: 0.09, bottom: 0.09 },
      { z: 0.53, w: 0.08, top: 0.06, bottom: 0.06 },
    ]),
    suit,
  )
  // Colour blocks: a yoke over the shoulders and chest, a panel down each flank, a belt
  kit.put(
    torso,
    standing([
      { z: 0.33, w: 0.185, top: 0.118, bottom: 0.1 },
      { z: 0.405, w: 0.208, top: 0.128, bottom: 0.108 },
      { z: 0.495, w: 0.198, top: 0.098, bottom: 0.098 },
      { z: 0.535, w: 0.09, top: 0.066, bottom: 0.066 },
    ]),
    panel,
  )
  for (const side of [-1, 1]) {
    limb(kit, torso, panel, [side * 0.158, 0.06, 0], [side * 0.176, 0.33, 0], 0.03, 0.035)
  }
  kit.put(
    torso,
    standing([
      { z: 0.035, w: 0.176, top: 0.116, bottom: 0.116 },
      { z: 0.075, w: 0.176, top: 0.116, bottom: 0.116 },
    ]),
    trim,
  )
  // The collar: a carbon neck brace, raised behind the head
  kit.put(
    torso,
    standing([
      { z: 0.52, w: 0.14, top: 0.1, bottom: 0.13 },
      { z: 0.575, w: 0.12, top: 0.085, bottom: 0.14 },
    ]),
    carbon,
  )
  // The racing number across the back
  kit.decal(torso, 'number', 0.24, 0.12, 0, 0.27, 0.105, 'back')

  const arms = [-1, 1].map((side) => {
    const arm = new Group()
    arm.position.set(side * 0.2, 0.44, 0)
    // The shoulder's pad, the upper arm to the elbow, the forearm to the grip, a glove
    const elbow: Point = [side * 0.045, -0.22, -0.2]
    const hand: Point = [side * -0.085, -0.14, -0.45]
    limb(kit, arm, panel, [0, 0.01, 0], [side * 0.02, -0.1, -0.09], 0.07, 0.058)
    limb(kit, arm, suit, [side * 0.02, -0.1, -0.09], elbow, 0.055, 0.047)
    limb(kit, arm, suit, elbow, hand, 0.047, 0.038)
    limb(kit, arm, trim, [side * -0.06, -0.155, -0.4], [side * -0.09, -0.135, -0.47], 0.042, 0.046)
    torso.add(arm)
    return arm
  }) as [Group, Group]

  const head = new Group()
  head.position.set(0, 0.7, -0.01)
  // The shell: a chin bar forward, a crown, a tail
  kit.put(
    head,
    hull([
      { z: -0.205, w: 0.05, top: 0.03, bottom: 0.1, y: -0.035, sh: 0.6 },
      { z: -0.16, w: 0.115, top: 0.115, bottom: 0.13, y: -0.02 },
      { z: -0.04, w: 0.158, top: 0.168, bottom: 0.14, y: 0 },
      { z: 0.09, w: 0.155, top: 0.16, bottom: 0.13, y: 0.005 },
      { z: 0.19, w: 0.095, top: 0.085, bottom: 0.1, y: 0.01 },
    ]),
    helmet,
  )
  // The visor: a mirror band round the front
  kit.put(
    head,
    hull([
      { z: -0.2, w: 0.075, top: 0.05, bottom: 0.03, y: 0.035, sw: 0.75, sh: 0.9 },
      { z: -0.15, w: 0.135, top: 0.062, bottom: 0.045, y: 0.035, sw: 0.8, sh: 0.9 },
      { z: -0.045, w: 0.166, top: 0.05, bottom: 0.05, y: 0.035, sw: 0.85, sh: 0.9 },
    ]),
    visor,
  )
  // Vents on the chin, a stripe over the crown in the team's colour, a spoiler at the back
  for (const side of [-1, 1]) {
    kit.put(head, wedge(0.03, 0.07, 0.012, 0.012), carbon, side * 0.06, -0.1, -0.165)
  }
  kit.put(head, wedge(0.05, 0.2, 0.012, 0.012), crest, 0, 0.158, -0.02).rotation.x = -0.04
  kit.put(head, wedge(0.2, 0.09, 0.012, 0.035), carbon, 0, 0.02, 0.19).rotation.x = -0.35
  // A band round the helmet's base
  kit.put(
    head,
    hull([
      { z: -0.15, w: 0.125, top: 0.02, bottom: 0.02, y: -0.14 },
      { z: -0.03, w: 0.162, top: 0.02, bottom: 0.02, y: -0.135 },
      { z: 0.1, w: 0.158, top: 0.02, bottom: 0.02, y: -0.125 },
      { z: 0.18, w: 0.1, top: 0.02, bottom: 0.02, y: -0.09 },
    ]),
    trim,
  )
  // The team's logo: the suit's sign, lying on the back of the crown, facing the camera behind
  const sign = new ExtrudeGeometry(crestShapes(driver), {
    depth: 0.014,
    bevelEnabled: false,
    curveSegments: 6,
  })
  sign.scale(0.62, 0.62, 1)
  kit.put(head, sign, crest, 0, 0.075, 0.2).rotation.x = -0.92
  torso.add(head)
  return { group, torso, head, arms }
}
