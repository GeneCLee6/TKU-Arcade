// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): where the camera stands for each of the
// director's shots (shared/kart/broadcast.ts), and how it gets from one to the next. Without
// three.js, so that it is tested in Node; the watch loop hands the shot to the scene
// (`KartScene.shot`), whose `watch` blends it over the chase camera.
//
// Heights are over the followed kart's road (the scene adds it): a roadside camera on a hill track
// rises and falls with the kart it watches, which is nearer the truth than a camera at sea level.
//
// The shots: behind the kart (the scene's own chase camera); beside it, keeping pace; low behind it,
// near the road, the kart big against the sky; high above and behind; and a roadside camera, fixed
// where it stands, turning to follow the kart past it. A cut between two karts near each other, or
// between two shots of one kart, glides over TRANSITION seconds (eased), so that the eye keeps its
// place; a cut to somewhere far away, or with less motion asked for, is a plain cut.
import type { ShotKind } from '../../shared/kart/broadcast.ts'
import {
  cameraFor,
  FINISH_REACH,
  type TracksideCamera,
} from '../../shared/kart/broadcastCameras.ts'
import { smooth, type CameraShot, type Point3 } from './director.ts'

export interface ShotKart {
  readonly x: number
  readonly z: number
  readonly heading: number
}

/** Beside the kart: this far out, this far back, this high, metres */
export const SIDE_OUT = 6.2
export const SIDE_BACK = 1.2
export const SIDE_UP = 1.5
/** Low behind it: this far back, this high */
export const LOW_BACK = 3.4
export const LOW_UP = 0.45
/** High above it: this far back, this high */
export const AERIAL_BACK = 9
export const AERIAL_UP = 21
/** A glide between shots lasts this long, seconds; one further than GLIDE_REACH metres is a cut */
export const TRANSITION = 0.7
export const GLIDE_REACH = 40

const forwardOf = (heading: number) => ({ x: Math.sin(heading), z: -Math.cos(heading) })

/**
 * Where the camera is for `kind` on `kart` (its heading eased by the caller, so that a side shot
 * does not swing with every twitch of the wheel); null for the chase camera, the scene's own
 */
export function shotPose(
  kind: ShotKind,
  kart: ShotKart,
  cameras: readonly TracksideCamera[],
  finish = false,
): Omit<CameraShot, 'blend'> | null {
  const forward = forwardOf(kart.heading)
  const right = { x: -forward.z, z: forward.x }
  const at = (back: number, out: number, up: number): Point3 => ({
    x: kart.x - forward.x * back + right.x * out,
    y: up,
    z: kart.z - forward.z * back + right.z * out,
  })
  const ahead = (metres: number, up: number): Point3 => ({
    x: kart.x + forward.x * metres,
    y: up,
    z: kart.z + forward.z * metres,
  })
  switch (kind) {
    case 'chase':
      return null
    case 'side':
      return { eye: at(SIDE_BACK, SIDE_OUT, SIDE_UP), target: ahead(1.5, 0.7) }
    case 'low':
      return { eye: at(LOW_BACK, 0.6, LOW_UP), target: ahead(6, 1.1) }
    case 'aerial':
      return { eye: at(AERIAL_BACK, 0, AERIAL_UP), target: ahead(5, 0) }
    case 'trackside': {
      const camera =
        (finish ? cameraFor(cameras, kart, true, FINISH_REACH) : null) ?? cameraFor(cameras, kart)
      if (!camera) return { eye: at(SIDE_BACK, SIDE_OUT, SIDE_UP), target: ahead(1.5, 0.7) }
      return { eye: { x: camera.x, y: camera.y, z: camera.z }, target: ahead(1, 0.6) }
    }
  }
}

const lerp = (a: number, b: number, share: number) => a + (b - a) * share
const lerpPoint = (a: Point3, b: Point3, share: number): Point3 => ({
  x: lerp(a.x, b.x, share),
  y: lerp(a.y, b.y, share),
  z: lerp(a.z, b.z, share),
})

/** The camera as the last frame drew it: where it stood and the point it looked at */
export interface CameraPose {
  readonly eye: Point3
  readonly target: Point3
}

/** The glide from the last cut: where the camera stood then, and when (wall-clock seconds) */
export interface Glide {
  readonly from: CameraPose
  readonly at: number
}

/** Whether a cut from `from` to a kart at `to` glides (near enough, motion allowed) or just cuts */
export function glides(from: CameraPose | null, to: ShotKart, reducedMotion: boolean): boolean {
  if (!from || reducedMotion) return false
  return Math.hypot(from.target.x - to.x, from.target.z - to.z) <= GLIDE_REACH
}

/**
 * The shot to hand the scene now: `want` (null for the chase camera), eased in from where the camera
 * stood at the cut while a glide runs. Over the chase camera, the glide is the old pose blended out
 */
export function shotNow(
  want: Omit<CameraShot, 'blend'> | null,
  glide: Glide | null,
  now: number,
): CameraShot | null {
  const share = glide ? smooth(now - glide.at, 0, TRANSITION) : 1
  if (!glide || share >= 1) return want ? { ...want, blend: 1 } : null
  if (!want) return { ...glide.from, blend: 1 - share }
  return {
    eye: lerpPoint(glide.from.eye, want.eye, share),
    target: lerpPoint(glide.from.target, want.target, share),
    blend: 1,
  }
}

/** Eases a heading towards `toward` at `rate` per second, the short way round */
export function easeHeading(heading: number, toward: number, seconds: number, rate = 3): number {
  const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
  return wrap(heading + wrap(toward - heading) * (1 - Math.exp(-rate * seconds)))
}
