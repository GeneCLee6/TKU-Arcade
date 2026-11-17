// e8-t08: the chase camera's aim, without three.js, so that it is tested in Node. Scene.ts places
// the camera from it every frame.
//
// The camera sits behind the direction the car is going, not the way its nose points: in a drift the
// nose swings out of line and the car is seen side-on, which is what makes a drift readable.
// 2026-11-14 (the drift as a real slide): while the car slides the camera swings part of the way
// round with the nose, towards where the car is about to go, and follows more slowly, so the slide
// is seen to carry the car wide before it comes round.
// 2026-11-17 (the classic feel, docs/KART-FEEL.md): a spring with damping instead of a plain ease, so
// the camera swings round smoothly and settles without overshoot, in about FOLLOW_SECONDS (0.2 s
// behind a slide); the view widens from 60° to 75° with the speed and 8° more in a boost.

/** Below this forward speed the direction of travel says little: the camera follows the nose */
const TRAVEL_MIN_SPEED = 3
/** About how long the camera takes to swing round to its aim: it lags a little, so turns show */
export const FOLLOW_SECONDS = 0.15
/** The same while the car slides: a little longer, so the camera lags the slide */
export const SLIDE_FOLLOW_SECONDS = 0.2
/** The spring's stiffness for those (critically damped: ω, with 1 − (1 + ωt)e^(−ωt) of the way done) */
export const CAMERA_FOLLOW = 2 / FOLLOW_SECONDS
export const SLIDE_FOLLOW = 2 / SLIDE_FOLLOW_SECONDS
/** How far from the travel towards the nose the camera aims while the car slides, 0 to 1 */
export const SLIDE_SWING = 0.15
/** How fast the boost kick comes and goes, per second */
const BOOST_EASE = 6
/** How much wider the view gets at full boost, in degrees */
export const BOOST_FOV_KICK = 8
/**
 * 2026-11-14 (owner: "still too slow"): the view also widens with speed itself, up to this many
 * degrees at REFERENCE_SPEED and beyond, so that going fast reads as fast even without a boost
 */
export const SPEED_FOV_KICK = 15
/** The plain top speed, m/s (the classic feel's): `pace` is the speed over this */
export const REFERENCE_SPEED = 68
/** How fast the pace follows the speed, per second */
const PACE_EASE = 4

export interface CameraRig {
  /** Which way the camera looks, as a heading (0 faces -z, growing clockwise) */
  readonly heading: number
  /** 0 to 1: how far into the boost kick the view is */
  readonly boost: number
  /** The speed over REFERENCE_SPEED, eased: 1 flat out, about 1.3 in a boost */
  readonly pace: number
  /** How fast the camera is swinging round, radians a second (the spring's speed); 0 when left out */
  readonly turn?: number
}

export interface Chased {
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly boosting: boolean
  /** Whether the car is sliding: in a drift, or just out of one with the grip not yet back */
  readonly skidding?: boolean
}

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export const startRig = (heading: number): CameraRig => ({ heading, boost: 0, pace: 0, turn: 0 })

/** Where the camera wants to look: along the travel when going forwards, else along the nose */
export function aimOf({ heading, vx, vz, skidding }: Chased): number {
  const forward = vx * Math.sin(heading) - vz * Math.cos(heading)
  if (forward < TRAVEL_MIN_SPEED) return heading
  const travel = Math.atan2(vx, -vz)
  return skidding ? wrap(travel + wrap(heading - travel) * SLIDE_SWING) : travel
}

/**
 * One frame of the camera, `seconds` long. Eases by 1 - e^(-rate·t), so a frame twice as long moves
 * as far as two short ones: the camera behaves the same at 30 and 144 fps.
 */
export function followCar(rig: CameraRig, car: Chased, seconds: number): CameraRig {
  const omega = car.skidding ? SLIDE_FOLLOW : CAMERA_FOLLOW
  const ease = 1 - Math.exp(-BOOST_EASE * seconds)
  const paceEase = 1 - Math.exp(-PACE_EASE * seconds)
  const pace = Math.hypot(car.vx, car.vz) / REFERENCE_SPEED
  // A critically damped spring towards the aim, solved exactly over the frame
  const off = wrap(rig.heading - aimOf(car))
  const turn = rig.turn ?? 0
  const decay = Math.exp(-omega * seconds)
  const carry = turn + omega * off
  const nextOff = (off + carry * seconds) * decay
  const nextTurn = (turn - omega * carry * seconds) * decay
  return {
    heading: wrap(aimOf(car) + nextOff),
    boost: rig.boost + ((car.boosting ? 1 : 0) - rig.boost) * ease,
    pace: rig.pace + (pace - rig.pace) * paceEase,
    turn: nextTurn,
  }
}

/**
 * The vertical field of view: wider with speed (from 30% of the top speed to all of it) and wider
 * still in a boost, unless the viewer asked for less motion
 */
export const fieldOfView = (base: number, rig: CameraRig, reducedMotion: boolean): number =>
  reducedMotion
    ? base
    : base +
      SPEED_FOV_KICK * Math.max(0, Math.min(1, (rig.pace - 0.3) / 0.7)) +
      BOOST_FOV_KICK * rig.boost
