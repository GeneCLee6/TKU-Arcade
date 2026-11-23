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
//
// 2026-11-23 (§4.91, driverLimbs.ts, driverSkin.ts): no seams, legs, fingers. On the full kit the
// limbs are skin: a ball at each shoulder and hip that the limb turns in, and the sleeve and the leg
// each one piece over the elbow and the knee, bending smoothly (one skinned mesh a material for all
// four limbs, sharing a skeleton: fewer draws than the rigid parts). The legs have a hip, a knee and
// an ankle each, so that kartModel.ts can put the feet on the pedals or the ground, seated or
// standing; the gloves have fingers and a thumb in seven shapes (round the grip, a fist, open,
// pointing, a thumb up, a V, at ease), one shown at a time. Low keeps rigid parts, merged and still.
import {
  Bone,
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Shape,
  Vector2,
  Vector3,
  Object3D,
  type Material,
  type Skeleton,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import type { Quality } from '../quality.ts'
import { kartDrivers, kartFeatures, kartLivery, kartOutfits } from '../../styles/kartTokens.ts'
import { DEFAULT_OUTFIT, type OutfitId } from '../../../shared/kart/outfits.ts'
import { FOREARM, UPPER_ARM } from '../driverRig.ts'
import {
  HAND_SHAPES,
  handCurl,
  HIP_X,
  KNUCKLES,
  PELVIS_Y,
  SHIN,
  THIGH,
  type HandCurl,
  type HandShape,
} from '../driverLimbs.ts'
import { hull, type BodyKit } from './kartParts.ts'
import { skinLimbs, type SkinBend } from './driverSkin.ts'
import { DRIVER_LOOKS } from './driverLooks.ts'
import { buildFeature, buildHelmet, LOGO_AT } from './driverHelmets.ts'
import { dressCut } from './driverOutfits.ts'
import { buildHearts, buildProp } from './driverProps.ts'

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
  /** 2026-11-23 (§4.91): the hips' middle; the torso and the legs hang from it (driverLimbs.ts) */
  readonly pelvis: Group
  /** Everything above the seat: leans into a turn, back in a boost, sways when stunned */
  readonly torso: Group
  /** Turns to look where the driver steers */
  readonly head: Group
  /** Left and right shoulders: each arm hangs from one, straight down (-y) at rest */
  readonly arms: readonly [Bone, Bone]
  /** Left and right elbows, bending about their own x */
  readonly elbows: readonly [Bone, Bone]
  /** Left and right hands' joints, at the end of the forearm (the glove is drawn with the forearm) */
  readonly hands: readonly [Object3D, Object3D]
  /** 2026-11-23 (§4.91): each leg's hip, knee (bending about its x) and ankle, hanging straight down */
  readonly hips: readonly [Bone, Bone]
  readonly knees: readonly [Bone, Bone]
  readonly ankles: readonly [Bone, Bone]
  /** The limbs' skin's skeleton (to dispose of its bone texture); none on low */
  readonly skeleton: Skeleton | null
  /** 2026-11-23 (§3.1): how tall the driver is, a factor of the standard driver (the group's scale) */
  readonly scale: number
  /**
   * 2026-11-23 (§3.3): what each hand holds in a win (Dee's calculator, Clover's dumbbell), at no
   * size until the pose's `prop` shows it; Hartie's hearts, put by heartFlight; the pieces that
   * stream back and sway (a scarf's tails, a ponytail). None on low
   */
  readonly props: readonly (Object3D | null)[]
  readonly hearts: readonly Object3D[]
  readonly swings: readonly Object3D[]
  /** What each hand shows (driverLimbs.ts); on low the plain glove shows nothing else */
  setHands(left: HandShape, right: HandShape): void
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
  /** 2026-11-23 (§4.91): no ends (a finger's bone inside the next): fewer triangles */
  open = false,
): void {
  const from = new Vector3(...a)
  const along = new Vector3(...b).sub(from)
  const length = along.length()
  const mesh = kit.put(
    parent,
    new CylinderGeometry(r1, r0, length, around, 1, open),
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
 * On their feet beside the kart (2026-11-23, #151), for the race room's place cards
 * (src/kart/lobby/lobbyStage.ts): the group's origin is still the hips' seat, 0.8 m above the soles
 */
export const STANDING_HIP = 0.8

/** Where the shoulders are on the torso (x either side), metres */
export const SHOULDER: Point = [0.2, 0.44, 0]

/** A joint: a bone at a place on its parent */
function joint(parent: Object3D, x: number, y: number, z: number): Bone {
  const bone = new Bone()
  bone.position.set(x, y, z)
  parent.add(bone)
  return bone
}

/** A limb's outline, hanging from its joint: [metres down (negative), radius], top to bottom */
type Profile = readonly (readonly [number, number])[]

/** The leg: from the hip's ball down to the ankle, rings close together round the knee */
const LEG_PROFILE: Profile = [
  [0, 0.085],
  [-0.2, 0.078],
  [-THIGH + 0.06, 0.068],
  [-THIGH + 0.03, 0.066],
  [-THIGH, 0.064],
  [-THIGH - 0.03, 0.061],
  [-THIGH - 0.06, 0.059],
  [-THIGH - SHIN * 0.5, 0.052],
  [-THIGH - SHIN + 0.03, 0.045],
]
/** The ball at the shoulder and the top of the upper arm, in the panel's colour */
const DELTOID_PROFILE: Profile = [
  [0, 0.07],
  [-0.06, 0.064],
  [-0.115, 0.058],
]
/** The sleeve: from under the shoulder's panel down over the elbow to the glove */
const ARM_PROFILE: Profile = [
  [-0.09, 0.056],
  [-UPPER_ARM + 0.06, 0.05],
  [-UPPER_ARM + 0.03, 0.048],
  [-UPPER_ARM, 0.047],
  [-UPPER_ARM - 0.03, 0.046],
  [-UPPER_ARM - 0.06, 0.044],
  [-UPPER_ARM - (FOREARM - 0.06) + 0.05, 0.04],
]

/**
 * A limb turned about its own axis from `profile`, `around` sides; `ball` closes the top in a half
 * sphere round the joint, so that the limb turns in it without opening a seam
 */
function sleeve(profile: Profile, around: number, ball: boolean): LatheGeometry {
  const points: Vector2[] = []
  for (let i = profile.length - 1; i >= 0; i--) points.push(new Vector2(profile[i]![1], profile[i]![0]))
  if (ball) {
    const radius = profile[0]![1]
    const top = profile[0]![0]
    for (let step = 1; step <= 4; step++) {
      const angle = (step / 4) * (Math.PI / 2)
      points.push(new Vector2(Math.max(0.002, Math.cos(angle) * radius), top + Math.sin(angle) * radius))
    }
  }
  return new LatheGeometry(points, around)
}

/** The boot's toe from its ankle, built pointing forward with the leg hanging straight down */
const BOOT_TOE: Point = [0, -0.04, -0.15]

/** Each finger's bones' lengths, metres (the root, the middle, the tip), index to little */
const PHALANGES = [0.034, 0.024, 0.019] as const
const FINGER_SCALE = [0.95, 1, 0.95, 0.8] as const

/**
 * A glove's fingers and thumb in one shape (driverLimbs.ts's handCurl), on `bone` at the palm's
 * start: each finger from its knuckle at the end of the palm, bending at each knuckle towards the
 * palm (-z); `toIndex` the way across the hand (x) to the index finger and the thumb
 */
function fingers(kit: BodyKit, bone: Object3D, material: Material, curl: HandCurl, toIndex: number, around: number) {
  const from = new Vector3()
  const to = new Vector3()
  const way = new Vector3()
  const point = (v: Vector3): Point => [v.x, v.y, v.z]
  for (let finger = 0; finger < 4; finger++) {
    const fan = (1.5 - finger) * curl.spread * toIndex
    from.set(toIndex * (0.027 - finger * 0.018), -0.075, -0.004)
    let bent = 0
    for (let knuckle = 0; knuckle < 3; knuckle++) {
      bent += curl.fingers[finger]! * KNUCKLES[knuckle]!
      way.set(Math.sin(fan), -Math.cos(fan) * Math.cos(bent), -Math.cos(fan) * Math.sin(bent))
      to.copy(from).addScaledVector(way, PHALANGES[knuckle]! * FINGER_SCALE[finger]!)
      const thick = 0.0115 - knuckle * 0.001
      // Open-ended but the tip: each bone's end is inside the next
      limb(kit, bone, material, point(from), point(to), thick, thick - 0.0005, around, knuckle < 2)
      from.copy(to)
    }
  }
  // The thumb: two bones from its root at the side of the palm, the tip turned in a little more
  from.set(toIndex * 0.036, -0.022, -0.012)
  way.set(toIndex * curl.thumb[0], curl.thumb[1], curl.thumb[2]).normalize()
  to.copy(from).addScaledVector(way, 0.032)
  limb(kit, bone, material, point(from), point(to), 0.0135, 0.012, around, true)
  from.copy(to)
  if (curl.thumb[2] < 0) way.add(new Vector3(-toIndex * 0.25, 0, -0.25)).normalize()
  to.copy(from).addScaledVector(way, 0.026)
  limb(kit, bone, material, point(from), point(to), 0.012, 0.011, around)
}

/**
 * The driver, built seated or standing alike: the pose (seated in a kart, astride a bike, on their
 * feet) is the skeleton's, put on by kartModel.ts (driverLimbs.ts). 2026-11-23 (docs/KART-WORLD.md
 * §3.1–3.3): each in their own build, helmet and thing of their own (driverLooks.ts), in `outfit`
 * (shared/kart/outfits.ts), and with what they win with
 */
export function buildDriver(
  kit: BodyKit,
  driver: DriverId,
  detail: DriverDetail = 'high',
  outfit: OutfitId = DEFAULT_OUTFIT,
): DriverModel {
  const colours = kartDrivers[driver]
  const look = DRIVER_LOOKS[driver]
  const cut = look.outfits[outfit]
  const dress = kartOutfits[driver][outfit]
  const race = cut === 'suit'
  const { height, shoulders, girth } = look.build
  // The race suit as it always was; other clothes are cloth, not a suit's sheen
  const cloth = (tint: string) => (race ? kit.colour(tint, 0.8, 0.05) : kit.colour(tint, 0.92, 0))
  const suit = cloth(dress.body)
  const sleeves = dress.sleeve === dress.body ? suit : cloth(dress.sleeve)
  const trousers = dress.legs === dress.body ? suit : dress.legs === dress.sleeve ? sleeves : cloth(dress.legs)
  const panel = kit.colour(dress.panel, 0.55, 0.1, race ? 0.12 : 0.04)
  const helmet = kit.colour(colours.helmet, 0.28, 0.25)
  const crest = kit.colour(colours.crest, 0.35, 0.2, 0.5)
  const trim = kit.colour(dress.trim, 0.6, 0.1)
  const boots = dress.boot === dress.trim ? trim : kit.colour(dress.boot, 0.6, 0.1)
  const accent = kit.colour(dress.accent, 0.5, 0.1, 0.2)
  // A mirror: all reflection, tinted
  const visor = kit.colour(colours.visor, 0.05, 1)
  const { carbon, dark } = kit.paint
  const full = detail !== 'low'
  const finest = detail === 'high'
  // The stitching in the crest's colour, faintly lit; a white glint across the visor
  const thread = finest ? kit.colour(colours.crest, 0.7, 0.05, 0.25) : panel
  const glint = full ? kit.colour(kartLivery.ink, 0.05, 1, 0.9) : visor
  // The limbs as thick as the build
  const thick = (geometry: LatheGeometry) => geometry.scale(girth, 1, girth)

  const group = new Group()
  // 2026-11-23 (§3.1): the whole driver as tall as they are, about the seat
  group.scale.setScalar(height)
  // 2026-11-23 (§4.91): a pelvis, the torso on it and a leg hanging from each hip, a hip, a knee and
  // an ankle each (bones); kartModel.ts puts the feet on the pedals or the ground (driverLimbs.ts)
  const pelvis = new Group()
  pelvis.position.set(0, PELVIS_Y, 0)
  group.add(pelvis)
  const hips: Bone[] = []
  const knees: Bone[] = []
  const ankles: Bone[] = []
  for (const side of [-1, 1]) {
    const hip = joint(pelvis, side * HIP_X * Math.max(1, shoulders * 0.95), 0, 0)
    const knee = joint(hip, 0, -THIGH, 0)
    const ankle = joint(knee, 0, -SHIN, 0)
    // Marked, for a test to find
    ankle.userData.ankle = true
    if (full) {
      // One piece from a ball at the hip down past the knee to the ankle, bending smoothly at the knee
      const leg = kit.put(hip, thick(sleeve(LEG_PROFILE, finest ? 10 : 8, true)), trousers)
      leg.userData.skin = { next: knee, joint: THIGH } satisfies SkinBend
      if (race) {
        // The knee pad over the knee, a carbon cap on it
        limb(kit, knee, panel, [0, 0.055, 0.03], [0, -0.05, 0.03], 0.052, 0.05)
        kit.put(knee, box(0.07, 0.085, 0.03), carbon, 0, 0.005, 0.072)
      }
    } else {
      limb(kit, hip, trousers, [0, 0, 0], [0, -THIGH, 0], 0.085 * girth, 0.065 * girth)
      limb(kit, knee, trousers, [0, 0, 0], [0, -SHIN, 0], 0.06 * girth, 0.045 * girth)
      if (race) limb(kit, knee, panel, [0, 0.06, 0.02], [0, -0.04, 0.02], 0.066, 0.064)
    }
    // The boot, built pointing forward from the ankle (kartModel.ts turns it to its toe): an upper to
    // the toe; on the full kit a sole under it and a cuff in the panel's colour
    limb(kit, ankle, boots, [0, 0, 0], BOOT_TOE, 0.05, 0.045)
    if (full) {
      limb(kit, ankle, dark, [0, -0.04, 0.01], [0, BOOT_TOE[1] - 0.035, BOOT_TOE[2] - 0.01], 0.034, 0.03)
      limb(kit, ankle, race ? panel : trousers, [0, 0.06, 0], [0, 0.01, 0], 0.052 * girth, 0.054 * girth)
    }
    // A seam down the outside of each thigh
    if (finest && race) seam(kit, hip, thread, [side * 0.085, -0.02, 0], [side * 0.067, -THIGH + 0.06, 0])
    hips.push(hip)
    knees.push(knee)
    ankles.push(ankle)
  }

  const torso = new Group()
  pelvis.add(torso)
  // 2026-11-23 (§3.1): the trunk and what is on it, as broad and as deep as the build; the arms and
  // the head ride on the torso itself, not scaled
  const shell = new Group()
  shell.scale.set(shoulders, 1, girth)
  torso.add(shell)
  // The trunk: hips, a waist, a chest, shoulders (a vest's shirt under it in the sleeves' colour)
  kit.put(
    shell,
    standing([
      { z: -0.04, w: 0.15, top: 0.1, bottom: 0.1 },
      { z: 0.06, w: 0.17, top: 0.11, bottom: 0.11 },
      { z: 0.22, w: 0.15, top: 0.1, bottom: 0.09 },
      { z: 0.4, w: 0.2, top: 0.12, bottom: 0.1 },
      { z: 0.49, w: 0.19, top: 0.09, bottom: 0.09 },
      { z: 0.53, w: 0.08, top: 0.06, bottom: 0.06 },
    ]),
    cut === 'vest' ? sleeves : suit,
  )
  if (race || cut === 'jersey') {
    // Colour blocks: a yoke over the shoulders and chest
    kit.put(
      shell,
      standing([
        { z: 0.33, w: 0.185, top: 0.118, bottom: 0.1 },
        { z: 0.405, w: 0.208, top: 0.128, bottom: 0.108 },
        { z: 0.495, w: 0.198, top: 0.098, bottom: 0.098 },
        { z: 0.535, w: 0.09, top: 0.066, bottom: 0.066 },
      ]),
      panel,
    )
  }
  if (race) {
    // A panel down each flank, a belt
    for (const side of [-1, 1]) {
      limb(kit, shell, panel, [side * 0.158, 0.06, 0], [side * 0.176, 0.33, 0], 0.03, 0.035)
    }
    kit.put(
      shell,
      standing([
        { z: 0.035, w: 0.176, top: 0.116, bottom: 0.116 },
        { z: 0.075, w: 0.176, top: 0.116, bottom: 0.116 },
      ]),
      trim,
    )
  }
  // The collar: a carbon neck brace on the race suit, raised behind the head; a cloth collar otherwise
  kit.put(
    shell,
    standing([
      { z: 0.52, w: 0.14, top: 0.1, bottom: 0.13 },
      { z: 0.575, w: 0.12, top: 0.085, bottom: 0.14 },
    ]),
    race ? carbon : suit,
  )
  // The racing number across the back: the suit's, a jersey's, a club jacket's
  if (race || cut === 'jersey' || cut === 'varsity') kit.decal(shell, 'number', 0.24, 0.12, 0, 0.27, 0.105, 'back')
  if (full && race) {
    // And small on the chest, facing forward
    const bib = kit.decal(shell, 'number', 0.11, 0.055, 0.06, 0.36, -0.124, 'back')
    if (bib) bib.rotation.set(-0.12, Math.PI, 0)
    // The harness: two straps over the shoulders down to a buckle at the waist, the buckle in metal
    for (const side of [-1, 1]) {
      limb(kit, shell, dark, [side * 0.09, 0.51, 0.06], [side * 0.075, 0.42, -0.125], 0.018, 0.018, 4)
      limb(kit, shell, dark, [side * 0.075, 0.42, -0.125], [side * 0.03, 0.1, -0.12], 0.018, 0.018, 4)
    }
    kit.put(shell, box(0.07, 0.06, 0.02), kit.paint.metal, 0, 0.11, -0.122)
    // A badge on each flank of the yoke: the crest, small
    for (const side of [-1, 1]) {
      const badge = crestBadge(driver, false)
      badge.scale(0.22, 0.22, 0.6)
      kit.put(shell, badge, crest, side * 0.21, 0.33, 0).rotation.y = side * (Math.PI / 2)
    }
  }
  if (finest && race) {
    // The stitching: round the yoke, down the front's zip, along the flanks' panels
    for (const side of [-1, 1]) {
      seam(kit, shell, thread, [side * 0.02, 0.37, -0.123], [side * 0.18, 0.4, -0.09])
      seam(kit, shell, thread, [side * 0.18, 0.4, 0.085], [side * 0.02, 0.37, 0.115])
      seam(kit, shell, thread, [side * 0.19, 0.08, -0.03], [side * 0.207, 0.33, -0.03])
    }
    seam(kit, shell, thread, [0, 0.13, -0.116], [0, 0.49, -0.1])
  }

  const elbows: Bone[] = []
  const hands: Object3D[] = []
  // 2026-11-23 (§4.91): each hand's shapes, a bone each (shown at full size, the rest at none)
  const shapes: Map<HandShape, Bone>[] = []
  const arms = [-1, 1].map((side) => {
    // The shoulder, the arm hanging from it: an upper arm to the elbow, a forearm to the hand
    const arm = joint(torso, side * SHOULDER[0] * shoulders, SHOULDER[1], SHOULDER[2])
    const elbow = joint(arm, 0, -UPPER_ARM, 0)
    if (full) {
      // A ball at the shoulder in the panel's colour (the sleeve's on clothes), round the joint, so
      // that the arm turns in it without a seam; the sleeve one piece from under it to the glove,
      // bending smoothly at the elbow
      kit.put(arm, thick(sleeve(DELTOID_PROFILE, finest ? 10 : 8, true)), race ? panel : sleeves)
      const sleeved = kit.put(arm, thick(sleeve(ARM_PROFILE, finest ? 10 : 8, false)), sleeves)
      sleeved.userData.skin = { next: elbow, joint: UPPER_ARM } satisfies SkinBend
      if (race) {
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
        if (finest) seam(kit, arm, thread, [side * 0.058, -0.11, 0], [side * 0.05, -UPPER_ARM + 0.06, 0])
        // The elbow's carbon guard
        limb(kit, elbow, carbon, [0, -0.02, 0.03], [0, -0.07, 0.035], 0.024, 0.02, 4)
      }
    } else {
      limb(kit, arm, race ? panel : sleeves, [0, 0.015, 0], [0, -0.11, 0], 0.07 * girth, 0.058 * girth)
      limb(kit, arm, sleeves, [0, -0.11, 0], [0, -UPPER_ARM, 0], 0.055 * girth, 0.047 * girth)
      limb(kit, elbow, sleeves, [0, 0, 0], [0, -WRIST + 0.04, 0], 0.047 * girth, 0.04 * girth)
    }
    // The glove's gauntlet, over the end of the sleeve
    limb(kit, elbow, trim, [0, -WRIST + 0.07, 0], [0, -WRIST, 0], 0.044, 0.046)
    // The hand: drawn with the forearm (it never turns by itself), its joint marked where the palm
    // begins, for a test to find
    const hand = new Object3D()
    hand.position.set(0, -WRIST, 0)
    hand.userData.hand = true
    elbow.add(hand)
    const w = -WRIST
    const own = new Map<HandShape, Bone>()
    if (full) {
      // The glove: a palm, a carbon guard over the knuckles, a dark cuff; the fingers and the thumb
      // in each of the hand's shapes (driverLimbs.ts), on a bone of its own
      kit.put(elbow, box(0.075, 0.075, 0.04), trim, 0, w - 0.04, 0)
      kit.put(elbow, box(0.068, 0.03, 0.012), carbon, 0, w - 0.06, 0.024)
      kit.put(elbow, box(0.077, 0.012, 0.043), dark, 0, w - 0.012, 0)
      for (const shape of HAND_SHAPES) {
        const bone = joint(hand, 0, 0, 0)
        fingers(kit, bone, trim, handCurl(shape), -side, 4)
        bone.scale.setScalar(shape === 'grip' ? 1 : 0)
        own.set(shape, bone)
      }
    } else {
      limb(kit, elbow, trim, [0, w, 0], [0, w - 0.09, 0], 0.044, 0.046)
    }
    shapes.push(own)
    elbows.push(elbow)
    hands.push(hand)
    return arm
  }) as [Bone, Bone]

  // 2026-11-23 (§3.2): what the outfit adds beyond its colours
  dressCut(
    kit,
    {
      torso: shell,
      arms,
      elbows,
      hips,
      knees,
      upperArm: UPPER_ARM,
      forearm: WRIST,
      thigh: THIGH,
      shin: SHIN,
    },
    cut,
    { body: suit, panel, trim, accent },
    full,
  )

  const head = new Group()
  head.position.set(0, 0.7, -0.01)
  // 2026-11-23 (§3.1): the helmet of their own (driverHelmets.ts)
  const band = kit.colour(colours.trim, 0.6, 0.1)
  buildHelmet(kit, head, look.helmet, { shell: helmet, visor, crest, band, carbon, glint }, full, finest)
  if (finest && look.helmet !== 'facet') {
    // The crest small on each cheek, in relief (Dee's headset covers the cheeks)
    for (const side of [-1, 1]) {
      const badge = crestBadge(driver, true)
      badge.scale(0.28, 0.28, 0.5)
      kit.put(head, badge, crest, side * (look.helmet === 'blade' ? 0.145 : 0.165), -0.06, 0.06).rotation.y =
        side * (Math.PI / 2)
    }
  }
  // The team's logo: the suit's sign, lying on the back of the crown, facing the camera behind; in
  // relief on the full kit
  const sign = crestBadge(driver, full)
  sign.scale(0.62, 0.62, 1)
  const [logoY, logoZ, logoTilt] = LOGO_AT[look.helmet]
  kit.put(head, sign, crest, 0, logoY, logoZ).rotation.x = logoTilt
  torso.add(head)

  // 2026-11-23 (§3.1): the thing of their own besides the helmet; and (§3.3) what they win with, on
  // the full kit only (the low quality's driver never moves)
  const features = kartFeatures[driver]
  const { swings } = buildFeature(
    kit,
    head,
    torso,
    look.feature,
    kit.colour(features.main, 0.85, 0.02),
    kit.colour(features.second, 0.55, 0.1, 0.15),
    full,
  )
  const props: (Object3D | null)[] = [null, null]
  let hearts: Object3D[] = []
  if (full) {
    const lit = kit.colour('screen' in features ? features.screen : features.second, 0.4, 0, 0.3)
    // Dee's calculator in the left hand; Clover's dumbbell in the right
    const holding = look.prop === 'calculator' ? 0 : 1
    props[holding] = buildProp(kit, hands[holding]!, look.prop, {
      main: kit.colour('metal' in features ? features.metal : features.main, 0.4, 'metal' in features ? 0.8 : 0.1),
      second: 'metal' in features ? kit.paint.dark : kit.colour(features.second, 0.5, 0.1),
      lit,
    })
    if (look.hearts && 'hearts' in features) {
      hearts = buildHearts(kit, torso, crestShapes('heart'), kit.colour(features.hearts, 0.3, 0.1, 0.9))
    }
  }

  // The limbs as skin (driverSkin.ts): the full kit; low keeps the rigid parts (merged, still)
  const skeleton = full ? skinLimbs(group, [...hips, ...arms], kit.allPaint) : null
  const shown: (HandShape | null)[] = [null, null]
  return {
    group,
    scale: height,
    pelvis,
    torso,
    head,
    arms,
    elbows: elbows as [Bone, Bone],
    hands: hands as [Object3D, Object3D],
    hips: hips as [Bone, Bone],
    knees: knees as [Bone, Bone],
    ankles: ankles as [Bone, Bone],
    skeleton,
    props,
    hearts,
    swings,
    setHands(left, right) {
      for (const [index, wanted] of [left, right].entries()) {
        if (shown[index] === wanted) continue
        shown[index] = wanted
        for (const [shape, bone] of shapes[index]!) bone.scale.setScalar(shape === wanted ? 1 : 0)
      }
    },
  }
}
