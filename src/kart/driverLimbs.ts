// 2026-11-23 (docs/ARCHITECTURE.md §4.91; owner: "more and more real, more striking ... esports,
// professional"): the rest of the driver's skeleton, worked out in code like driverRig.ts. The legs
// (a hip, a knee and an ankle each, two bones from the hip to the ankle and the boot turned to its
// toe): seated, on the pedals, a foot pressing with the throttle or the brake, the knees swung out of
// a turn and pressed up by a landing; standing (the race room), the weight on one foot and then the
// other, a step, a bounce, a jump. The hands (a few shapes of the fingers: round the wheel's grip, a
// fist, open, pointing, a thumb up, a V, at ease). And how much of each vertex of a sleeve or a leg
// follows the joint below it (the skin, art/driverModel.ts): smoothly over the elbow and the knee, so
// that nothing shows a seam. Pure, so that a test can read it; art/kartModel.ts puts it on the model.
import { Quaternion, Vector3 } from 'three'
import { reachArm } from './driverRig.ts'

/** The leg, metres: the hip to the knee, the knee to the ankle */
export const THIGH = 0.4
export const SHIN = 0.39
/** The hips this far either side of the middle, metres */
export const HIP_X = 0.09
/** The pelvis at rest, from the driver's origin (the seat), metres */
export const PELVIS_Y = 0.1
/** Standing (the race room): the ankles this far below the driver's origin, the toes a little lower */
export const STANDING_ANKLE_Y = -0.72
/** How far apart the feet stand at ease, either side of the middle, metres */
const STANCE = 0.11
/** Standing at ease, the knees just soft: the pelvis this much lower than with the legs straight */
const SOFT_KNEES = 0.025

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

type Point = readonly [number, number, number]

/** What the legs do on top of how they sit or stand: a gesture's (driverGestures.ts) */
export interface LegPose {
  /** The weight over one foot: the pelvis moved this far to the right (+x), metres */
  readonly hipShift: number
  /** The pelvis this far lower (a squat), metres */
  readonly hipDrop: number
  /** Each foot this far forward (+) or back, metres */
  readonly leftStep: number
  readonly rightStep: number
  /** Each foot lifted this far (a kick, a step, a jump's tuck), metres */
  readonly leftLift: number
  readonly rightLift: number
  /** The feet this much further apart, metres (a wide, strong stance) */
  readonly stance: number
  /** Up off the ground (or the seat), metres: a bounce taken in the knees, a jump past it */
  readonly bounce: number
}

export const LEGS_AT_EASE: LegPose = {
  hipShift: 0,
  hipDrop: 0,
  leftStep: 0,
  rightStep: 0,
  leftLift: 0,
  rightLift: 0,
  stance: 0,
  bounce: 0,
}

/** What the drive does to a seated driver's legs, already eased */
export interface LegDrive {
  /** -1 left to 1 right */
  readonly steer: number
  /** The throttle and the brake, 0 to 1 */
  readonly pedal: number
  readonly brake: number
  /** Pressed down by a landing (or squatting as it pulls away), 0 to 1 */
  readonly squash: number
  /** Astride a bike */
  readonly bike?: boolean
}

export const STILL_LEGS: LegDrive = { steer: 0, pedal: 0, brake: 0, squash: 0 }

/** Where the legs go, in the driver's own frame (its origin at the seat; -z forward, +x right) */
export interface LegTargets {
  /** The pelvis: where it is, and rolled this far (+ about z: the left hip down) */
  readonly pelvis: Point
  readonly pelvisRoll: number
  /** Each ankle (left, right), the way its toe points, and the way its knee points */
  readonly ankles: readonly [Point, Point]
  readonly toes: readonly [Point, Point]
  readonly knees: readonly [Point, Point]
}

/**
 * Seated, the feet on the pedals: the right foot presses with the throttle, the left with the brake
 * (the ankle forward, the toe down); the knees swing out of a turn, the way the body is thrown; a
 * landing presses the pelvis into the seat and the knees come up. A gesture's kick lifts a knee.
 * Astride a bike, the feet are on the pegs and the knees forward and out round the tank
 */
export function seatedLegs(drive: LegDrive, pose: LegPose = LEGS_AT_EASE): LegTargets {
  const bike = drive.bike ?? false
  const side = [-1, 1] as const
  const swing = -drive.steer * 0.35
  const ankles = side.map((s): Point => {
    const press = s > 0 ? drive.pedal : drive.brake
    const lift = s > 0 ? pose.rightLift : pose.leftLift
    const step = s > 0 ? pose.rightStep : pose.leftStep
    if (bike) return [s * 0.2, -0.21 + lift * 0.5, -0.04 - step * 0.3]
    return [s * (0.1 + pose.stance * 0.3), 0.07 + lift * 0.6, -0.76 - press * 0.035 - step * 0.5 + lift * 0.3]
  }) as [Point, Point]
  const toes = side.map((s): Point => {
    const press = s > 0 ? drive.pedal : drive.brake
    return bike ? [0, -0.03, -0.13] : [0, 0.04 - press * 0.06, -0.14]
  }) as [Point, Point]
  const knees = side.map((s): Point =>
    bike ? [s * 0.6 + swing * 0.3, 0.3, -1] : [s * (0.15 + pose.stance) + swing, 1, -0.2],
  ) as [Point, Point]
  return {
    pelvis: [0, PELVIS_Y - drive.squash * 0.035 - pose.hipDrop * 0.2, 0],
    pelvisRoll: 0,
    ankles,
    toes,
    knees,
  }
}

/** The pelvis's hip, rolled, from the pelvis's middle */
function hipAt(side: number, roll: number, into: Vector3): Vector3 {
  return into.set(side * HIP_X * Math.cos(roll), side * HIP_X * Math.sin(roll), 0)
}

const hip = new Vector3()

/**
 * Standing (the race room): the feet planted a little apart, the knees soft. Shifting the weight
 * moves the pelvis over one foot, rolls it (the free hip drops) and lowers it as far as the legs
 * need to keep both feet on the ground; a small bounce is taken in the knees, a bigger one leaves the
 * ground (a jump); a lifted foot, a step, a wider stance and a squat as the gesture asks
 */
export function standingLegs(pose: LegPose = LEGS_AT_EASE): LegTargets {
  const roll = clamp(pose.hipShift * 2, -0.2, 0.2)
  const jump = Math.max(0, pose.bounce - SOFT_KNEES)
  const ankles = ([-1, 1] as const).map((s): Point => {
    const lift = s > 0 ? pose.rightLift : pose.leftLift
    const step = s > 0 ? pose.rightStep : pose.leftStep
    return [s * (STANCE + pose.stance), STANDING_ANKLE_Y + jump + lift, -step]
  }) as [Point, Point]
  // Low enough for both feet to reach the ground with the legs just short of straight
  const reach = (THIGH + SHIN) * 0.995
  let top = PELVIS_Y - SOFT_KNEES - pose.hipDrop + pose.bounce
  for (const [index, ankle] of ankles.entries()) {
    hipAt(index === 0 ? -1 : 1, roll, hip)
    const dx = ankle[0] - (pose.hipShift + hip.x)
    const dz = ankle[2] - hip.z
    const across = Math.min(reach * reach - 1e-6, dx * dx + dz * dz)
    const highest = ankle[1] - hip.y + Math.sqrt(reach * reach - across)
    top = Math.min(top, highest)
  }
  return {
    pelvis: [pose.hipShift, top, 0],
    pelvisRoll: roll,
    ankles,
    toes: [
      [0, -0.04, -0.15],
      [0, -0.04, -0.15],
    ],
    // The knees forward, and a little out
    knees: [
      [-0.15, 0.1, -1],
      [0.15, 0.1, -1],
    ],
  }
}

/** The boot is built pointing this way from the ankle, the leg hanging straight down */
const BOOT_WAY = new Vector3(0, -0.04, -0.15).normalize()

const local = new Vector3()
const fold = new Quaternion()
const kneeTurn = new Quaternion()
const toeWay = new Vector3()
const footTurn = new Quaternion()
const rolled = new Quaternion()
const AXIS_Z = new Vector3(0, 0, 1)
const AXIS_X = new Vector3(1, 0, 0)

export interface LegJoints {
  /** The knee's bend, radians (0 straight, about its own x) */
  readonly knee: number
}

/**
 * One leg: the hip's turn (`hipInto`) and the knee's bend for the ankle to reach `targets`' (two
 * bones, the knee towards its pole), and the ankle's turn (`ankleInto`, in the knee's frame) for the
 * boot to point at its toe. The legs are built hanging straight down from the hips, like the arms
 */
export function poseLeg(
  targets: LegTargets,
  index: 0 | 1,
  hipInto: Quaternion,
  ankleInto: Quaternion,
): LegJoints {
  const side = index === 0 ? -1 : 1
  const ankle = targets.ankles[index]
  // The ankle from the hip, in the pelvis's frame (the pelvis moved and rolled)
  local
    .set(ankle[0] - targets.pelvis[0], ankle[1] - targets.pelvis[1], ankle[2] - targets.pelvis[2])
    .applyQuaternion(rolled.setFromAxisAngle(AXIS_Z, -targets.pelvisRoll))
    .sub(hip.set(side * HIP_X, 0, 0))
  const pole = toeWay.set(...targets.knees[index])
  const knee = reachArm(local, pole, hipInto, THIGH, SHIN)
  // The boot: from the way it was built to the way its toe points, then into the knee's frame
  toeWay.set(...targets.toes[index]).normalize().applyQuaternion(rolled)
  footTurn.setFromUnitVectors(BOOT_WAY, toeWay)
  kneeTurn.copy(hipInto).multiply(fold.setFromAxisAngle(AXIS_X, knee))
  ankleInto.copy(kneeTurn).invert().multiply(footTurn)
  return { knee }
}

// ── The hands ────────────────────────────────────────────────────────────────────────────────────

/**
 * The shapes a glove makes: round the wheel's grip, a fist, open (a wave), pointing, a thumb up, a V,
 * and at ease (hanging at the side, the fingers half curled)
 */
export type HandShape = 'grip' | 'fist' | 'open' | 'point' | 'thumb' | 'vee' | 'relax'

export const HAND_SHAPES: readonly HandShape[] = ['grip', 'fist', 'open', 'point', 'thumb', 'vee', 'relax']

export interface HandCurl {
  /** Each finger's curl, index to little, 0 straight to 1 a fist (about 90° at each knuckle) */
  readonly fingers: readonly [number, number, number, number]
  /** How far the fingers fan out, radians between neighbours */
  readonly spread: number
  /**
   * The thumb: the way it points from its root, in the hand's frame with x towards the index finger
   * (the arm's own x mirrored on the left), -y down the fingers, -z out of the palm
   */
  readonly thumb: Point
}

/** The fingers of each shape */
export function handCurl(shape: HandShape): HandCurl {
  switch (shape) {
    case 'grip':
      // Wrapped round a grip about 4 cm thick, the thumb round the other side
      return { fingers: [0.72, 0.75, 0.78, 0.8], spread: 0.02, thumb: [-0.35, -0.55, -0.75] }
    case 'fist':
      return { fingers: [1, 1, 1, 1], spread: 0, thumb: [-0.7, -0.35, -0.6] }
    case 'open':
      return { fingers: [0.04, 0.02, 0.04, 0.08], spread: 0.16, thumb: [0.75, -0.6, -0.15] }
    case 'point':
      return { fingers: [0, 1, 1, 1], spread: 0.04, thumb: [-0.6, -0.4, -0.65] }
    case 'thumb':
      return { fingers: [1, 1, 1, 1], spread: 0, thumb: [1, 0.12, 0] }
    case 'vee':
      return { fingers: [0, 0, 1, 1], spread: 0.3, thumb: [-0.6, -0.4, -0.65] }
    case 'relax':
      return { fingers: [0.3, 0.36, 0.42, 0.48], spread: 0.05, thumb: [0.3, -0.75, -0.45] }
  }
}

/** How far each knuckle of a finger bends at a full curl, radians (the root, the middle, the tip) */
export const KNUCKLES = [1.45, 1.6, 1.1] as const

// ── The skin ─────────────────────────────────────────────────────────────────────────────────────

/** Smoothly from 0 at `from` to 1 at `to` */
export function smoothStep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Over this far either side of a joint, metres, a sleeve or a leg goes from one bone to the next */
export const SKIN_BLEND = 0.045

/**
 * How much of a vertex `y` metres along a limb built hanging down from its root (so `y` runs
 * negative) follows the joint `joint` metres down it, rather than the root: none above the blend,
 * all below it, smoothly between, so that a bent elbow or knee is one smooth sleeve
 */
export function jointShare(y: number, joint: number, blend = SKIN_BLEND): number {
  return smoothStep(-joint + blend, -joint - blend, y)
}
