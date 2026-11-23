// 2026-11-23 (docs/ARCHITECTURE.md §4.86): the driver's skeleton, worked out in code. No outside model
// and no skinning: the driver (art/driverModel.ts) is a few rigid parts hung on joints, the hips on the
// seat, the torso on the hips, the head on the torso, each arm a shoulder, an elbow and a hand. This
// file is the arithmetic, pure so that a test can read it: given how the kart is steered, how far it
// slides, whether a boost burns and whether a hit has stunned the driver, the angle of every joint;
// and given where a hand must be (on the wheel, which turns), how the shoulder and the elbow bend to
// put it there (two bones, the elbow out to the side). art/kartModel.ts eases the inputs, calls these
// and puts the angles on the parts; a driver at rest on a low quality is not moved at all.
import { Matrix4, Quaternion, Vector3 } from 'three'

/** The arm, metres: the shoulder to the elbow, and the elbow to the middle of the palm */
export const UPPER_ARM = 0.29
export const FOREARM = 0.3

/** How far the wheel turns at full lock, radians (about 65°) */
export const WHEEL_LOCK = 1.15
/** In a drift the driver holds a little opposite lock, radians at full slide */
export const COUNTER_LOCK = 0.45

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const along = new Vector3()
const bendTo = new Vector3()
const elbowAt = new Vector3()
const fore = new Vector3()
const upperWay = new Vector3()
const across = new Vector3()
const basisX = new Vector3()
const basisY = new Vector3()
const basisZ = new Vector3()
const turn = new Matrix4()

/**
 * Two bones from the shoulder to `target` (both in the shoulder's parent's frame, relative to the
 * shoulder), the elbow pointing as near `pole` as it can. Each arm is built hanging straight down
 * (-y) from its shoulder with its elbow bending about its own x: `into` gets the shoulder's turn,
 * and the elbow's bend (radians, 0 straight) is returned. A target out of reach is reached for
 */
export function reachArm(
  target: Vector3,
  pole: Vector3,
  into: Quaternion,
  upper = UPPER_ARM,
  forearm = FOREARM,
): number {
  const distance = target.length()
  along.copy(target).divideScalar(distance || 1)
  if (distance === 0) along.set(0, -1, 0)
  const reach = clamp(distance, Math.abs(upper - forearm) + 1e-3, (upper + forearm) * 0.999)
  // The angle at the shoulder between the line to the hand and the upper arm (the law of cosines)
  const cosA = clamp((upper * upper + reach * reach - forearm * forearm) / (2 * upper * reach), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  // Which way the elbow goes: the pole, square to the line to the hand
  bendTo.copy(pole).addScaledVector(along, -pole.dot(along))
  if (bendTo.lengthSq() < 1e-10) bendTo.set(1, 0, 0).addScaledVector(along, -along.x)
  bendTo.normalize()
  // The upper arm, and the forearm from the elbow to the hand
  upperWay.copy(along).multiplyScalar(cosA).addScaledVector(bendTo, sinA)
  elbowAt.copy(upperWay).multiplyScalar(upper)
  fore.copy(along).multiplyScalar(reach).sub(elbowAt).normalize()
  const cosBend = clamp(upperWay.dot(fore), -1, 1)
  // The side the forearm folds to, square to the upper arm
  across.copy(fore).addScaledVector(upperWay, -cosBend)
  if (across.lengthSq() < 1e-10) across.copy(bendTo).negate().addScaledVector(upperWay, bendTo.dot(upperWay))
  across.normalize()
  // The shoulder's frame: its -y down the upper arm, its -z the way the forearm folds
  basisZ.copy(across).negate()
  basisX.copy(upperWay).cross(across)
  basisY.copy(upperWay).negate()
  turn.makeBasis(basisX, basisY, basisZ)
  into.setFromRotationMatrix(turn)
  return Math.acos(cosBend)
}

/** What moves the driver, already eased (art/kartModel.ts) */
export interface DriveState {
  /** -1 left to 1 right */
  readonly steer: number
  /** -1 sliding left, 1 right, 0 not */
  readonly drift: number
  /** How hard a boost burns, 0 to 1 (boostFx.ts's heat) */
  readonly heat: number
  /** Pulling away (+) or braking (-), the kart's own surge, radians of lean it is worth */
  readonly surge: number
  /** How stunned by a hit, 0 to 1, and the sway's running phase, radians */
  readonly dazed: number
  readonly sway: number
  /** Astride a bike, lying forward this far (radians, negative forward) */
  readonly bike?: boolean
  readonly crouch?: number
}

/** The driving joints, radians (three.js's: + about x tips back, + about y turns left, + about z leans left) */
export interface DriveJoints {
  readonly torsoLean: number
  readonly torsoBack: number
  readonly torsoTwist: number
  readonly headTurn: number
  readonly headUp: number
  readonly headRoll: number
  /** The wheel (or a bike's bars) turned this far, + to the right */
  readonly wheel: number
  /** Stunned, the hands come up off the wheel a little: each arm's lift, radians */
  readonly loose: readonly [number, number]
}

/**
 * The driving pose. Into a turn the torso leans in and the head turns to look where the kart goes;
 * in a drift the shoulders turn to the inside of the slide, the head further (looking at the apex)
 * and the wheel holds opposite lock; a boost throws the torso back and the chin up; a stun sways
 * the torso, lolls the head and loosens the hands
 */
export function driveJoints(state: DriveState): DriveJoints {
  const { steer, drift, heat, surge, dazed, sway } = state
  const bike = state.bike ?? false
  const crouch = state.crouch ?? 0
  const lean = bike ? -steer * 0.1 - drift * 0.16 : -steer * 0.16 - drift * 0.12
  const back = surge + heat * 0.24
  return {
    torsoLean: lean + Math.sin(sway) * 0.3 * dazed,
    torsoBack: crouch + back * (bike ? 0.6 : 1) + Math.cos(sway * 0.7) * 0.12 * dazed,
    torsoTwist: -drift * 0.14 - steer * 0.04,
    headTurn: -steer * 0.28 - drift * 0.36 + Math.sin(sway * 0.6) * 0.25 * dazed,
    // The eyes kept level a little against the lean, the chin up in a boost
    headUp: -crouch * 0.9 - back * 0.5 + Math.cos(sway * 1.1) * 0.2 * dazed,
    headRoll: -lean * 0.45 + Math.sin(sway * 1.3 + 1) * 0.35 * dazed,
    wheel: clamp(steer * WHEEL_LOCK - drift * COUNTER_LOCK, -WHEEL_LOCK, WHEEL_LOCK),
    loose: [
      dazed * (0.35 + Math.sin(sway * 1.7) * 0.25),
      dazed * (0.35 + Math.sin(sway * 1.7 + 2) * 0.25),
    ],
  }
}

/** How bent an arm is held up off the wheel (a gesture), radians */
export const RAISED_BEND = 0.3

/**
 * The elbow's bend: the reach's while the hand is on the wheel, easing to `RAISED_BEND` as a
 * gesture lifts the arm (`up` radians about the shoulder), plus what the gesture asks
 */
export function elbowBend(reach: number, up: number, extra = 0): number {
  const lifted = clamp(Math.abs(up) / 1.8, 0, 1)
  return Math.max(0, reach + (RAISED_BEND - reach) * lifted + extra)
}
