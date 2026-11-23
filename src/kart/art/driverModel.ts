// The drivers (e10-t05b): four racers of our own, made in code, card suits made people (the club is
// our bridge club; docs/KART-WORLD.md). 2026-11-18 (owner: "the people need to be more esports ...
// they look like a child's toy"): no longer chibi. A racer of a person's proportions, seated: a
// full-face helmet cut in flat faces with a mirror visor, the suit's sign on its crown as the team's
// logo (seen from the chase camera behind), a race suit in colour blocks with the racing number on
// its back, gloves and boots. Looks only: every driver drives the same. The kart model mounts the
// driver at its seat (kartModel.ts), so any driver sits in any kart.
//
// 2026-11-23 (docs/ARCHITECTURE.md §4.86; owner: "more and more real, more striking ... esports,
// professional"): a skeleton and more detail. Each arm is a shoulder, an elbow and a hand on joints
// of their own (built hanging straight down, so that driverRig.ts can bend them to the wheel and
// kartModel.ts can raise them in a gesture), the hands are gloves with a palm, curled fingers, a thumb
// and a carbon knuckle guard (and two fingers for a V), the helmet has vents, a glint across the
// visor and its hinges, the crest stands out of the crown in relief (and on both cheeks), and the
// suit has shoulder armour, a harness, the number on the chest as well, stitching along its panels,
// knee pads and boots with soles. How much of it by the quality (`DriverDetail`): low keeps the plain
// driver and kartModel.ts merges it standing still.
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Shape,
  Vector3,
  Object3D,
  type Material,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import type { Quality } from '../quality.ts'
import { kartDrivers, kartLivery } from '../../styles/kartTokens.ts'
import { FOREARM, UPPER_ARM } from '../driverRig.ts'
import { hull, wedge, type BodyKit } from './kartParts.ts'

/** How much of the driver is drawn and moved: low, plain and still; medium and high, the full kit */
export type DriverDetail = 'low' | 'medium' | 'high'

/** What each quality draws in a race (Scene.ts); the race room, the podium and the garage draw it full */
export const DRIVER_DETAIL: Readonly<Record<Quality, DriverDetail>> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
}

export interface DriverModel {
  /** Placed at the kart's seat */
  readonly group: Group
  /** Everything above the seat: leans into a turn, back in a boost, sways when stunned */
  readonly torso: Group
  /** Turns to look where the driver steers */
  readonly head: Group
  /** Left and right shoulders: each arm hangs from one, straight down (-y) at rest */
  readonly arms: readonly [Group, Group]
  /** Left and right elbows, bending about their own x */
  readonly elbows: readonly [Group, Group]
  /** Left and right hands' joints, at the end of the forearm (the glove is drawn with the forearm) */
  readonly hands: readonly [Object3D, Object3D]
  /** The right hand's two fingers for a V, hidden until a gesture shows them; none on low */
  readonly vee: Object3D | null
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

/** The crest as a badge: in relief, its edges bevelled, where the detail allows */
function crestBadge(driver: DriverId, raised: boolean): ExtrudeGeometry {
  return new ExtrudeGeometry(crestShapes(driver), {
    depth: raised ? 0.022 : 0.014,
    bevelEnabled: raised,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: raised ? 8 : 6,
  })
}

const UP = new Vector3(0, 1, 0)
const box = (w: number, h: number, l: number) => new BoxGeometry(w, h, l)
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
  around = 6,
): void {
  const from = new Vector3(...a)
  const along = new Vector3(...b).sub(from)
  const length = along.length()
  const mesh = kit.put(
    parent,
    new CylinderGeometry(r1, r0, length, around),
    material,
    from.x + along.x / 2,
    from.y + along.y / 2,
    from.z + along.z / 2,
  )
  mesh.quaternion.setFromUnitVectors(UP, along.normalize())
}

/** A line of stitching: a thin thread from point to point, a little proud of the cloth */
const seam = (kit: BodyKit, parent: Object3D, material: Material, a: Point, b: Point) =>
  limb(kit, parent, material, a, b, 0.0035, 0.0035, 3)

/** A hull standing up: its sections' `z` is the height, its crest the front, its keel the back */
const standing = (sections: Parameters<typeof hull>[0]) => hull(sections).rotateX(-Math.PI / 2)

/** Where the forearm's hand joint is from the elbow, metres (the palm's middle is FOREARM) */
const WRIST = FOREARM - 0.06

/**
 * `onFeet` (2026-11-23, #151): on their feet beside the kart, for the race room's place cards
 * (src/kart/lobby/lobbyStage.ts): the legs straight down to the ground, the arms hanging at the sides.
 * The group's origin is still the hips' seat, 0.8 m above the soles
 */
export const STANDING_HIP = 0.8

/** Where the shoulders are on the torso (x either side), metres */
export const SHOULDER: Point = [0.2, 0.44, 0]

/**
 * `astride` (2026-11-19): on a bike. The legs go down either side to the pegs, knees forward,
 * instead of out ahead into a kart's nose; the model lays the torso forward (kartModel.ts)
 */
export function buildDriver(
  kit: BodyKit,
  driver: DriverId,
  astride = false,
  onFeet = false,
  detail: DriverDetail = 'high',
): DriverModel {
  const colours = kartDrivers[driver]
  const suit = kit.colour(colours.suit, 0.8, 0.05)
  const panel = kit.colour(colours.panel, 0.55, 0.1, 0.12)
  const helmet = kit.colour(colours.helmet, 0.28, 0.25)
  const crest = kit.colour(colours.crest, 0.35, 0.2, 0.5)
  const trim = kit.colour(colours.trim, 0.6, 0.1)
  // A mirror: all reflection, tinted
  const visor = kit.colour(colours.visor, 0.05, 1)
  const { carbon, dark } = kit.paint
  const full = detail !== 'low'
  const finest = detail === 'high'
  // The stitching in the crest's colour, faintly lit; a white glint across the visor
  const thread = finest ? kit.colour(colours.crest, 0.7, 0.05, 0.25) : panel
  const glint = full ? kit.colour(kartLivery.ink, 0.05, 1, 0.9) : visor

  const group = new Group()
  // Seated: the thighs forward and up to the knees, the shins down into the nose, boots
  for (const side of [-1, 1]) {
    let hip: Point = [side * 0.09, 0.1, 0]
    let knee: Point
    let ankle: Point
    let toe: Point
    if (onFeet) {
      // Standing: the thighs down to the knees, the shins to the ankles, the boots forward
      knee = [side * 0.105, -0.32, -0.025]
      ankle = [side * 0.105, -0.72, 0]
      toe = [side * 0.105, -0.76, -0.15]
    } else if (astride) {
      // Astride: the thighs forward and down round the tank, the shins back to the pegs, boots
      hip = [side * 0.1, 0.09, 0]
      knee = [side * 0.215, -0.02, -0.34]
      ankle = [side * 0.2, -0.21, -0.04]
      toe = [side * 0.2, -0.24, -0.17]
    } else {
      knee = [side * 0.12, 0.21, -0.4]
      ankle = [side * 0.1, 0.07, -0.76]
      toe = [side * 0.1, 0.11, -0.9]
    }
    limb(kit, group, suit, hip, knee, 0.085, 0.065)
    limb(kit, group, suit, knee, ankle, 0.06, 0.045)
    // The knee pad: a panel over the knee, with a carbon cap on the full kit
    const thigh = new Vector3(...knee).sub(new Vector3(...hip)).normalize()
    const padFrom: Point = [knee[0] - thigh.x * 0.1, knee[1] - thigh.y * 0.1 + 0.02, knee[2] - thigh.z * 0.1]
    limb(kit, group, panel, padFrom, [knee[0], knee[1] + 0.02, knee[2]], 0.066, 0.07)
    if (full) {
      kit.put(group, box(0.07, 0.03, 0.08), carbon, knee[0], knee[1] + 0.075, knee[2] + 0.01).rotation.x =
        Math.atan2(thigh.y, -thigh.z) * 0.5
    }
    // The boot: an upper to the toe; on the full kit a sole under it and a cuff in the panel's colour
    limb(kit, group, trim, ankle, toe, 0.05, 0.045)
    if (full) {
      limb(
        kit,
        group,
        dark,
        [ankle[0], ankle[1] - 0.04, ankle[2] + 0.01],
        [toe[0], toe[1] - 0.035, toe[2] - 0.01],
        0.034,
        0.03,
      )
      limb(kit, group, panel, [ankle[0], ankle[1] + 0.06, ankle[2]], [ankle[0], ankle[1] + 0.01, ankle[2]], 0.052, 0.054)
    }
    if (finest) {
      // A seam down the outside of each thigh
      seam(kit, group, thread, [hip[0] + side * 0.085, hip[1], hip[2]], [knee[0] + side * 0.066, knee[1], knee[2]])
    }
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
  if (full) {
    // And small on the chest, facing forward
    const bib = kit.decal(torso, 'number', 0.11, 0.055, 0.06, 0.36, -0.124, 'back')
    if (bib) bib.rotation.set(-0.12, Math.PI, 0)
    // The harness: two straps over the shoulders down to a buckle at the waist, the buckle in metal
    for (const side of [-1, 1]) {
      limb(kit, torso, dark, [side * 0.09, 0.51, 0.06], [side * 0.075, 0.42, -0.125], 0.018, 0.018, 4)
      limb(kit, torso, dark, [side * 0.075, 0.42, -0.125], [side * 0.03, 0.1, -0.12], 0.018, 0.018, 4)
    }
    kit.put(torso, box(0.07, 0.06, 0.02), kit.paint.metal, 0, 0.11, -0.122)
    // A badge on each flank of the yoke: the crest, small
    for (const side of [-1, 1]) {
      const badge = crestBadge(driver, false)
      badge.scale(0.22, 0.22, 0.6)
      kit.put(torso, badge, crest, side * 0.21, 0.33, 0).rotation.y = side * (Math.PI / 2)
    }
  }
  if (finest) {
    // The stitching: round the yoke, down the front's zip, along the flanks' panels
    for (const side of [-1, 1]) {
      seam(kit, torso, thread, [side * 0.02, 0.37, -0.123], [side * 0.18, 0.4, -0.09])
      seam(kit, torso, thread, [side * 0.18, 0.4, 0.085], [side * 0.02, 0.37, 0.115])
      seam(kit, torso, thread, [side * 0.19, 0.08, -0.03], [side * 0.207, 0.33, -0.03])
    }
    seam(kit, torso, thread, [0, 0.13, -0.116], [0, 0.49, -0.1])
  }

  const elbows: Group[] = []
  const hands: Object3D[] = []
  let vee: Group | null = null
  const arms = [-1, 1].map((side) => {
    // The shoulder, the arm hanging from it: an upper arm to the elbow, a forearm to the hand
    const arm = new Group()
    arm.position.set(side * SHOULDER[0], SHOULDER[1], SHOULDER[2])
    limb(kit, arm, panel, [0, 0.015, 0], [0, -0.11, 0], 0.07, 0.058)
    limb(kit, arm, suit, [0, -0.11, 0], [0, -UPPER_ARM, 0], 0.055, 0.047)
    if (full) {
      // Shoulder armour: a moulded carbon cap over the shoulder, a rim in the panel's colour
      const cap = kit.put(
        arm,
        hull([
          { z: -0.07, w: 0.05, top: 0.03, bottom: 0.03 },
          { z: 0, w: 0.085, top: 0.05, bottom: 0.04 },
          { z: 0.07, w: 0.05, top: 0.03, bottom: 0.03 },
        ]),
        carbon,
        side * 0.012,
        0.02,
        0,
      )
      cap.rotation.z = side * -1.25
      limb(kit, arm, panel, [side * 0.045, -0.06, -0.05], [side * 0.045, -0.06, 0.05], 0.012, 0.012, 4)
    }
    if (finest) seam(kit, arm, thread, [side * 0.058, -0.11, 0], [side * 0.049, -UPPER_ARM + 0.02, 0])
    const elbow = new Group()
    elbow.position.set(0, -UPPER_ARM, 0)
    arm.add(elbow)
    limb(kit, elbow, suit, [0, 0, 0], [0, -WRIST + 0.04, 0], 0.047, 0.04)
    // The glove's gauntlet, over the end of the sleeve
    limb(kit, elbow, trim, [0, -WRIST + 0.07, 0], [0, -WRIST, 0], 0.044, 0.046)
    if (full) limb(kit, elbow, carbon, [0, -0.02, 0.03], [0, -0.07, 0.035], 0.024, 0.02, 4)
    // The hand: drawn with the forearm (it never turns by itself, so it costs no draw of its own),
    // its joint marked where the palm begins, for a test to find
    const hand = new Object3D()
    hand.position.set(0, -WRIST, 0)
    hand.userData.hand = true
    elbow.add(hand)
    const w = -WRIST
    if (full) {
      // The glove: a palm, the fingers curled round a grip, a thumb, a carbon guard over the knuckles
      kit.put(elbow, box(0.075, 0.075, 0.04), trim, 0, w - 0.04, 0)
      kit.put(elbow, box(0.075, 0.04, 0.05), trim, 0, w - 0.085, -0.012).rotation.x = 0.35
      limb(kit, elbow, trim, [side * -0.035, w - 0.02, -0.01], [side * -0.05, w - 0.065, -0.035], 0.014, 0.012, 5)
      kit.put(elbow, box(0.068, 0.03, 0.012), carbon, 0, w - 0.06, 0.024)
      kit.put(elbow, box(0.077, 0.012, 0.043), dark, 0, w - 0.012, 0)
      if (side > 0) {
        // Two fingers up for a V, shown only by a gesture (kartModel.ts)
        vee = new Group()
        vee.visible = false
        vee.position.set(0, w, 0)
        elbow.add(vee)
        limb(kit, vee, trim, [-0.018, -0.09, -0.01], [-0.04, -0.175, -0.01], 0.012, 0.011, 5)
        limb(kit, vee, trim, [0.018, -0.09, -0.01], [0.04, -0.175, -0.01], 0.012, 0.011, 5)
      }
    } else {
      limb(kit, elbow, trim, [0, w, 0], [0, w - 0.09, 0], 0.044, 0.046)
    }
    elbows.push(elbow)
    hands.push(hand)
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
  if (full) {
    // The visor's glint: a bright streak across the mirror, and its hinge pods either side
    kit.put(head, box(0.2, 0.008, 0.012), glint, 0.01, 0.075, -0.155).rotation.set(-0.3, 0.12, -0.12)
    for (const side of [-1, 1]) {
      kit.put(head, new CylinderGeometry(0.03, 0.03, 0.022, 8), carbon, side * 0.163, 0.03, -0.06).rotation.z =
        Math.PI / 2
    }
    // Vents on the crown: slots with a carbon lip, raked back
    for (const x of finest ? [-0.05, 0.05] : [0]) {
      kit.put(head, wedge(0.03, 0.09, 0.018, 0.026), carbon, x, 0.162, -0.09).rotation.x = -0.12
    }
  }
  if (finest) {
    // The crest small on each cheek, in relief
    for (const side of [-1, 1]) {
      const badge = crestBadge(driver, true)
      badge.scale(0.28, 0.28, 0.5)
      kit.put(head, badge, crest, side * 0.152, -0.06, 0.06).rotation.y = side * (Math.PI / 2)
    }
  }
  // The team's logo: the suit's sign, lying on the back of the crown, facing the camera behind; in
  // relief on the full kit
  const sign = crestBadge(driver, full)
  sign.scale(0.62, 0.62, 1)
  kit.put(head, sign, crest, 0, 0.075, 0.2).rotation.x = -0.92
  torso.add(head)
  return {
    group,
    torso,
    head,
    arms,
    elbows: elbows as [Group, Group],
    hands: hands as [Object3D, Object3D],
    vee,
  }
}
