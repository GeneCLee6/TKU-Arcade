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
  /**
   * 2026-11-23 (docs/KART-WORLD.md §3.3, the wins of their own): how much of the driver's prop shows,
   * 0 to 1 (driverLooks.ts's DriverProp: Dee's calculator, Clover's dumbbell); and how far a thrown
   * kiss's hearts have flown, 0 (none) to 1 (gone: `heartFlight`)
   */
  readonly prop: number
  readonly burst: number
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
  prop: 0,
  burst: 0,
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

/** A key of a showpiece: from this many seconds in, this pose (the rest at rest) */
type Key = readonly [number, Partial<GesturePose>]

const smoothShare = (share: number) => {
  const s = Math.max(0, Math.min(1, share))
  return s * s * (3 - 2 * s)
}

/**
 * The pose `t` seconds into a run of keys: eased from each key to the next, held at the last; each
 * hand's shape changes halfway between two keys
 */
export function keyed(t: number, keys: readonly Key[]): GesturePose {
  let index = 0
  while (index < keys.length - 1 && t >= keys[index + 1]![0]) index++
  const [at, pose] = keys[index]!
  const from: GesturePose = { ...REST, ...pose }
  const next = keys[index + 1]
  if (!next || t <= at) return from
  const to: GesturePose = { ...REST, ...next[1] }
  const share = smoothShare((t - at) / (next[0] - at))
  const { leftHand: _left, rightHand: _right, ...numbers } = blendPose(from, to, share)
  const hands = share < 0.5 ? from : to
  return {
    ...numbers,
    ...(hands.leftHand ? { leftHand: hands.leftHand } : {}),
    ...(hands.rightHand ? { rightHand: hands.rightHand } : {}),
  }
}

/**
 * 2026-11-23 (docs/KART-WORLD.md §3.3; owner: "a victory animation of each one's own"): how long each
 * driver's win takes to play through, s; then it holds its last pose, alive. Across the line, on the
 * podium and on Ready in the race room
 */
export const SHOWPIECE_SECONDS = 3.2

// Spade draws a sword that is not there: the right hand to the left hip, a sweep out and up, and the
// finger pointed straight at the sky, the left fist on the hip, the weight forward
const SPADE_WIN: readonly Key[] = [
  [0, {}],
  [0.35, { rightUp: 0.55, rightOut: -0.75, rightBend: 1.3, leftUp: 0.25, leftOut: 0.35, leftBend: 1.2, twist: 0.28, headTurn: 0.35, headUp: -0.15, hipDrop: 0.04, rightHand: 'fist', leftHand: 'open' }],
  [0.6, { rightUp: 0.6, rightOut: -0.8, rightBend: 1.35, leftUp: 0.25, leftOut: 0.35, leftBend: 1.2, twist: 0.34, headTurn: 0.4, headUp: -0.18, hipDrop: 0.05, rightHand: 'fist', leftHand: 'open' }],
  [0.9, { rightUp: 1.7, rightOut: 1.05, rightBend: 0.15, leftUp: 0.3, leftOut: 0.5, leftBend: 1.5, twist: -0.18, headTurn: -0.25, headUp: 0.1, leftStep: 0.08, rightHand: 'fist', leftHand: 'fist' }],
  [1.25, { rightUp: 2.95, rightOut: 0.08, leftUp: 0.35, leftOut: 0.6, leftBend: 1.65, headUp: 0.38, headTurn: 0.05, torsoBack: 0.12, leftStep: 0.16, hipShift: -0.03, rightHand: 'point', leftHand: 'fist' }],
]

// Hartie blows a kiss: a hand to the visor's chin, thrown out to the crowd (the hearts fly from it),
// then both hands in a heart over the helmet, swaying, hopping
const HEART_RAISED: Partial<GesturePose> = { leftUp: 2.55, rightUp: 2.55, leftOut: 0.95, rightOut: 0.95, leftBend: 1.25, rightBend: 1.25, headUp: 0.2, torsoBack: 0.1, leftHand: 'open', rightHand: 'open' }
const HEART_WIN: readonly Key[] = [
  [0, {}],
  [0.4, { rightUp: 1.75, rightOut: -0.2, rightBend: 2.1, headTilt: 0.18, headUp: 0.05, twist: 0.06, rightHand: 'open', leftHand: 'relax' }],
  [0.62, { rightUp: 1.8, rightOut: -0.2, rightBend: 2.15, headTilt: 0.24, headUp: 0.08, twist: 0.08, rightHand: 'open', leftHand: 'relax' }],
  [0.85, { rightUp: 2.1, rightOut: 1.0, rightBend: 0.15, twist: -0.12, torsoBack: 0.1, headUp: 0.2, headTilt: -0.1, rightStep: 0.1, leftUp: 0.4, leftOut: 0.3, leftBend: 0.6, rightHand: 'open', leftHand: 'open' }],
  [1.5, { rightUp: 2.15, rightOut: 1.05, rightBend: 0.1, twist: -0.12, torsoBack: 0.1, headUp: 0.22, headTilt: -0.12, rightStep: 0.1, leftUp: 0.45, leftOut: 0.3, leftBend: 0.6, rightHand: 'open', leftHand: 'open' }],
  [1.95, HEART_RAISED],
]
/** When Hartie's kiss is thrown, and how long its hearts fly, s */
export const KISS_AT = 0.78
export const KISS_FLIGHT = 1.7

// Dee pushes the visor up its bridge with one finger, brings a calculator up and taps it (the line was
// right), then holds it up and shows a V
const DEE_SUM: Partial<GesturePose> = { leftUp: 1.2, leftOut: 0.15, leftBend: 1.35, prop: 1, rightUp: 1.15, rightOut: 0.3, rightBend: 1.4, headUp: -0.22, headTurn: -0.1, leftHand: 'grip', rightHand: 'point' }
const DIAMOND_WIN: readonly Key[] = [
  [0, {}],
  [0.35, { rightUp: 2.0, rightOut: -0.35, rightBend: 2.25, headUp: 0.02, rightHand: 'point', leftHand: 'relax' }],
  [0.6, { rightUp: 2.15, rightOut: -0.35, rightBend: 2.1, headUp: 0.16, rightHand: 'point', leftHand: 'relax' }],
  [1.0, DEE_SUM],
  [1.9, DEE_SUM],
  [2.3, { leftUp: 1.45, leftOut: 0.15, leftBend: 1.25, prop: 1, rightUp: 2.25, rightOut: 0.35, rightBend: 0.55, vSign: 1, headUp: 0.12, headTilt: -0.18, headTurn: -0.2, hipShift: -0.035, rightLift: 0.12, rightStep: -0.12, leftHand: 'grip', rightHand: 'vee' }],
]

// Clover curls a dumbbell twice, presses it overhead, puts it away and flexes both arms, roaring
const CLOVER_CURL: Partial<GesturePose> = { rightUp: 0.35, rightOut: 0.1, rightBend: 0.2, prop: 1, stance: 0.1, hipDrop: 0.03, leftUp: 0.6, leftOut: 0.4, leftBend: 1.6, headUp: 0.05, rightHand: 'grip', leftHand: 'fist' }
const CLOVER_PRESS: Partial<GesturePose> = { rightUp: 2.9, rightOut: 0.05, prop: 1, leftUp: 1.55, leftOut: 1.35, leftBend: 1.6, stance: 0.12, hipDrop: 0.02, headUp: 0.25, torsoBack: 0.08, rightHand: 'grip', leftHand: 'fist' }
const CLOVER_WIN: readonly Key[] = [
  [0, {}],
  [0.3, CLOVER_CURL],
  [1.2, CLOVER_CURL],
  [1.5, CLOVER_PRESS],
  [1.9, CLOVER_PRESS],
  [2.25, { leftUp: 1.55, rightUp: 1.55, leftOut: 1.35, rightOut: 1.35, leftBend: 1.5, rightBend: 1.5, headUp: 0.28, torsoBack: 0.12, stance: 0.12, hipDrop: 0.05, leftHand: 'fist', rightHand: 'fist' }],
]
/** Clover's curls: from, to, how many, s */
const CURLS = [0.3, 1.2, 2] as const

/**
 * Each driver's win, `t` seconds in (2026-11-23: their showpiece, `SHOWPIECE_SECONDS` long, then held
 * and alive); left out, both arms up and shaking
 */
function cheerOf(style: GestureStyle | undefined, t: number, phase: number): GesturePose {
  switch (style) {
    case 'spade': {
      const pose = keyed(t, SPADE_WIN)
      // Held: a breath, the finger pushing at the sky
      const held = smoothShare((t - 1.25) / 0.3)
      return {
        ...pose,
        headUp: pose.headUp + Math.sin(t * 2.2) * 0.03 * held,
        rightUp: pose.rightUp + Math.max(0, Math.sin(t * 3.2)) * 0.06 * held,
      }
    }
    case 'heart': {
      const pose = keyed(t, HEART_WIN)
      // The heart over the helmet sways and hops
      const held = smoothShare((t - 1.95) / 0.3)
      const sway = Math.sin(t * 2.6 + phase)
      return {
        ...pose,
        burst: t < KISS_AT ? 0 : Math.min(1, (t - KISS_AT) / KISS_FLIGHT),
        headTilt: pose.headTilt + sway * 0.2 * held,
        twist: pose.twist + sway * 0.05 * held,
        bounce: Math.abs(sway) * 0.1 * held,
        leftLift: Math.abs(sway) * 0.05 * held,
        rightLift: Math.abs(sway) * 0.05 * held,
      }
    }
    case 'diamond': {
      const pose = keyed(t, DIAMOND_WIN)
      // Tapping the sum in, then the V wagging
      const tapping = t > 1 && t < 1.9 ? Math.max(0, Math.sin(t * 15)) * 0.35 : 0
      const wag = smoothShare((t - 2.3) / 0.3) * Math.sin(t * 5 + phase) * 0.08
      return { ...pose, rightBend: pose.rightBend + tapping, rightOut: pose.rightOut + wag }
    }
    case 'club': {
      const pose = keyed(t, CLOVER_WIN)
      const [from, to, count] = CURLS
      const curl = t > from && t < to ? (1 - Math.cos(((t - from) / (to - from)) * count * Math.PI * 2)) / 2 : 0
      const pump = smoothShare((t - 2.25) / 0.3) * Math.abs(Math.sin(t * 4 + phase))
      return {
        ...pose,
        rightUp: pose.rightUp + curl * 0.35,
        rightBend: pose.rightBend + curl * 2 + pump * 0.2,
        leftBend: pose.leftBend + pump * 0.2,
        bounce: pose.bounce + pump * 0.05,
        hipDrop: pose.hipDrop + pump * 0.04,
        headUp: pose.headUp + pump * 0.08,
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
    prop: mix(from.prop, to.prop),
    burst: mix(from.burst, to.burst),
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

/** How many hearts Hartie's kiss throws */
export const HEART_COUNT = 6

/**
 * 2026-11-23 (§3.3): where heart `index` of a thrown kiss is, `burst` (0 to 1) into its flight, in the
 * torso's frame (the driver faces -z): from in front of the visor, out and up in a fan, swelling and
 * then shrinking away; null before it is thrown and once it is gone
 */
export function heartFlight(
  burst: number,
  index: number,
): { x: number; y: number; z: number; scale: number; spin: number } | null {
  if (burst <= 0 || burst >= 1) return null
  // Each a little later than the one before, so that they leave one after another
  const own = (burst - index * 0.06) / (1 - (HEART_COUNT - 1) * 0.06)
  if (own <= 0 || own >= 1) return null
  const fan = (index / (HEART_COUNT - 1) - 0.5) * 1.6
  const ease = 1 - (1 - own) * (1 - own)
  return {
    x: Math.sin(fan) * 0.55 * ease,
    y: 0.72 + ease * 0.4 + Math.sin(own * Math.PI * 3 + index) * 0.03,
    z: -0.25 - Math.cos(fan) * 0.65 * ease,
    scale: Math.min(1, own / 0.15) * Math.min(1, (1 - own) / 0.3),
    spin: Math.sin(own * Math.PI * 2 + index) * 0.4,
  }
}
