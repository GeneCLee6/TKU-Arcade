// 2026-11-20 (docs/ARCHITECTURE.md §4.47): what the drivers do besides drive. On the grid they look
// round and drum on the yoke; during the fly round the grid they wave; a place gained, a fist in the
// air; across the line, both arms up; on the Grand Prix's podium, arms up and waving. Stunned by a
// hit they already sway (kartModel.ts, #99). Which gesture when, and the pose it makes, pure so that
// a test can read them; kartModel.ts eases between them and puts them on the driver.
//
// 2026-11-23 (§4.86, driverRig.ts): the driver has elbows and hands now, so a pose can bend an arm
// (a flexed arm, hands meeting over the helmet), tilt the head, turn the torso and show a V; and the
// wait on the grid and the win across the line are each driver's own (`GestureStyle`).
//
// 2026-11-23 (§4.91, driverLimbs.ts): and legs and fingers. A pose moves the pelvis (the weight over
// one foot, a squat), steps, lifts a foot (a kick, a jump's tuck) and widens the stance; and says
// what each hand shows when it is off the wheel (a fist, open, pointing, a thumb up, a V). Standing in
// the race room the drivers have their own wait (`stand`: the weight from one foot to the other, now
// and then a change of feet) and get ready (`ready`: on the balls of the feet, a thumb up); their win
// jumps, steps or squats as each one does, seated (the podium) or standing.
import type { HandShape } from './driverLimbs.ts'

// 2026-11-22 (§4.73): and on the podium after a race, the winner lifts the trophy high (the podium's
// stage puts the cup in the hands)
export type DriverGesture = 'idle' | 'wave' | 'pump' | 'cheer' | 'podium' | 'trophy' | 'stand' | 'ready'

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
  /**
   * 2026-11-23 (§4.91, driverLimbs.ts's LegPose): the legs. The pelvis over the right foot (+x,
   * metres) or lower (a squat); each foot forward and lifted; the feet further apart. Standing, the
   * bounce lifts the pelvis (taken in the knees, or a jump); seated, the torso
   */
  readonly hipShift: number
  readonly hipDrop: number
  readonly leftStep: number
  readonly rightStep: number
  readonly leftLift: number
  readonly rightLift: number
  readonly stance: number
  /** What each hand shows off the wheel (driverLimbs.ts); left out, a fist seated, at ease standing */
  readonly leftHand?: HandShape
  readonly rightHand?: HandShape
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
  hipShift: 0,
  hipDrop: 0,
  leftStep: 0,
  rightStep: 0,
  leftLift: 0,
  rightLift: 0,
  stance: 0,
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
        leftHand: 'open',
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
        leftHand: 'open',
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
        // A step forward onto the left foot, the weight on it
        leftStep: 0.16 * rise,
        hipShift: -0.03 * rise,
        rightHand: 'fist',
        leftHand: 'point',
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
        // Jumping: up off the ground in time with the sway, the feet tucked under
        bounce: Math.abs(sway) * 0.1 * rise,
        leftLift: Math.abs(sway) * 0.05 * rise,
        rightLift: Math.abs(sway) * 0.05 * rise,
        leftHand: 'open',
        rightHand: 'open',
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
        // The weight on the left foot, the right heel kicked up behind
        hipShift: -0.035 * rise,
        rightLift: (0.12 + wag * 0.3) * rise,
        rightStep: -0.12 * rise,
        rightHand: 'vee',
        leftHand: 'relax',
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
        // A wide, strong stance, sinking into it with each flex
        stance: 0.12 * rise,
        hipDrop: (0.05 + pump * 0.04) * rise,
        leftHand: 'fist',
        rightHand: 'fist',
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
        bounce: Math.abs(Math.sin(t * 5.5 + phase)) * 0.08 * rise,
        leftLift: Math.abs(Math.sin(t * 5.5 + phase)) * 0.04 * rise,
        rightLift: Math.abs(Math.sin(t * 5.5 + phase)) * 0.04 * rise,
        leftHand: 'fist',
        rightHand: 'fist',
      }
    }
  }
}

/**
 * 2026-11-23 (§4.91): standing in the race room. The weight on one foot, then over to the other every
 * few seconds, the free foot a little forward and lifted as it changes; a breath; and each driver's
 * own: Spade barely moves, Hartie bobs to a beat on her heels, Dee checks the read-out on a wrist,
 * Clover stretches (an arm overhead, a heel pulled up behind). Arms hang at the sides at rest (an arm
 * hanging by the side goes out with a negative `out`)
 */
function standOf(style: GestureStyle | undefined, t: number, phase: number): GesturePose {
  const calm = style === 'spade' ? 0.6 : 1
  // Which foot the weight is on: a smooth step from one to the other, -1 the left, 1 the right
  const wave = Math.sin(t * 0.7 + phase)
  const weight = Math.tanh(wave * 4)
  const changing = (1 - weight * weight) * 0.035
  const moving = Math.cos(t * 0.7 + phase)
  const base: GesturePose = {
    ...REST,
    hipShift: weight * 0.04 * calm,
    leftStep: Math.max(0, weight) * 0.06 * calm,
    rightStep: Math.max(0, -weight) * 0.06 * calm,
    leftLift: moving > 0 ? changing : 0,
    rightLift: moving < 0 ? changing : 0,
    twist: -weight * 0.05 * calm,
    headTurn: Math.sin(t * 0.4 + phase * 1.3) * 0.3 * calm,
    headTilt: weight * 0.05,
    bounce: Math.sin(t * 1.5 + phase) * 0.004,
    leftUp: Math.sin(t * 0.7 + phase) * 0.05,
    rightUp: -Math.sin(t * 0.7 + phase) * 0.05,
    leftHand: 'relax',
    rightHand: 'relax',
  }
  switch (style) {
    case 'heart': {
      // A beat: up on the toes and down, the head bobbing, the hands swinging to it
      const beat = t * 4.2 + phase
      return {
        ...base,
        bounce: Math.abs(Math.sin(beat)) * 0.02,
        headUp: 0.04 + Math.abs(Math.sin(beat)) * 0.08,
        headTilt: Math.sin(beat / 2) * 0.14,
        leftUp: Math.sin(beat / 2) * 0.3,
        rightUp: -Math.sin(beat / 2) * 0.3,
        leftBend: 0.3,
        rightBend: 0.3,
      }
    }
    case 'diamond': {
      // Now and then the left forearm up in front, the head down to the read-out on the wrist
      const look = Math.max(0, Math.sin(t * 0.45 + phase) - 0.3) / 0.7
      return {
        ...base,
        leftUp: 0.55 * look,
        leftOut: 0.25 * look,
        leftBend: 1.55 * look,
        headUp: -0.32 * look + 0.03,
        headTurn: base.headTurn * (1 - look) + 0.25 * look,
        leftHand: look > 0.5 ? 'fist' : 'relax',
      }
    }
    case 'club': {
      // Loosening up: both arms overhead now and then; between, a heel pulled up behind
      const reach = Math.max(0, Math.sin(t * 0.5 + phase) - 0.5) / 0.5
      const heel = Math.max(0, Math.sin(t * 0.5 + phase + Math.PI) - 0.6) / 0.4
      return {
        ...base,
        leftUp: base.leftUp + 2.9 * reach,
        rightUp: base.rightUp + 2.9 * reach,
        leftOut: -0.1 * reach,
        rightOut: -0.1 * reach,
        torsoBack: 0.08 * reach,
        headUp: 0.15 * reach,
        hipShift: base.hipShift * (1 - heel) - 0.04 * heel,
        rightLift: base.rightLift + 0.3 * heel,
        rightStep: base.rightStep * (1 - heel) - 0.22 * heel,
        rightBend: 0.4 * heel,
        leftHand: reach > 0.3 ? 'open' : 'relax',
        rightHand: reach > 0.3 ? 'open' : 'relax',
      }
    }
    default:
      return base
  }
}

/**
 * 2026-11-23 (§4.91): ready, standing: on the balls of the feet, bouncing, shifting from foot to
 * foot like a fighter; a thumb up held out in front; the head nodding
 */
function readyOf(t: number, phase: number): GesturePose {
  const rise = riseOf(t, 0.35)
  const hop = t * 5 + phase
  return {
    ...REST,
    bounce: (0.012 + Math.abs(Math.sin(hop)) * 0.03) * rise,
    hipShift: Math.sin(hop / 2) * 0.02 * rise,
    leftLift: Math.max(0, Math.sin(hop / 2)) * 0.03 * rise,
    rightLift: Math.max(0, -Math.sin(hop / 2)) * 0.03 * rise,
    stance: 0.03 * rise,
    rightUp: 1.15 * rise,
    rightOut: -0.15 * rise,
    rightBend: 0.95 * rise,
    leftUp: (0.35 + Math.sin(hop) * 0.08) * rise,
    leftBend: 1.2 * rise,
    headUp: (0.06 + Math.abs(Math.sin(hop / 2)) * 0.06) * rise,
    twist: Math.sin(hop / 2) * 0.05 * rise,
    rightHand: 'thumb',
    leftHand: 'fist',
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
    case 'stand':
      return standOf(style, t, phase)
    case 'ready':
      return readyOf(t, phase)
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
        rightHand: 'open',
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
        rightHand: 'fist',
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
        // Knees bouncing in the seat in turn
        leftLift: Math.max(0, left) * 0.06,
        rightLift: Math.max(0, -left) * 0.06,
        leftHand: 'open',
        rightHand: 'open',
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
        leftLift: lift * 0.3 * rise,
        rightLift: lift * 0.3 * rise,
        // Round the cup's stem
        leftHand: 'grip',
        rightHand: 'grip',
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
    hipShift: mix(from.hipShift, to.hipShift),
    hipDrop: mix(from.hipDrop, to.hipDrop),
    leftStep: mix(from.leftStep, to.leftStep),
    rightStep: mix(from.rightStep, to.rightStep),
    leftLift: mix(from.leftLift, to.leftLift),
    rightLift: mix(from.rightLift, to.rightLift),
    stance: mix(from.stance, to.stance),
    // The fingers do not ease: the shape asked for, as soon as it is asked (the arm eases up to show it)
    ...handsOf(share > 0 ? to : from),
  }
}

/** A pose's hand shapes, as an object to spread (none where it says none) */
function handsOf(pose: GesturePose): Pick<GesturePose, 'leftHand' | 'rightHand'> {
  return {
    ...(pose.leftHand ? { leftHand: pose.leftHand } : {}),
    ...(pose.rightHand ? { rightHand: pose.rightHand } : {}),
  }
}
