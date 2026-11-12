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

export interface CameraRig {
  /** Which way the camera looks, as a heading (0 faces -z, growing clockwise) */
  readonly heading: number
  /** 0 to 1: how far into the boost kick the view is */
  readonly boost: number
}

export interface Chased {
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly boosting: boolean
}

const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export const startRig = (heading: number): CameraRig => ({ heading, boost: 0 })

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
  return {
    heading: wrap(rig.heading + wrap(aimOf(car) - rig.heading) * follow),
    boost: rig.boost + ((car.boosting ? 1 : 0) - rig.boost) * ease,
  }
}

/** The vertical field of view: wider in a boost, unless the viewer asked for less motion */
export const fieldOfView = (base: number, rig: CameraRig, reducedMotion: boolean): number =>
  reducedMotion ? base : base + BOOST_FOV_KICK * rig.boost
