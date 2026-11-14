// e8-t08: the chase camera's aim, without three.js, so that it is tested in Node. Scene.ts places
// the camera from it every frame.
//
// The camera sits behind the direction the car is going, not the way its nose points: in a drift the
// nose swings out of line and the car is seen side-on, which is what makes a drift readable.

/** Below this forward speed the direction of travel says little: the camera follows the nose */
const TRAVEL_MIN_SPEED = 3
/** How fast the camera swings round to its aim, per second: it lags a little, so turns show */
export const CAMERA_FOLLOW = 5
/** How fast the boost kick comes and goes, per second */
const BOOST_EASE = 6
/** How much wider the view gets at full boost, in degrees */
export const BOOST_FOV_KICK = 8
/**
 * 2026-11-14 (owner: "still too slow"): the view also widens with speed itself, up to this many
 * degrees at REFERENCE_SPEED and beyond, so that going fast reads as fast even without a boost
 */
export const SPEED_FOV_KICK = 10
/** The plain top speed, m/s: `pace` is the speed over this */
export const REFERENCE_SPEED = 50
/** How fast the pace follows the speed, per second */
const PACE_EASE = 4

export interface CameraRig {
  /** Which way the camera looks, as a heading (0 faces -z, growing clockwise) */
  readonly heading: number
  /** 0 to 1: how far into the boost kick the view is */
  readonly boost: number
  /** The speed over REFERENCE_SPEED, eased: 1 flat out, about 1.4 in a boost */
  readonly pace: number
}

export interface Chased {
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly boosting: boolean
}

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export const startRig = (heading: number): CameraRig => ({ heading, boost: 0, pace: 0 })

/** Where the camera wants to look: along the travel when going forwards, else along the nose */
export function aimOf({ heading, vx, vz }: Chased): number {
  const forward = vx * Math.sin(heading) - vz * Math.cos(heading)
  return forward >= TRAVEL_MIN_SPEED ? Math.atan2(vx, -vz) : heading
}

/**
 * One frame of the camera, `seconds` long. Eases by 1 - e^(-rate·t), so a frame twice as long moves
 * as far as two short ones: the camera behaves the same at 30 and 144 fps.
 */
export function followCar(rig: CameraRig, car: Chased, seconds: number): CameraRig {
  const follow = 1 - Math.exp(-CAMERA_FOLLOW * seconds)
  const ease = 1 - Math.exp(-BOOST_EASE * seconds)
  const paceEase = 1 - Math.exp(-PACE_EASE * seconds)
  const pace = Math.hypot(car.vx, car.vz) / REFERENCE_SPEED
  return {
    heading: wrap(rig.heading + wrap(aimOf(car) - rig.heading) * follow),
    boost: rig.boost + ((car.boosting ? 1 : 0) - rig.boost) * ease,
    pace: rig.pace + (pace - rig.pace) * paceEase,
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
