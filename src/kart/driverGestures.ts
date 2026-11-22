// 2026-11-20 (docs/ARCHITECTURE.md §4.47): what the drivers do besides drive. On the grid they look
// round and drum on the yoke; during the fly round the grid they wave; a place gained, a fist in the
// air; across the line, both arms up; on the Grand Prix's podium, arms up and waving. Stunned by a
// hit they already sway (kartModel.ts, #99). Which gesture when, and the pose it makes, pure so that
// a test can read them; kartModel.ts eases between them and puts them on the driver.

// 2026-11-22 (§4.72): and on the podium after a race, the winner lifts the trophy high (the podium's
// stage puts the cup in the hands)
export type DriverGesture = 'idle' | 'wave' | 'pump' | 'cheer' | 'podium' | 'trophy'

/** A fist in the air this long after a place gained, s */
export const PUMP_SECONDS = 1.3
/** Arms up this long after crossing the line, s */
export const CHEER_SECONDS = 4
/** The fly round the grid lasts until this many seconds before GO (director.ts's inIntro) */
export const WAVE_UNTIL = 3

export interface GestureMoment {
  /** Seconds to GO; null when there is no countdown (racing, or no start set yet) */
  readonly toGo: number | null
  /** Seconds since this racer crossed the line; null before */
  readonly sinceFinish: number | null
  /** Seconds since it last gained a place; null if never */
  readonly sincePlaceUp?: number | null
}

/** The gesture for this moment: the finish first, then the grid, then a place gained */
export function gestureAt({ toGo, sinceFinish, sincePlaceUp }: GestureMoment): DriverGesture | undefined {
  if (sinceFinish !== null && sinceFinish >= 0) return sinceFinish < CHEER_SECONDS ? 'cheer' : 'idle'
  if (toGo !== null && toGo > 0) return toGo > WAVE_UNTIL ? 'wave' : 'idle'
  if (sincePlaceUp != null && sincePlaceUp >= 0 && sincePlaceUp < PUMP_SECONDS) return 'pump'
  return undefined
}

/** The driver's joints, radians, added to how they sit driving */
export interface GesturePose {
  /** Each arm: up (+x about the shoulder), out to the side (z, mirrored for the left) */
  readonly leftUp: number
  readonly leftOut: number
  readonly rightUp: number
  readonly rightOut: number
  /** The head: turned (y) and tipped back (x) */
  readonly headTurn: number
  readonly headUp: number
  /** The torso: upright and back (x), a bounce (metres up) */
  readonly torsoBack: number
  readonly bounce: number
}

export const REST: GesturePose = {
  leftUp: 0,
  leftOut: 0,
  rightUp: 0,
  rightOut: 0,
  headTurn: 0,
  headUp: 0,
  torsoBack: 0,
  bounce: 0,
}

/**
 * The pose of `gesture` `t` seconds into it; `seed` (0 to 1) puts each driver at their own point
 * of a gesture that loops, so that a grid of them does not move as one
 */
export function gesturePose(gesture: DriverGesture, t: number, seed = 0): GesturePose {
  const phase = seed * Math.PI * 2
  switch (gesture) {
    case 'idle': {
      // A look to one side, back, to the other, every few seconds; a drum on the yoke now and then
      const look = Math.sin(t * 0.9 + phase)
      const turn = Math.sign(look) * Math.min(1, Math.abs(look) * 1.6) * 0.55
      const drumming = Math.max(0, Math.sin(t * 0.7 + phase * 1.7)) > 0.8
      const tap = drumming ? Math.max(0, Math.sin(t * 16)) * 0.22 : 0
      const otherTap = drumming ? Math.max(0, Math.sin(t * 16 + Math.PI)) * 0.22 : 0
      return { ...REST, headTurn: turn, leftUp: tap, rightUp: otherTap, headUp: 0.05 }
    }
    case 'wave': {
      // The right arm up and waving, the head turned out to the crowd
      const wave = Math.sin(t * 8 + phase)
      return { ...REST, rightUp: 2.3, rightOut: 0.55 + wave * 0.35, headTurn: -0.35, headUp: 0.12, torsoBack: 0.05 }
    }
    case 'pump': {
      // Up fast, two short punches, down
      const rise = Math.min(1, t / 0.15) * Math.min(1, Math.max(0, (PUMP_SECONDS - t) / 0.25))
      const punch = Math.abs(Math.sin(t * 9)) * 0.25
      return { ...REST, rightUp: (2.2 + punch) * rise, rightOut: 0.4 * rise, headUp: 0.15 * rise, torsoBack: 0.08 * rise }
    }
    case 'cheer': {
      // Both arms up, shaking, a bounce in the seat
      const rise = Math.min(1, t / 0.3)
      const shake = Math.sin(t * 11 + phase) * 0.18
      return {
        leftUp: 2.4 * rise,
        rightUp: 2.4 * rise,
        leftOut: (0.75 + shake) * rise,
        rightOut: (0.75 - shake) * rise,
        headTurn: Math.sin(t * 2 + phase) * 0.2 * rise,
        headUp: 0.3 * rise,
        torsoBack: 0.15 * rise,
        bounce: Math.abs(Math.sin(t * 5.5 + phase)) * 0.05 * rise,
      }
    }
    case 'podium': {
      // Arms up, waving in turn, looking round the crowd
      const left = Math.sin(t * 3 + phase)
      return {
        leftUp: 2.4 + left * 0.15,
        rightUp: 2.4 - left * 0.15,
        leftOut: 0.8 + left * 0.25,
        rightOut: 0.8 - left * 0.25,
        headTurn: Math.sin(t * 0.8 + phase) * 0.4,
        headUp: 0.25,
        torsoBack: 0.12,
        bounce: Math.abs(Math.sin(t * 3)) * 0.03,
      }
    }
    case 'trophy': {
      // Both hands together straight overhead, lifted in time with the crowd, looking up at it
      const rise = Math.min(1, t / 0.4)
      const lift = Math.max(0, Math.sin(t * 4 + phase)) * 0.12
      return {
        leftUp: (2.9 + lift) * rise,
        rightUp: (2.9 + lift) * rise,
        leftOut: 0.12 * rise,
        rightOut: 0.12 * rise,
        headTurn: Math.sin(t * 0.7 + phase) * 0.15 * rise,
        headUp: 0.35 * rise,
        torsoBack: 0.1 * rise,
        bounce: lift * 0.25 * rise,
      }
    }
  }
}

/** One pose eased toward another by `share` (0 to 1) */
export function blendPose(from: GesturePose, to: GesturePose, share: number): GesturePose {
  const mix = (a: number, b: number) => a + (b - a) * share
  return {
    leftUp: mix(from.leftUp, to.leftUp),
    leftOut: mix(from.leftOut, to.leftOut),
    rightUp: mix(from.rightUp, to.rightUp),
    rightOut: mix(from.rightOut, to.rightOut),
    headTurn: mix(from.headTurn, to.headTurn),
    headUp: mix(from.headUp, to.headUp),
    torsoBack: mix(from.torsoBack, to.torsoBack),
    bounce: mix(from.bounce, to.bounce),
  }
}
