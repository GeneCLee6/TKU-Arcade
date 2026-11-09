// The kart's step function: pure, no DOM and no clock, so that Node and the server can run the same
// code (docs/ARCHITECTURE.md §4). e8-t01 gave the spike's minimum (accelerate, steer, drift); e8-t02a
// adds the boost gauge, boosts and chained boosts. Walls and respawn are e8-t02b and build on this.
//
// Units are metres, seconds and radians. Seen from above, heading 0 faces -z and heading grows
// clockwise, so a positive steer turns right.

/** The simulation's one fixed step: 60 Hz, whatever the display does */
export const STEP_SECONDS = 1 / 60

/** The gauge's full value: the epic counts it 0 to 100 */
export const GAUGE_FULL = 100

export interface KartInput {
  readonly throttle: boolean
  readonly brake: boolean
  /** -1 is full left, 1 is full right; a stick gives anything in between */
  readonly steer: number
  readonly drift: boolean
  /** Fires a stored boost when it goes from up to down (held down, it fires only once) */
  readonly boost: boolean
}

export interface KartState {
  readonly x: number
  readonly z: number
  /** Where the car's nose points, in (-PI, PI] */
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly drifting: boolean
  /** Which way the drift was entered: -1 left, 1 right, 0 when not drifting */
  readonly driftDirection: -1 | 0 | 1
  /** How long the current drift has lasted, in seconds; 0 when not drifting */
  readonly driftSeconds: number
  /** 0 to GAUGE_FULL. Fills while drifting; when full it turns into a stored boost and starts over */
  readonly gauge: number
  /** Boosts waiting to be fired, up to `maxStoredBoosts` */
  readonly storedBoosts: number
  /** Seconds of boost left; 0 when not boosting */
  readonly boostSeconds: number
  /** Seconds left in which letting go of a drift chains another boost; 0 when closed */
  readonly chainWindow: number
  /** Chained boosts in a row since the last boost fired from the gauge */
  readonly chain: number
  /** Whether the boost input was down at the last step, so that holding it fires once */
  readonly boostHeld: boolean
}

export const INITIAL_KART: KartState = {
  x: 0,
  z: 0,
  heading: 0,
  vx: 0,
  vz: 0,
  drifting: false,
  driftDirection: 0,
  driftSeconds: 0,
  gauge: 0,
  storedBoosts: 0,
  boostSeconds: 0,
  chainWindow: 0,
  chain: 0,
  boostHeld: false,
}

export const NO_INPUT: KartInput = {
  throttle: false,
  brake: false,
  steer: 0,
  drift: false,
  boost: false,
}

/**
 * Every number the physics reads, in one object, so that the tuning panel (e8-t03) can edit them and
 * save presets. Starting values, not a signed-off feel (AC-8.3, AC-8.8). Speeds are m/s, rates per
 * second, angles radians. All of them in a table: docs/PRD/e8-kart-single-player-core.md, in the
 * section on what J2 settled.
 */
export const KART_TUNING = {
  /** Straight-line top speed. 0 to top takes topSpeed / acceleration = 2.14 s */
  topSpeed: 30,
  reverseSpeed: 8,
  acceleration: 14,
  braking: 30,
  coastDrag: 4,
  /** Below this speed the car turns proportionally less, so it cannot spin on the spot */
  fullTurnSpeed: 6,
  turnRate: 2.2,
  /** How much of the turn rate is gone at top speed */
  turnLossAtTopSpeed: 0.45,
  /** How fast the slip dies outside a drift, per second */
  grip: 10,

  /** A drift starts only at this speed or more, and fills the gauge only at this speed or more */
  driftMinSpeed: 8,
  /** A drift ends below this speed even with the key held */
  driftExitSpeed: 5,
  /** How fast the car turns in a drift with the stick centred */
  driftTurnRate: 1.6,
  /** How much steering into or out of the drift adds to or takes from that */
  driftSteerRate: 0.7,
  /**
   * How fast the direction of travel swings round to the nose in a drift, per second. With the turn
   * rate it sets the steady slip angle, in radians about turn rate / align: stick centred
   * 1.6 / 3.5 = 26°, steering in 2.3 / 3.5 = 38°, steering out 0.9 / 3.5 = 15°.
   */
  driftAlign: 3.5,
  /** A safety cap a steady drift stays under (the steady angle above tops out at 38°) */
  driftMaxSlip: (40 * Math.PI) / 180,
  /** A drift costs speed: above this it is pulled down at driftDrag */
  driftTopSpeed: 26.5,
  driftDrag: 8,

  /** Gauge points per second of drifting: 0 to full in 100 / 40 = 2.5 s */
  gaugeFillRate: 40,
  maxStoredBoosts: 2,
  /** How long a boost from the gauge lasts */
  boostDuration: 1.2,
  /** A boost raises the top speed (and the drift top speed) by this factor */
  boostTopSpeedFactor: 1.3,
  /** How hard a boost pushes, on top of the throttle, whether or not the throttle is held */
  boostAcceleration: 30,
  /** Above the top speed once a boost ends, the car slows by this much per second */
  overSpeedDrag: 6,
  /** How long a chained boost lasts */
  chainDuration: 0.8,
  /** How long after a boost ends a released drift still chains */
  chainGrace: 0.3,
  /** The shortest drift that chains, so that a tap of the key is not enough */
  chainMinDrift: 0.2,
}

export type KartTuning = { readonly [K in keyof typeof KART_TUNING]: number }

/** The rule options a room will choose (the spike page has switches for them) */
export interface KartRules {
  /** Fire a boost the moment the gauge fills, instead of waiting for the boost input */
  readonly autoBoost: boolean
  /** Letting go of a drift during a boost, or just after one, fires another */
  readonly chainBoosts: boolean
}

/** The owner's choice, 2026-11-09: boosts are fired with a key, and chained boosts are on */
export const DEFAULT_RULES: KartRules = { autoBoost: false, chainBoosts: true }

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

const wrapAngle = (angle: number): number => {
  const wrapped = angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
  return wrapped === -Math.PI ? Math.PI : wrapped
}

const forwardOf = (vx: number, vz: number, heading: number): number =>
  vx * Math.sin(heading) - vz * Math.cos(heading)

const sideOf = (vx: number, vz: number, heading: number): number =>
  vx * Math.cos(heading) + vz * Math.sin(heading)

/** The forward speed after the pedals and any boost; the speed limits come after the turn */
function drive(forward: number, input: KartInput, boosting: boolean, tuning: KartTuning): number {
  const { acceleration, braking, boostAcceleration, coastDrag, reverseSpeed } = tuning
  const dt = STEP_SECONDS
  if (input.brake) {
    return forward > 0
      ? Math.max(0, forward - braking * dt)
      : Math.max(-reverseSpeed, forward - acceleration * dt)
  }
  // A boost pushes forwards from a standstill or from reversing alike, throttle or not
  if (boosting) return forward + (boostAcceleration + (input.throttle ? acceleration : 0)) * dt
  if (input.throttle) {
    return forward < 0 ? Math.min(0, forward + braking * dt) : forward + acceleration * dt
  }
  return forward > 0 ? Math.max(0, forward - coastDrag * dt) : Math.min(0, forward + coastDrag * dt)
}

function yawRate(
  forward: number,
  steer: number,
  driftDirection: number,
  tuning: KartTuning,
): number {
  const { driftSteerRate, driftTurnRate, fullTurnSpeed, topSpeed, turnLossAtTopSpeed, turnRate } =
    tuning
  // Steering the drift's way tightens it, the other way widens it; it never turns the car back
  if (driftDirection !== 0) return driftDirection * driftTurnRate + steer * driftSteerRate
  const pace = Math.abs(forward)
  const loss = turnLossAtTopSpeed * Math.min(1, pace / topSpeed)
  const authority = Math.min(1, pace / fullTurnSpeed) * (1 - loss)
  return Math.sign(forward) * steer * turnRate * authority
}

/** Swings the velocity round towards the nose by `fraction` of the slip, keeping its speed */
function align(forward: number, side: number, fraction: number, maxSlip: number) {
  const speed = Math.hypot(forward, side)
  const slip = clamp(Math.atan2(side, forward) * fraction, -maxSlip, maxSlip)
  return { forward: speed * Math.cos(slip), side: speed * Math.sin(slip) }
}

/**
 * One step of 1/60 s. Pure: the same state, input, tuning and rules always give the same result.
 */
export function stepKart(
  state: KartState,
  input: KartInput,
  tuning: KartTuning = KART_TUNING,
  rules: KartRules = DEFAULT_RULES,
): KartState {
  const dt = STEP_SECONDS
  const steer = clamp(input.steer, -1, 1)

  // Boosts first, so that a boost fired now already pushes in this step
  let { gauge, storedBoosts, boostSeconds, chainWindow, chain } = state
  const fire =
    (rules.autoBoost && storedBoosts > 0) || (input.boost && !state.boostHeld && storedBoosts > 0)
  if (fire) {
    storedBoosts--
    boostSeconds = tuning.boostDuration
    chainWindow = tuning.boostDuration + tuning.chainGrace
    chain = 0
  }
  const boosting = boostSeconds > 0

  const forward = drive(forwardOf(state.vx, state.vz, state.heading), input, boosting, tuning)
  const side = sideOf(state.vx, state.vz, state.heading)

  let driftDirection = state.driftDirection
  if (!input.drift || forward < tuning.driftExitSpeed) driftDirection = 0
  else if (driftDirection === 0 && steer !== 0 && forward >= tuning.driftMinSpeed) {
    driftDirection = steer > 0 ? 1 : -1
  }
  const drifting = driftDirection !== 0
  const driftSeconds = drifting ? state.driftSeconds + dt : 0

  // Letting go of a long enough drift while the window is open chains another boost
  const released = state.drifting && !input.drift
  if (
    rules.chainBoosts &&
    released &&
    state.driftSeconds >= tuning.chainMinDrift &&
    state.chainWindow > 0
  ) {
    boostSeconds = Math.max(boostSeconds, tuning.chainDuration)
    chainWindow = tuning.chainDuration + tuning.chainGrace
    chain++
  }

  // Back to world axes from the old nose, then read against the new nose. The car turning while the
  // velocity stays put is what opens the slip angle.
  const worldVx = forward * Math.sin(state.heading) + side * Math.cos(state.heading)
  const worldVz = -forward * Math.cos(state.heading) + side * Math.sin(state.heading)
  const heading = wrapAngle(state.heading + yawRate(forward, steer, driftDirection, tuning) * dt)

  let newForward = forwardOf(worldVx, worldVz, heading)
  let newSide = sideOf(worldVx, worldVz, heading)

  if (drifting) {
    // The slip settles where the turn opens it as fast as the alignment closes it, under the cap
    ;({ forward: newForward, side: newSide } = align(
      newForward,
      newSide,
      Math.exp(-tuning.driftAlign * dt),
      tuning.driftMaxSlip,
    ))
  } else if (newForward > 0) {
    // Going forwards the grip swings the velocity onto the nose, so leaving a drift keeps its speed
    ;({ forward: newForward, side: newSide } = align(
      newForward,
      newSide,
      Math.exp(-tuning.grip * dt),
      Math.PI / 2,
    ))
  } else {
    // Reversing or stopped: sideways speed simply dies
    newSide *= Math.exp(-tuning.grip * dt)
  }

  // One limit on the whole speed, sideways included, or a slide would add to the top speed. Above
  // it, from a boost that ended or a drift that began, the car eases down instead of stopping dead.
  const limit =
    (drifting ? tuning.driftTopSpeed : tuning.topSpeed) *
    (boosting ? tuning.boostTopSpeedFactor : 1)
  const speed = Math.hypot(newForward, newSide)
  if (speed > limit) {
    const easing = drifting ? tuning.driftDrag : tuning.overSpeedDrag
    const allowed = Math.max(limit, Math.hypot(state.vx, state.vz) - easing * dt)
    if (speed > allowed) {
      newForward *= allowed / speed
      newSide *= allowed / speed
    }
  }

  // The gauge fills only in a real drift, at speed; a full gauge becomes a stored boost
  if (drifting && newForward >= tuning.driftMinSpeed) {
    if (storedBoosts < tuning.maxStoredBoosts) {
      gauge += tuning.gaugeFillRate * dt
      if (gauge >= GAUGE_FULL) {
        storedBoosts++
        gauge = storedBoosts < tuning.maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
      }
    }
  }

  if (boostSeconds > 0) boostSeconds = Math.max(0, boostSeconds - dt)
  if (chainWindow > 0) chainWindow = Math.max(0, chainWindow - dt)

  const vx = newForward * Math.sin(heading) + newSide * Math.cos(heading)
  const vz = -newForward * Math.cos(heading) + newSide * Math.sin(heading)
  return {
    x: state.x + vx * dt,
    z: state.z + vz * dt,
    heading,
    vx,
    vz,
    drifting,
    driftDirection,
    driftSeconds,
    gauge,
    storedBoosts,
    boostSeconds,
    chainWindow,
    chain,
    boostHeld: input.boost,
  }
}

export const kartSpeed = (state: KartState): number => Math.hypot(state.vx, state.vz)

/** The angle between the nose and the direction of travel, positive when sliding to the right */
export function kartSlip(state: KartState): number {
  if (kartSpeed(state) < 0.5) return 0
  return Math.atan2(
    sideOf(state.vx, state.vz, state.heading),
    forwardOf(state.vx, state.vz, state.heading),
  )
}

/** Where to draw the car between two steps, so that a fast display stays smooth */
export function poseBetween(
  from: KartState,
  to: KartState,
  alpha: number,
): { x: number; z: number; heading: number } {
  return {
    x: from.x + (to.x - from.x) * alpha,
    z: from.z + (to.z - from.z) * alpha,
    heading: wrapAngle(from.heading + wrapAngle(to.heading - from.heading) * alpha),
  }
}
