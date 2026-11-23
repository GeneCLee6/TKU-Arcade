// 2026-11-20 (docs/ARCHITECTURE.md §4.47): what the drivers do besides drive. On the grid they look
// round and drum on the yoke; during the fly round the grid they wave; a place gained, a fist in the
// air; across the line, both arms up; on the Grand Prix's podium, arms up and waving. Stunned by a
// hit they already sway (kartModel.ts, #99). Which gesture when, and the pose it makes, pure so that
// a test can read them; kartModel.ts eases between them and puts them on the driver.
//
// 2026-11-23 (§4.85, driverRig.ts): the driver has elbows and hands now, so a pose can bend an arm
// (a flexed arm, hands meeting over the helmet), tilt the head, turn the torso and show a V; and the
// wait on the grid and the win across the line are each driver's own (`GestureStyle`).

// 2026-11-22 (§4.73): and on the podium after a race, the winner lifts the trophy high (the podium's
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
  /**
   * 2026-11-23: each elbow bent this much more than a raised arm holds it (driverRig.ts's
   * elbowBend: a flexed arm, hands meeting over the head), radians
   */
  readonly leftBend: number
  readonly rightBend: number
  /** The head: turned (y), tipped back (x) and (2026-11-23) tilted to a side (z) */
  readonly headTurn: number
  readonly headUp: number
  readonly headTilt: number
  /** The torso: upright and back (x), a bounce (metres up), and (2026-11-23) turned (y) */
  readonly torsoBack: number
  readonly bounce: number
  readonly twist: number
  /** 2026-11-23: the right hand shows two fingers (a V), 0 to 1: shown from a half */
  readonly vSign: number
}

export const REST: GesturePose = {
  leftUp: 0,
  leftOut: 0,
  rightUp: 0,
  rightOut: 0,
  leftBend: 0,
  rightBend: 0,
  headTurn: 0,
  headUp: 0,
  headTilt: 0,
  torsoBack: 0,
  bounce: 0,
  twist: 0,
  vSign: 0,
}

/**
 * 2026-11-23 (docs/KART-WORLD.md §3): whose gesture it is. Each of the four waits and wins in their
 * own way. Spade, the calm one, sits still and looks down the road, now and then a hand to the
 * visor, and wins with one fist straight up and the other hand pointing down the road. Hartie, who
 * cheers everyone on, bobs to a beat and wins with both hands meeting over the helmet in a heart,
 * swaying. Dee, who reads the road book, glances down at the read-out and flexes the fingers, and
 * wins with a V held up. Clover, never missing a club night, stretches and rolls the shoulders, and
 * wins with both arms flexed and a bounce. Left out, the shared gestures of §4.47
 */
export type GestureStyle = 'spade' | 'heart' | 'diamond' | 'club'

/** Rising to a pose over `over` seconds */
const riseOf = (t: number, over: number) => Math.min(1, t / over)

function idleOf(style: GestureStyle | undefined, t: number, phase: number): GesturePose {
  switch (style) {
    case 'spade': {
      // Still: a slow look down the road and back, a breath; every so often the left hand to the visor
      const look = Math.sin(t * 0.45 + phase) * 0.22
      const visor = Math.max(0, Math.sin(t * 0.35 + phase * 1.3) - 0.85) / 0.15
      return {
        ...REST,
        headTurn: look,
        headUp: 0.03 + Math.sin(t * 1.4) * 0.015 + visor * 0.12,
        leftUp: visor * 0.28,
        leftOut: visor * 0.1,
        leftBend: visor * 0.25,
        bounce: Math.sin(t * 1.4 + phase) * 0.004,
      }
    }
    case 'heart': {
      // A beat: the head bobs and tilts in time, the shoulders sway, a drum on the wheel on the beat
      const beat = t * 4.2 + phase
      return {
        ...REST,
        headUp: 0.06 + Math.abs(Math.sin(beat)) * 0.1,
        headTilt: Math.sin(beat / 2) * 0.16,
        headTurn: Math.sin(t * 0.6 + phase) * 0.3,
        twist: Math.sin(beat / 2) * 0.06,
        leftUp: Math.max(0, Math.sin(beat)) * 0.18,
        rightUp: Math.max(0, Math.sin(beat + Math.PI)) * 0.18,
        bounce: Math.abs(Math.sin(beat)) * 0.012,
      }
    }
    case 'diamond': {
      // Reading: a glance down at the read-out, back up; the hands flex on the wheel in turn
      const glance = Math.max(0, Math.sin(t * 0.8 + phase))
      return {
        ...REST,
        headUp: -glance * 0.28 + 0.04,
        headTurn: Math.sin(t * 0.3 + phase) * 0.12,
        leftBend: Math.max(0, Math.sin(t * 3 + phase)) * 0.12,
        rightBend: Math.max(0, Math.sin(t * 3 + phase + Math.PI)) * 0.12,
        twist: -glance * 0.03,
      }
    }
    case 'club': {
      // Loosening up: the shoulders roll, the neck stretches to each side, now and then an arm up
      const roll = t * 1.1 + phase
      const stretch = Math.max(0, Math.sin(t * 0.5 + phase * 1.7) - 0.6) / 0.4
      return {
        ...REST,
        headTilt: Math.sin(roll) * 0.22,
        headTurn: Math.cos(roll) * 0.18,
        torsoBack: Math.sin(roll * 2) * 0.03,
        twist: Math.sin(roll) * 0.05,
        leftUp: stretch * 0.26,
        leftOut: stretch * 0.15,
        bounce: Math.abs(Math.sin(roll * 2)) * 0.006,
      }
    }
    default: {
      // A look to one side, back, to the other, every few seconds; a drum on the yoke now and then
      const look = Math.sin(t * 0.9 + phase)
      const turn = Math.sign(look) * Math.min(1, Math.abs(look) * 1.6) * 0.55
      const drumming = Math.max(0, Math.sin(t * 0.7 + phase * 1.7)) > 0.8
      const tap = drumming ? Math.max(0, Math.sin(t * 16)) * 0.22 : 0
      const otherTap = drumming ? Math.max(0, Math.sin(t * 16 + Math.PI)) * 0.22 : 0
      return { ...REST, headTurn: turn, leftUp: tap, rightUp: otherTap, headUp: 0.05 }
    }
  }
}

function cheerOf(style: GestureStyle | undefined, t: number, phase: number): GesturePose {
  switch (style) {
    case 'spade': {
      // One fist straight up, held, punching; the other arm points down the road; a nod
      const rise = riseOf(t, 0.25)
      const punch = Math.max(0, Math.sin(t * 3.2)) * 0.12
      return {
        ...REST,
        rightUp: (2.75 + punch) * rise,
        rightOut: 0.15 * rise,
        leftUp: 1.45 * rise,
        leftOut: -0.25 * rise,
        leftBend: -0.25 * rise,
        headUp: (0.18 + Math.max(0, Math.sin(t * 2.4)) * 0.12) * rise,
        headTurn: 0.12 * rise,
        torsoBack: 0.08 * rise,
        twist: 0.1 * rise,
      }
    }
    case 'heart': {
      // Both arms up, the elbows out, the hands meeting over the helmet: a heart; swaying side to side
      const rise = riseOf(t, 0.4)
      const sway = Math.sin(t * 2.6 + phase)
      return {
        ...REST,
        leftUp: 2.55 * rise,
        rightUp: 2.55 * rise,
        leftOut: 0.95 * rise,
        rightOut: 0.95 * rise,
        leftBend: 1.25 * rise,
        rightBend: 1.25 * rise,
        headTilt: sway * 0.2 * rise,
        headUp: 0.2 * rise,
        torsoBack: 0.1 * rise,
        twist: sway * 0.05 * rise,
        bounce: Math.abs(sway) * 0.025 * rise,
      }
    }
    case 'diamond': {
      // The right hand up in a V, a little forward, the head tipped to it; the left on the wheel
      const rise = riseOf(t, 0.3)
      const wag = Math.sin(t * 5 + phase) * 0.08
      return {
        ...REST,
        rightUp: 2.25 * rise,
        rightOut: (0.35 + wag) * rise,
        rightBend: 0.55 * rise,
        headTilt: -0.18 * rise,
        headTurn: -0.2 * rise,
        headUp: 0.12 * rise,
        torsoBack: 0.06 * rise,
        vSign: rise,
      }
    }
    case 'club': {
      // Both arms out and flexed, forearms up, a bounce in the seat and a roar (the chin up)
      const rise = riseOf(t, 0.35)
      const pump = Math.abs(Math.sin(t * 4 + phase))
      return {
        ...REST,
        leftUp: 1.55 * rise,
        rightUp: 1.55 * rise,
        leftOut: 1.35 * rise,
        rightOut: 1.35 * rise,
        leftBend: (1.5 + pump * 0.2) * rise,
        rightBend: (1.5 + pump * 0.2) * rise,
        headUp: (0.28 + pump * 0.08) * rise,
        torsoBack: 0.12 * rise,
        bounce: pump * 0.05 * rise,
      }
    }
    default: {
      // Both arms up, shaking, a bounce in the seat
      const rise = riseOf(t, 0.3)
      const shake = Math.sin(t * 11 + phase) * 0.18
      return {
        ...REST,
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
  }
}

/**
 * The pose of `gesture` `t` seconds into it; `seed` (0 to 1) puts each driver at their own point
 * of a gesture that loops, so that a grid of them does not move as one; `style` (2026-11-23) is whose
 * it is: the wait and the win are each driver's own
 */
export function gesturePose(
  gesture: DriverGesture,
  t: number,
  seed = 0,
  style?: GestureStyle,
): GesturePose {
  const phase = seed * Math.PI * 2
  switch (gesture) {
    case 'idle':
      return idleOf(style, t, phase)
    case 'wave': {
      // The right arm up and waving, the head turned out to the crowd
      const wave = Math.sin(t * 8 + phase)
      return {
        ...REST,
        rightUp: 2.3,
        rightOut: 0.55 + wave * 0.35,
        rightBend: 0.2 + Math.max(0, wave) * 0.25,
        headTurn: -0.35,
        headUp: 0.12,
        headTilt: wave * 0.05,
        torsoBack: 0.05,
        twist: -0.06,
      }
    }
    case 'pump': {
      // Up fast, two short punches, down
      const rise = Math.min(1, t / 0.15) * Math.min(1, Math.max(0, (PUMP_SECONDS - t) / 0.25))
      const punch = Math.abs(Math.sin(t * 9)) * 0.25
      return {
        ...REST,
        rightUp: (2.2 + punch) * rise,
        rightOut: 0.4 * rise,
        headUp: 0.15 * rise,
        torsoBack: 0.08 * rise,
        twist: -0.08 * rise,
      }
    }
    case 'cheer':
      return cheerOf(style, t, phase)
    case 'podium': {
      // Arms up, waving in turn, looking round the crowd; then (2026-11-23) each in their own win
      if (style && t > 3) return cheerOf(style, t - 3, phase)
      const left = Math.sin(t * 3 + phase)
      return {
        ...REST,
        leftUp: 2.4 + left * 0.15,
        rightUp: 2.4 - left * 0.15,
        leftOut: 0.8 + left * 0.25,
        rightOut: 0.8 - left * 0.25,
        headTurn: Math.sin(t * 0.8 + phase) * 0.4,
        headUp: 0.25,
        torsoBack: 0.12,
        twist: left * 0.05,
        bounce: Math.abs(Math.sin(t * 3)) * 0.03,
      }
    }
    case 'trophy': {
      // Both hands together straight overhead, lifted in time with the crowd, looking up at it
      const rise = Math.min(1, t / 0.4)
      const lift = Math.max(0, Math.sin(t * 4 + phase)) * 0.12
      return {
        ...REST,
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
    leftBend: mix(from.leftBend, to.leftBend),
    rightBend: mix(from.rightBend, to.rightBend),
    headTurn: mix(from.headTurn, to.headTurn),
    headUp: mix(from.headUp, to.headUp),
    headTilt: mix(from.headTilt, to.headTilt),
    torsoBack: mix(from.torsoBack, to.torsoBack),
    bounce: mix(from.bounce, to.bounce),
    twist: mix(from.twist, to.twist),
    vSign: mix(from.vSign, to.vSign),
  }
}
