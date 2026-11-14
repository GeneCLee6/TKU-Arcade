// The kart's step function: pure, no DOM and no clock, so that Node and the server can run the same
// code (docs/ARCHITECTURE.md §4). e8-t01 gave the spike's minimum (accelerate, steer, drift); e8-t02a
// adds the boost gauge, boosts and chained boosts. Walls and the reset (e8-t02b) are in walls.ts and
// course.ts, and run after this step. 2026-11-14 (owner): faster, a longer boost, a quicker gauge, a
// release boost (tap the throttle just after letting go of a drift) that chains, and the boost
// slide (a drift begun during a boost keeps the boost's speed and makes it last longer).
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
  /**
   * Puts the car back at the last safe place when it goes from up to down (e8-t02b). stepKart
   * ignores it: the course does it (shared/kart/course.ts), since only the course knows where.
   */
  readonly reset?: boolean
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
  /**
   * Seconds left in which a release boost still counts towards the chain; 0 when closed. It does not
   * run down during a drift, so that a long corner does not break the chain
   */
  readonly chainWindow: number
  /** Release boosts in a row while the chain window stayed open; 0 once it closes */
  readonly chain: number
  /** Whether the boost input was down at the last step, so that holding it fires once */
  readonly boostHeld: boolean
  /** Whether the throttle was down at the last step: a release boost needs it pressed afresh */
  readonly throttleHeld: boolean
  /** Seconds left, after letting go of a drift, in which a tap of the throttle fires a release boost */
  readonly releaseWindow: number
  /** Seconds of release boost left (a smaller boost than the gauge's); 0 when not */
  readonly miniSeconds: number
  /** Whether the current drift is a boost slide: begun during a boost, which it keeps going */
  readonly sliding: boolean
  /** Seconds left of a bad start (the throttle held too early on the grid): the engine bogs down */
  readonly stallSeconds: number
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
  throttleHeld: false,
  releaseWindow: 0,
  miniSeconds: 0,
  sliding: false,
  stallSeconds: 0,
}

export const NO_INPUT: KartInput = {
  throttle: false,
  brake: false,
  steer: 0,
  drift: false,
  boost: false,
  reset: false,
}

/**
 * Every number the physics reads, in one object, so that the tuning panel (e8-t03) can edit them and
 * save presets. Starting values, not a signed-off feel (AC-8.3, AC-8.8). Speeds are m/s, rates per
 * second, angles radians. All of them in a table: docs/PRD/e8-kart-single-player-core.md, in the
 * section on what J2 settled.
 */
export const KART_TUNING = {
  /**
   * Straight-line top speed (2026-11-14, owner "too slow": 30 to 40 m/s, 108 to 144 km/h). 0 to top
   * takes topSpeed / acceleration = 2 s
   */
  topSpeed: 40,
  reverseSpeed: 9,
  acceleration: 20,
  braking: 40,
  coastDrag: 5,
  /** Below this speed the car turns proportionally less, so it cannot spin on the spot */
  fullTurnSpeed: 7,
  turnRate: 2.4,
  /** How much of the turn rate is gone at top speed */
  turnLossAtTopSpeed: 0.45,
  /** How fast the slip dies outside a drift, per second */
  grip: 10,

  /** A drift starts only at this speed or more, and fills the gauge only at this speed or more */
  driftMinSpeed: 9,
  /** A drift ends below this speed even with the key held */
  driftExitSpeed: 6,
  /** How fast the car turns in a drift with the stick centred */
  driftTurnRate: 1.8,
  /** How much steering into or out of the drift adds to or takes from that */
  driftSteerRate: 0.8,
  /**
   * How fast the direction of travel swings round to the nose in a drift, per second. With the turn
   * rate it sets the steady slip angle, in radians about turn rate / align: stick centred
   * 1.8 / 3.8 = 27°, steering in 2.6 / 3.8 = 39°, steering out 1.0 / 3.8 = 15°.
   */
  driftAlign: 3.8,
  /** A safety cap a steady drift stays under (the steady angle above tops out at about 39°) */
  driftMaxSlip: (42 * Math.PI) / 180,
  /** A drift costs speed: above this it is pulled down at driftDrag */
  driftTopSpeed: 35,
  driftDrag: 9,

  /**
   * Gauge points per second of drifting (2026-11-14, owner "fills too slowly": 40 to 65), plus a
   * bonus for each drift let go: two or three good drifts fill it
   */
  gaugeFillRate: 65,
  /** Gauge points for letting go of a drift that lasted at least chainMinDrift */
  gaugeDriftBonus: 12,
  maxStoredBoosts: 2,
  /** How long a boost from the gauge lasts (2026-11-14, owner "too short": 1.2 to 2 s) */
  boostDuration: 2,
  /** A boost raises the top speed (and the drift top speed) by this factor */
  boostTopSpeedFactor: 1.3,
  /** How hard a boost pushes, on top of the throttle, whether or not the throttle is held */
  boostAcceleration: 36,
  /** Above the top speed once a boost ends, the car slows by this much per second */
  overSpeedDrag: 7,

  // The start boost (2026-11-14), worked by the time trial's countdown (timeTrial.ts)
  /** Pressing the throttle this long before GO, or less, and holding it gives a start boost */
  startWindow: 0.35,
  /** How long the start boost lasts, at a full boost's strength */
  startBoostDuration: 1.2,
  /** Holding the throttle from before the window bogs the engine down for this long after GO */
  startStallSeconds: 0.8,

  // Release boosts and chains (2026-11-14)
  /** After letting go of a drift, a fresh press of the throttle within this many seconds fires one */
  releaseWindow: 0.3,
  /** How long a release boost lasts */
  chainDuration: 0.6,
  /** A release boost raises the top speed by this factor (less than a full boost) */
  miniTopSpeedFactor: 1.15,
  /** How hard a release boost pushes, on top of the throttle */
  miniAcceleration: 26,
  /** How long after a boost ends the chain window stays open */
  chainGrace: 0.5,
  /** The shortest drift that earns a release boost and the gauge bonus, so a tap is not enough */
  chainMinDrift: 0.2,

  // The boost slide (2026-11-14): a drift begun during a boost
  /** How fast a boost runs down during a boost slide: 0.5 makes it last twice as long */
  slideBoostDrain: 0.5,
  /** A boost slide keeps this share of the boosted top speed (a plain drift drops to driftTopSpeed) */
  slideSpeedKeep: 0.97,

  // Walls (e8-t02b, shared/kart/walls.ts). A hit takes away the speed going into the wall and keeps
  // the speed along it, so the car slides; the more head-on the hit, the more of the rest goes too.
  /** The share of the speed into the wall that comes back out of it, so a head-on hit bounces */
  wallBounce: 0.2,
  /** The share of the speed along the wall lost by a hit, times how head-on it was (0 to 1) */
  wallImpactLoss: 0.5,
  /** While touching a wall the car slows by this much per second: scraping along it costs speed */
  wallScrapeDrag: 6,
}

export type KartTuning = { readonly [K in keyof typeof KART_TUNING]: number }

/** The rule options a room will choose (the spike page has switches for them) */
export interface KartRules {
  /** Fire a boost the moment the gauge fills, instead of waiting for the boost input */
  readonly autoBoost: boolean
  /** Release boosts (a tap of the throttle just after a drift) and their chains */
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
function drive(
  forward: number,
  input: KartInput,
  push: number,
  stalled: boolean,
  tuning: KartTuning,
): number {
  const { braking, coastDrag, reverseSpeed } = tuning
  // A bad start: the engine bogs down, pulling at a fraction of its strength
  const acceleration = tuning.acceleration * (stalled ? STALL_SHARE : 1)
  const dt = STEP_SECONDS
  if (input.brake) {
    return forward > 0
      ? Math.max(0, forward - braking * dt)
      : Math.max(-reverseSpeed, forward - acceleration * dt)
  }
  // A boost pushes forwards from a standstill or from reversing alike, throttle or not
  if (push > 0) return forward + (push + (input.throttle ? acceleration : 0)) * dt
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

/** The share of the engine's pull left while stalled after a bad start */
const STALL_SHARE = 0.15

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
  let { gauge, storedBoosts, boostSeconds, chainWindow, chain, releaseWindow, miniSeconds } = state
  const fire =
    (rules.autoBoost && storedBoosts > 0) || (input.boost && !state.boostHeld && storedBoosts > 0)
  if (fire) {
    storedBoosts--
    boostSeconds = tuning.boostDuration
    chainWindow = Math.max(chainWindow, tuning.boostDuration + tuning.chainGrace)
  }

  // A release boost: the throttle pressed afresh just after letting go of a drift. Inside the chain
  // window it adds a link to the chain; outside it starts a new one
  const tapped = input.throttle && !state.throttleHeld
  if (rules.chainBoosts && tapped && releaseWindow > 0) {
    releaseWindow = 0
    miniSeconds = tuning.chainDuration
    chain = chainWindow > 0 ? chain + 1 : 1
    chainWindow = Math.max(chainWindow, tuning.chainDuration + tuning.chainGrace)
  }

  const full = boostSeconds > 0
  const boosting = full || miniSeconds > 0
  const push = full ? tuning.boostAcceleration : miniSeconds > 0 ? tuning.miniAcceleration : 0
  const factor = full ? tuning.boostTopSpeedFactor : miniSeconds > 0 ? tuning.miniTopSpeedFactor : 1

  const forward = drive(
    forwardOf(state.vx, state.vz, state.heading),
    input,
    push,
    state.stallSeconds > 0,
    tuning,
  )
  const side = sideOf(state.vx, state.vz, state.heading)

  let driftDirection = state.driftDirection
  if (!input.drift || forward < tuning.driftExitSpeed) driftDirection = 0
  else if (driftDirection === 0 && steer !== 0 && forward >= tuning.driftMinSpeed) {
    driftDirection = steer > 0 ? 1 : -1
  }
  const drifting = driftDirection !== 0
  const driftSeconds = drifting ? state.driftSeconds + dt : 0
  // A drift begun during a boost is a boost slide for as long as the boost lasts
  const entered = drifting && state.driftDirection === 0
  const sliding = drifting && boosting && (entered || state.sliding)

  // Letting go of a long enough drift (the key, not slowing down) opens the release window and
  // tops up the gauge
  const released = state.drifting && !input.drift
  const earned = released && state.driftSeconds >= tuning.chainMinDrift
  if (earned) {
    releaseWindow = tuning.releaseWindow
    if (storedBoosts < tuning.maxStoredBoosts) gauge += tuning.gaugeDriftBonus
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
  const limit = sliding
    ? tuning.topSpeed * factor * tuning.slideSpeedKeep
    : (drifting ? tuning.driftTopSpeed : tuning.topSpeed) * factor
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
  if (drifting && newForward >= tuning.driftMinSpeed && storedBoosts < tuning.maxStoredBoosts) {
    gauge += tuning.gaugeFillRate * dt
  }
  if (gauge >= GAUGE_FULL && storedBoosts < tuning.maxStoredBoosts) {
    storedBoosts++
    gauge = storedBoosts < tuning.maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
  }

  // A boost slide makes the boost last longer
  const drain = sliding ? tuning.slideBoostDrain * dt : dt
  if (boostSeconds > 0) boostSeconds = Math.max(0, boostSeconds - drain)
  if (miniSeconds > 0) miniSeconds = Math.max(0, miniSeconds - drain)
  if (releaseWindow > 0 && !earned) releaseWindow = Math.max(0, releaseWindow - dt)
  // The chain holds through a drift; once its window closes the count starts over
  if (chainWindow > 0 && !drifting) chainWindow = Math.max(0, chainWindow - dt)
  if (chainWindow === 0) chain = 0

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
    throttleHeld: input.throttle,
    releaseWindow,
    miniSeconds,
    sliding,
    stallSeconds: Math.max(0, state.stallSeconds - dt),
  }
}

/** Whether any boost (from the gauge, the start or a release) is running */
export const kartBoosting = (state: KartState): boolean =>
  state.boostSeconds > 0 || state.miniSeconds > 0

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
