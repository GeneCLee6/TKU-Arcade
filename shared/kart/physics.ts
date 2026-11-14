// The kart's step function: pure, no DOM and no clock, so that Node and the server can run the same
// code (docs/ARCHITECTURE.md §4). e8-t01 gave the spike's minimum (accelerate, steer, drift); e8-t02a
// adds the boost gauge, boosts and chained boosts. Walls and the reset (e8-t02b) are in walls.ts and
// course.ts, and run after this step. 2026-11-14 (owner): faster, a longer boost, a quicker gauge, a
// release boost (tap the throttle just after letting go of a drift) that chains, and the boost
// slide (a drift begun during a boost keeps the boost's speed and makes it last longer). Then
// (owner, again "too slow, the skill ceiling is too low"): faster still, a longer boost, boosts that
// stack, the flick (a tapped drift that snaps the nose round), drifts whose depth and length trade
// gauge for speed, and the counter catch (counter-steer out of a drift to straighten up at once).
// Then (owner: "the drift grips too well, and the gap between an expert and a novice is too
// small"): the drift is a real slide. The rear lets go (`traction` 0), the nose swings in and the
// car's momentum carries on the old way, coming round only slowly (`driftAlign`); sliding sideways
// scrubs speed off (`driftScrub`), the more the deeper and the longer; let go and the grip comes
// back over `driftRecovery`. The tapped drift no longer snaps the nose round: tapped just after a
// release boost it earns a second one (the double), and every link of a chain goes a little faster.
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
  /** Seconds left of a stacked boost (a charge fired while a boost ran): the top speed goes higher */
  readonly stackSeconds: number
  /** Seconds left of a counter catch: extra grip that straightens the car up out of a drift */
  readonly catchSeconds: number
  /**
   * How much of the tyres' grip the car has: 1 gripping, 0 for as long as a drift is held, then back
   * to 1 over `driftRecovery` seconds once it is let go (the car is still sliding until then)
   */
  readonly traction: number
  /** Seconds left, after a release boost, in which a tapped drift earns a second one (the double) */
  readonly doubleWindow: number
  /** Whether the current drift began inside that window: however short, letting go opens a release window */
  readonly doubleDrift: boolean
  /** Whether the open release window came from such a tap: the boost it fires is a double */
  readonly doubleArmed: boolean
  /** Counts double boosts, so that the HUD can call them out */
  readonly doubles: number
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
  stackSeconds: 0,
  catchSeconds: 0,
  traction: 1,
  doubleWindow: 0,
  doubleDrift: false,
  doubleArmed: false,
  doubles: 0,
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
   * Straight-line top speed (2026-11-14, owner "too slow": 30 to 40, to 50, then 56 m/s). The HUD
   * reads it through SPEEDOMETER_SCALE: 302 km/h. 0 to top takes topSpeed / acceleration = 2.15 s
   */
  topSpeed: 60,
  reverseSpeed: 10,
  acceleration: 28,
  braking: 56,
  coastDrag: 6,
  /** Below this speed the car turns proportionally less, so it cannot spin on the spot */
  fullTurnSpeed: 8,
  turnRate: 2.5,
  /**
   * How much of the turn rate is gone at top speed: grip alone turns no tighter than about
   * 56 / (2.5 * 0.5) = 45 m flat out, so the tighter corners want a drift
   */
  turnLossAtTopSpeed: 0.5,
  /** How fast the slip dies outside a drift, per second */
  grip: 10,

  /** A drift starts only at this speed or more, and fills the gauge only at this speed or more */
  driftMinSpeed: 10,
  /** A drift ends below this speed even with the key held */
  driftExitSpeed: 7,
  /** How fast the nose swings round in a drift with the stick centred */
  driftTurnRate: 1.9,
  /** How much steering into or out of the drift adds to or takes from that */
  driftSteerRate: 0.9,
  /**
   * The grip left in a drift: how fast the direction of travel comes round to the nose, per second.
   * Low, so the car's momentum carries on the old way while the nose points into the corner. With
   * the turn rate it sets the steady slip angle, in radians about turn rate / align: stick centred
   * 1.7 / 2.2 = 44 degrees, steering out 0.9 / 2.2 = 23 degrees, steering in up to the cap.
   */
  driftAlign: 2.2,
  /** The widest the slide gets: the nose swings no further round than this from the way the car goes */
  driftMaxSlip: (58 * Math.PI) / 180,
  /**
   * Sliding sideways scrubs speed off: this much a second at the top speed, sliding fully sideways;
   * in proportion to the sine of the slip angle and to the speed. A deep drift held long loses most
   * of its speed, a shallow one or a tap next to none
   */
  driftScrub: 64,
  /** How long the grip takes to come back once the drift is let go: the car slides on until then */
  driftRecovery: 0.4,
  /** The slip angle at which the gauge fills at gaugeFillRate: deeper fills faster (up to 1.5 times) */
  driftGaugeSlip: (35 * Math.PI) / 180,

  /** Counter-steering as a drift is let go brings the grip back this many times faster ... */
  catchGrip: 3,
  /** ... for this long, so the car straightens up at once */
  catchSeconds: 0.35,

  /**
   * Gauge points per second of drifting at driftGaugeSlip, plus a bonus for each drift let go: two
   * or three good drifts fill it
   */
  gaugeFillRate: 60,
  /** Gauge points for letting go of a drift that lasted at least chainMinDrift */
  gaugeDriftBonus: 10,
  /**
   * The share of the usual fill (and the drift bonus) the gauge gets while a full boost runs, so
   * that charges alone cannot keep a boost going for ever: the gaps are the release boosts' to fill
   */
  boostGaugeShare: 0.25,
  /** Charges kept in stock, fired with the boost input */
  maxStoredBoosts: 2,
  /** How long a boost from the gauge lasts (owner "too short": 1.2 to 2, then 3.25 s) */
  boostDuration: 3.25,
  /** A boost raises the top speed by this factor: 438 km/h on the HUD */
  boostTopSpeedFactor: 1.45,
  /** How hard a boost pushes, on top of the throttle, whether or not the throttle is held */
  boostAcceleration: 60,
  /** Above the top speed once a boost ends, the car slows by this much per second */
  overSpeedDrag: 9,
  /**
   * A charge fired while a boost runs stacks: it adds its length (up to boostMaxSeconds) and for
   * this long the top speed rises to boostStackFactor (484 km/h on the HUD)
   */
  boostStackSeconds: 1.2,
  boostStackFactor: 1.6,
  /** A boost never has more than this many seconds left, however it is stacked */
  boostMaxSeconds: 6,

  // The start boost (2026-11-14), worked by the time trial's countdown (timeTrial.ts)
  /** Pressing the throttle this long before GO, or less, and holding it gives a start boost */
  startWindow: 0.35,
  /** How long the start boost lasts, at a full boost's strength */
  startBoostDuration: 1.8,
  /** Holding the throttle from before the window bogs the engine down for this long after GO */
  startStallSeconds: 0.8,

  // Release boosts and chains (2026-11-14)
  /** After letting go of a drift, a fresh press of the throttle within this many seconds fires one */
  releaseWindow: 0.3,
  /** How long a release boost lasts */
  chainDuration: 0.7,
  /** A release boost raises the top speed by this factor (less than a full boost) */
  miniTopSpeedFactor: 1.2,
  /** How hard a release boost pushes, on top of the throttle: a short, sharp burst */
  miniAcceleration: 64,
  /** How long after a boost ends the chain window stays open */
  chainGrace: 0.6,
  /** The shortest drift that earns a release boost and the gauge bonus, so a tap is not enough */
  chainMinDrift: 0.25,
  /** Each release boost in a chain after the first lifts the release boost's top speed this much more ... */
  chainSpeedStep: 0.03,
  /** ... for up to this many links */
  chainSpeedLinks: 4,
  /**
   * The double: for this long after a release boost, a drift begun, however short a tap, opens the
   * release window again when let go, and that second release boost adds its length to the first
   */
  doubleWindow: 0.5,

  // The boost slide (2026-11-14): a drift begun during a boost
  /** How fast a boost runs down during a boost slide: 0.5 makes it last twice as long */
  slideBoostDrain: 0.5,
  /** The share of a drift's scrub a boost slide still pays: the boost carries the speed through */
  slideScrub: 0.3,

  /** How long a boost pad on the road boosts, at a full boost's strength (course.ts) */
  padBoostSeconds: 1.2,

  // Walls (e8-t02b, shared/kart/walls.ts). A hit takes away the speed going into the wall and keeps
  // the speed along it, so the car slides; the more head-on the hit, the more of the rest goes too.
  /** The share of the speed into the wall that comes back out of it, so a head-on hit bounces */
  wallBounce: 0.2,
  /** The share of the speed along the wall lost by a hit, times how head-on it was (0 to 1) */
  wallImpactLoss: 0.6,
  /** While touching a wall the car slows by this much per second: scraping along it costs speed */
  wallScrapeDrag: 10,
  /** A hit at least this fast into a wall breaks the chain and ends a boost slide (course.ts) */
  wallBreakSpeed: 4,
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
/** Below this slip angle (radians) there is no slide left to catch */
const CATCH_MIN_SLIP = 0.08
/** The gauge fills at most this many times its rate, however deep the slide */
const GAUGE_DEPTH_MAX = 1.5

/** Swings the velocity round towards the nose, leaving `fraction` of the slip, keeping its speed */
function align(forward: number, side: number, fraction: number) {
  const speed = Math.hypot(forward, side)
  const slip = Math.atan2(side, forward) * fraction
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
  let { doubleWindow, doubleArmed, doubles } = state
  const fire =
    (rules.autoBoost && storedBoosts > 0) || (input.boost && !state.boostHeld && storedBoosts > 0)
  let stackSeconds = state.stackSeconds
  if (fire) {
    storedBoosts--
    // Fired while a boost runs, a charge stacks: longer, and higher for a while
    if (boostSeconds > 0) {
      boostSeconds = Math.min(tuning.boostMaxSeconds, boostSeconds + tuning.boostDuration)
      stackSeconds = tuning.boostStackSeconds
    } else boostSeconds = tuning.boostDuration
    chainWindow = Math.max(chainWindow, boostSeconds + tuning.chainGrace)
  }

  // A release boost: the throttle pressed afresh just after letting go of a drift. Inside the chain
  // window it adds a link to the chain; outside it starts a new one
  const tapped = input.throttle && !state.throttleHeld
  if (rules.chainBoosts && tapped && releaseWindow > 0) {
    releaseWindow = 0
    chain = chainWindow > 0 ? chain + 1 : 1
    if (doubleArmed) {
      // The double: a second release boost on top of the first, which it makes longer
      miniSeconds += tuning.chainDuration
      doubles++
      doubleWindow = 0
    } else {
      miniSeconds = tuning.chainDuration
      doubleWindow = tuning.doubleWindow
    }
    doubleArmed = false
    chainWindow = Math.max(chainWindow, miniSeconds + tuning.chainGrace)
  }

  const full = boostSeconds > 0
  const stacked = full && stackSeconds > 0
  const boosting = full || miniSeconds > 0
  const push = full ? tuning.boostAcceleration : miniSeconds > 0 ? tuning.miniAcceleration : 0
  // Every link of a chain after the first makes the release boost a little faster
  const links = clamp(chain - 1, 0, tuning.chainSpeedLinks)
  const factor = stacked
    ? tuning.boostStackFactor
    : full
      ? tuning.boostTopSpeedFactor
      : miniSeconds > 0
        ? tuning.miniTopSpeedFactor + tuning.chainSpeedStep * links
        : 1

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
  // A drift begun just after a release boost may be the tap that earns the double
  const doubleDrift = drifting && (entered ? doubleWindow > 0 : state.doubleDrift)
  if (entered) doubleWindow = 0

  // Letting go of a long enough drift (the key, not slowing down) opens the release window and
  // tops up the gauge; so does letting go of the double's tap, however short (two steps at least:
  // a key that flickers for one step is not a tap)
  const released = state.drifting && !input.drift
  const earned = released && state.driftSeconds >= tuning.chainMinDrift
  const doubled = released && !earned && state.doubleDrift && state.driftSeconds > dt * 1.5
  if (earned || doubled) {
    releaseWindow = tuning.releaseWindow
    doubleArmed = doubled
  }
  if (earned && storedBoosts < tuning.maxStoredBoosts) {
    gauge += tuning.gaugeDriftBonus * (full ? tuning.boostGaugeShare : 1)
  }

  // Back to world axes from the old nose, then read against the new nose. The car turning while the
  // velocity stays put is what opens the slip angle.
  const worldVx = forward * Math.sin(state.heading) + side * Math.cos(state.heading)
  const worldVz = -forward * Math.cos(state.heading) + side * Math.sin(state.heading)
  let heading = wrapAngle(state.heading + yawRate(forward, steer, driftDirection, tuning) * dt)

  let newForward = forwardOf(worldVx, worldVz, heading)
  let newSide = sideOf(worldVx, worldVz, heading)

  // Counter-steering against the slide as the drift is let go, or while the grip is still coming
  // back: the grip comes back faster for a moment and the car straightens up
  const slipBefore = Math.atan2(newSide, newForward)
  let catchSeconds = Math.max(0, state.catchSeconds - dt)
  const sliddenOut = !drifting && state.traction < 1 && Math.abs(slipBefore) > CATCH_MIN_SLIP
  const countered = released
    ? steer * state.driftDirection < -0.3
    : sliddenOut && steer * Math.sign(slipBefore) > 0.3
  if (countered && state.catchSeconds <= 0) catchSeconds = tuning.catchSeconds
  // The rear lets go the moment a drift begins, and grips again only some time after it is let go
  const traction = drifting
    ? 0
    : Math.min(
        1,
        state.traction +
          (dt / Math.max(dt, tuning.driftRecovery)) * (catchSeconds > 0 ? tuning.catchGrip : 1),
      )

  if (drifting && newForward > 0) {
    // The nose swings no further round than the cap: past it the car would spin
    const over = slipBefore - clamp(slipBefore, -tuning.driftMaxSlip, tuning.driftMaxSlip)
    if (over !== 0) {
      heading = wrapAngle(heading + over)
      newForward = forwardOf(worldVx, worldVz, heading)
      newSide = sideOf(worldVx, worldVz, heading)
    }
  }
  if (newForward > 0) {
    // Going forwards the grip swings the velocity onto the nose, keeping its speed: fast when the
    // tyres grip, slowly in a drift, so that the car's momentum carries on the old way
    const rate = tuning.driftAlign + (tuning.grip - tuning.driftAlign) * traction
    ;({ forward: newForward, side: newSide } = align(newForward, newSide, Math.exp(-rate * dt)))
    if (traction < 1) {
      // Sliding sideways scrubs speed off: the deeper the slide and the faster, the more
      const speed = Math.hypot(newForward, newSide)
      const slide = speed > 0 ? Math.abs(newSide) / speed : 0
      const scrub =
        tuning.driftScrub *
        slide *
        (speed / tuning.topSpeed) *
        (1 - traction) *
        (sliding ? tuning.slideScrub : 1) *
        dt
      const kept = speed > 0 ? Math.max(0, speed - scrub) / speed : 1
      newForward *= kept
      newSide *= kept
    }
  } else {
    // Reversing or stopped: sideways speed simply dies
    newSide *= Math.exp(-tuning.grip * dt)
  }

  // One limit on the whole speed, sideways included, or a slide would add to the top speed. Above
  // it, from a boost that ended, the car eases down instead of stopping dead.
  const limit = tuning.topSpeed * factor
  const speed = Math.hypot(newForward, newSide)
  if (speed > limit) {
    const allowed = Math.max(limit, Math.hypot(state.vx, state.vz) - tuning.overSpeedDrag * dt)
    if (speed > allowed) {
      newForward *= allowed / speed
      newSide *= allowed / speed
    }
  }

  // The gauge fills only in a real drift, at speed, and by how far the car is sliding; a full gauge
  // becomes a stored boost
  if (drifting && newForward >= tuning.driftMinSpeed && storedBoosts < tuning.maxStoredBoosts) {
    const depth = Math.min(
      GAUGE_DEPTH_MAX,
      Math.abs(Math.atan2(newSide, newForward)) / Math.max(1e-3, tuning.driftGaugeSlip),
    )
    gauge += tuning.gaugeFillRate * depth * (full ? tuning.boostGaugeShare : 1) * dt
  }
  // Only when it gained this step: a gauge left full while the store was full (fire a charge and
  // it waits) turns into a charge at the next drift, not at once
  if (gauge > state.gauge && gauge >= GAUGE_FULL && storedBoosts < tuning.maxStoredBoosts) {
    storedBoosts++
    gauge = storedBoosts < tuning.maxStoredBoosts ? gauge - GAUGE_FULL : GAUGE_FULL
  }

  // A boost slide makes the boost last longer
  const drain = sliding ? tuning.slideBoostDrain * dt : dt
  if (boostSeconds > 0) boostSeconds = Math.max(0, boostSeconds - drain)
  stackSeconds = boostSeconds > 0 ? Math.max(0, stackSeconds - drain) : 0
  if (miniSeconds > 0) miniSeconds = Math.max(0, miniSeconds - drain)
  if (releaseWindow > 0 && !earned && !doubled) releaseWindow = Math.max(0, releaseWindow - dt)
  if (releaseWindow === 0) doubleArmed = false
  // The double's window runs down from the step after the release boost that opened it
  if (doubleWindow > 0 && doubleWindow === state.doubleWindow) {
    doubleWindow = Math.max(0, doubleWindow - dt)
  }
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
    stackSeconds,
    catchSeconds,
    traction,
    doubleWindow,
    doubleDrift,
    doubleArmed,
    doubles,
  }
}

/** Whether the car is sliding: in a drift, or just out of one with the grip not yet back */
export const kartSkidding = (state: KartState): boolean => state.drifting || state.traction < 1

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
