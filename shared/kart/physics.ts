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
// Then (owner: "after the drift there are skid marks and the car slides out; pull it back with the
// opposite arrow, then press forward again for the burst; the more you drift the more gauge"): the
// slide-out and the counter-steer. Let go of the drift and the car keeps sliding, the nose still
// carried round the drift's way (`slideCarry`), the grip coming back only slowly (`driftRecovery`);
// steering the other way catches it (`catchGrip`, `catchSeconds`) and only then does a fresh press
// of the throttle fire the release boost (`releaseWindow`). The gauge fills by how deep, how fast
// and how long the car slides, the slide-out included (docs/ARCHITECTURE.md §4.13).
//
// Units are metres, seconds and radians. Seen from above, heading 0 faces -z and heading grows
// clockwise, so a positive steer turns right.

import { stepClassic } from './classic.ts'
import { TEAM_BOOST } from './teamBoost.ts'

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
  /**
   * The classic feel (2026-11-17, docs/KART-FEEL.md): the throttle was pressed since the last step,
   * even if it was let go and pressed again in between, so that a quick re-press is still a fresh
   * press. The arcade feel ignores it
   */
  readonly throttleTap?: boolean
  /**
   * 2026-11-20: the throttle is down only because the on-screen buttons' automatic throttle holds it
   * (shared/kart/touch.ts), not because anyone pressed it: no start boost comes of it. The physics
   * ignores it
   */
  readonly autoThrottle?: boolean
  /** Fires a stored boost when it goes from up to down (held down, it fires only once) */
  readonly boost: boolean
  /**
   * Puts the car back at the last safe place when it goes from up to down (e8-t02b). stepKart
   * ignores it: the course does it (shared/kart/course.ts), since only the course knows where.
   */
  readonly reset?: boolean
  /** Uses the item held, in an item race (e9-t05), when it goes from up to down. The physics ignores it */
  readonly item?: boolean
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
  /**
   * Seconds left, after counter-steering out of a drift's slide-out, in which a fresh press of the
   * throttle fires a release boost
   */
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
  /**
   * Which way the drift went that the car is still sliding out of: -1 left, 1 right; 0 in a drift,
   * and once the grip is back. Steering against it is the counter-steer
   */
  readonly slideDirection: -1 | 0 | 1
  /**
   * Whether the slide-out came from a drift that earned a release boost (or the double's tap): a
   * counter-steer now opens the release window
   */
  readonly burstReady: boolean
  /**
   * Slopes and jumps (2026-11-17, terrain.ts): the height, the upward speed in the air and how long
   * the car has been in the air (0 on the ground). Only on a track with terrain: a flat track's cars
   * never have them, and their state is exactly what it always was
   */
  readonly y?: number
  readonly vy?: number
  readonly air?: number
  /**
   * The drift jump (2026-11-19, terrain.ts; the classic feel only): the way of the drift the car
   * took off in and still carries (0 once let go or landed), how long that drift has been held,
   * and how many drifts have been landed, for the HUD. Never set before a car first takes off in
   * a drift
   */
  readonly airDrift?: -1 | 0 | 1
  readonly airHeld?: number
  readonly driftJumps?: number
  /**
   * The classic feel only (2026-11-17, classic.ts; docs/KART-FEEL.md): the steering as the wheels
   * have it (it follows the stick quickly, not at once), the deepest slip angle of this drift, the
   * drift key as it was at the last step, whether the drift key must be let go before it drifts
   * again, and the seconds of start boost left. The arcade feel never sets them
   */
  readonly steerNow?: number
  readonly driftPeak?: number
  readonly driftKey?: boolean
  readonly driftLatch?: boolean
  readonly launchSeconds?: number
  /**
   * The classic feel only (2026-11-18, the gauge by the quality of the drift; classic.ts,
   * docs/KART-FEEL.md §3.5): whether a wall was touched in the drift under way or just let go;
   * the seconds since a drift was let go with an instant boost waiting; what that drift was worth
   * to the exit's bonus and how long it lasted; the seconds left in which a throttle press wasted
   * in the drift spoils a perfect exit; and the last instant boost fired: its grade (1 late, 2
   * good, 3 perfect), how many have been fired, and the gauge points it added. The arcade feel
   * never sets them
   */
  readonly driftDirty?: boolean
  readonly sinceRelease?: number
  readonly driftWorth?: number
  readonly driftHeld?: number
  readonly tapEarly?: number
  readonly dashGrade?: number
  readonly dashCount?: number
  readonly gaugeGain?: number
  /**
   * A team race only (2026-11-18, teamBoost.ts; shared/kart/team.ts): how many of the charges the
   * kart holds are blue (set by its browser, teamRider.ts) and the seconds of blue boost left. Any
   * other kart never has them
   */
  readonly teamBoosts?: number
  readonly teamSeconds?: number
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
  slideDirection: 0,
  burstReady: false,
}

export const NO_INPUT: KartInput = {
  throttle: false,
  brake: false,
  steer: 0,
  drift: false,
  boost: false,
  reset: false,
  item: false,
}

/**
 * The arcade feel's numbers (everything before 2026-11-17), kept as the "arcade (old)" preset: every
 * number the physics read, in one object, so that the tuning panel (e8-t03) can edit them and
 * save presets. Starting values, not a signed-off feel (AC-8.3, AC-8.8). Speeds are m/s, rates per
 * second, angles radians. All of them in a table: docs/PRD/e8-kart-single-player-core.md, in the
 * section on what J2 settled.
 */
const ARCADE_NUMBERS = {
  /**
   * Straight-line top speed (2026-11-14, owner "too slow": 30 to 40, to 50, then 60 m/s): 216 km/h
   * on the honest dial since 2026-11-17. 0 to top takes topSpeed / acceleration = 2.15 s
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
  /**
   * How long the grip takes to come back once the drift is let go, left alone: the car slides out
   * until then, still scrubbing speed off (the grip bites late: it counts as its square)
   */
  driftRecovery: 0.9,
  /**
   * The share of the drift's turn rate that still carries the nose round during the slide-out, the
   * less the more grip is back: left alone the car over-rotates and slides wide
   */
  slideCarry: 0.45,
  /** The slip angle at which the gauge fills at gaugeFillRate: deeper fills faster (up to 1.5 times) */
  driftGaugeSlip: (35 * Math.PI) / 180,

  /**
   * The counter-steer: steering against the slide-out brings the grip back this many times
   * faster ...
   */
  catchGrip: 4.5,
  /** ... for this long, so the car straightens up at once */
  catchSeconds: 0.25,

  /**
   * Gauge points per second of sliding at driftGaugeSlip and at the top speed (in proportion to the
   * speed: it is the distance slid that counts), in a drift and in the slide-out after it, plus a
   * bonus for each drift let go: two or three good drifts fill it
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
  /**
   * After the counter-steer that catches a drift's slide-out, a fresh press of the throttle within
   * this many seconds fires one
   */
  releaseWindow: 0.4,
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

/** Which physics a tuning drives: `model` is one of these */
export const MODEL_ARCADE = 0
export const MODEL_CLASSIC = 1

const DEG = Math.PI / 180

/**
 * The classic feel (2026-11-17, owner: "the feel is wrong ... still far from the classic kart racers'
 * design and feel, and the speed is odd"; docs/KART-FEEL.md). The default. Speeds are true: the
 * speedometer reads m/s times 3.6, so the top speed of 68 m/s reads 245 km/h and a boost about 310.
 * The engine pushes against drag (a = acceleration × (1 − dragShare·u − (1 − dragShare)·u²), u the
 * speed over the top speed), so it pulls hard from a standstill and eases into the top speed instead
 * of hitting a wall. The drift is a slip angle the car swings to in `driftSlipIn` and lets go of at
 * `driftRecoverRate` (twice as fast counter-steering); a drift at least `dashMinSlip` deep and
 * `dashMinSeconds` long earns an instant boost (the dash), fired only by a fresh press of the
 * throttle: while the car still slides, or up to `releaseWindow` after it straightens. classic.ts has
 * the step. 2026-11-18 (owner: "the drift still grips too well ... it should take a big drift to
 * boost"): the slip builds slower and only steering into the drift takes it deep, the car turns
 * little until it is (`driftLoose`), the dash wants depth and length both, the double is off, and a
 * boost has to run out before the next can be fired. Later the same day (owner: "now it drifts too
 * big again: a drift that really slid should boost, only the grip need not be so good"): the marks
 * are down to a real drift (`dashMinSlip` 18°, `dashMinSeconds` 0.22 s: a tap still earns nothing),
 * the drift stays loose and scrubs a little more, and the dash itself is a little milder so that
 * weaving down a straight for it does not pay.
 */
export const KART_TUNING = {
  ...ARCADE_NUMBERS,
  // Speed: true m/s, an engine against drag
  topSpeed: 68,
  acceleration: 34,
  braking: 56,
  coastDrag: 4,
  reverseSpeed: 10,
  /** The share of the drag that grows with the speed; the rest grows with its square */
  dragShare: 0.3,
  /** Off the throttle, this share of the drag still slows the car (plus coastDrag) */
  coastDragShare: 0.25,

  // Steering with grip
  turnRate: 2.5,
  turnLossAtTopSpeed: 0.5,
  fullTurnSpeed: 8,
  grip: 10,
  /** How fast the wheels follow the stick, per second: a key's full lock takes 1/7 s, not one step */
  steerResponse: 7,
  /**
   * Turning hard on grip scrubs speed off: this much a second at full lock and the top speed (less
   * with the square of the speed). A drift through the same corner loses less
   */
  gripScrub: 14,

  // The drift
  driftMinSpeed: 12,
  driftExitSpeed: 7,
  /** How fast the direction of travel comes round in a drift, stick centred, at driftFullSpeed or more */
  driftTurnRate: 1.75,
  /** Steering into the drift turns it this share faster; steering out, this share slower */
  driftSteerShare: 0.4,
  /** Below this speed a drift turns proportionally less, so the car does not spin on the spot */
  driftFullSpeed: 20,
  /** The slip angle a drift swings to, stick centred ... */
  driftSlip: 24 * DEG,
  /** ... plus this much steering into it, minus this much steering out (40 and 8 degrees) */
  driftSlipSteer: 16 * DEG,
  /** How long the swing to that angle takes (90% of it) */
  driftSlipIn: 0.45,
  /**
   * The share of a drift's turn that comes only with the slip: at the start of a drift the tail is
   * out but the car carries straight on, and it turns in full once the slip reaches driftSlip
   */
  driftLoose: 0.6,
  driftMaxSlip: 50 * DEG,
  /** Sliding scrubs this much a second at the top speed, fully sideways (by the sine of the slip) */
  driftScrub: 22,
  /** Let go, the slip straightens at this many radians a second (63°/s); counter-steering, twice */
  driftRecoverRate: 1.1,
  /** The drift's turn still carried while sliding out, as a share, the less the straighter */
  slideCarry: 0.45,
  /** The share of the engine's pull in a drift, and while sliding out of one */
  driftPull: 1,
  slidePull: 0.85,

  // The boost gauge and the boost (N2O)
  // The gauge goes by the quality of the drift (2026-11-18, owner: "it fills too slowly; an expert
  // should boost all the way round, a novice not"; docs/KART-FEEL.md §3.5)
  /** Gauge points a second drifting at the top speed (by the square of the speed) ... */
  gaugeFillRate: 34,
  /**
   * ... as deep as driftSlip or deeper; a drift with no slip yet fills at this share of it, in
   * proportion between
   */
  gaugeShallow: 0.5,
  /** ... for this many seconds of one drift; a second of it later, half that, and so on */
  gaugeFade: 1,
  /**
   * A drift fills nothing for this long, then more and more for as long again: a tapped drift
   * (down a straight, say) fills nothing at all
   */
  gaugeLead: 0.2,
  /**
   * The exit: an instant boost fired out of a drift adds this many points, times what the drift was
   * worth (its depth and its length), the square of the speed, the timing's grade and the combo;
   * nothing if the drift touched a wall
   */
  gaugeDashBonus: 24,
  /** Each instant boost in a row after the first adds this share to all the gauge gains ... */
  gaugeComboStep: 0.12,
  /** ... for up to this many */
  gaugeComboLinks: 5,
  /**
   * The share of all that the gauge still gets while a boost runs: all of it, so that an expert
   * drifts through a boost for the next one (the arcade feel: a quarter)
   */
  boostGaugeShare: 1,
  maxStoredBoosts: 2,
  boostDuration: 2.9,
  /** A boost multiplies the engine's pull by this ... */
  boostAccelFactor: 1.5,
  /** ... and lets the car go this much over the top speed */
  boostTopSpeedFactor: 1.28,
  overSpeedDrag: 9,
  // One boost at a time: the boost key does nothing while a boost runs (classic.ts). The arcade
  // feel's stacking numbers (boostStackSeconds, boostStackFactor) are not read
  padBoostSeconds: 1.2,

  // The start boost (timeTrial.ts)
  /**
   * The throttle pressed this long before GO, or less, and held: the full start boost. The whole of
   * the "1" (2026-11-20, owner: "wider, I often press and get nothing"; it was 0.5 s)
   */
  startWindow: 1,
  /** Its length, multiplying the engine's pull by startAccelFactor */
  startBoostDuration: 1.5,
  startAccelFactor: 1.9,
  /** ... and lets the car go this much over the top speed while it lasts */
  startTopSpeedFactor: 1.15,
  /** Held from earlier than the window: this share of the start boost, and no stall */
  startEarlyShare: 0.5,
  /** Pressed afresh within this long after GO still counts as on time: a press in answer to GO (was 0.1 s) */
  startLate: 0.25,

  // The dash (the instant boost out of a drift) and its chain
  /**
   * The deepest slip angle a drift must reach to earn a dash: the tail visibly out (32° until
   * 2026-11-18, which took the stick all the way in; 20° before that, with a slip that swung out at
   * once, so a tap earned it) ...
   */
  dashMinSlip: 18 * DEG,
  /** ... and how long the drift must have lasted: a tap and let go is shorter (0.45 s until then) */
  dashMinSeconds: 0.22,
  /** After the car straightens, a fresh press of the throttle within this long fires a waiting dash */
  releaseWindow: 0.5,
  /** How long a dash lasts ... (0.5 s at first, 0.8 s while it took a deep drift) */
  chainDuration: 0.7,
  /** ... multiplying the engine's pull by this ... */
  dashAccelFactor: 1.7,
  /** ... with the top speed this much higher */
  miniTopSpeedFactor: 1.08,
  /**
   * The timing of the press (2026-11-18): within this long of letting go of the drift ...
   */
  perfectWindow: 0.1,
  /** ... a drift that lasted at least this long, it is perfect: the dash lasts this many times as long (and the gauge's bonus is as many times as big) ... */
  perfectMinSeconds: 0.4,
  perfectShare: 1.4,
  /** ... pulls this much harder and goes this much higher (a late one, this much less) */
  perfectAccelStep: 0.2,
  perfectSpeedStep: 0.03,
  /** Late (the car already straight): this share of the dash's length and of the gauge's bonus */
  lateShare: 0.6,
  /**
   * Dashes in a row within this long of each other chain: the combo (2.5 s since 2026-11-18, 1 s
   * before; the window also holds through a drift and through a boost) ...
   */
  chainGrace: 2.5,
  /** ... each link after the first adding this to the dash's top speed factor ... */
  chainSpeedStep: 0.01,
  /** ... and this to its pull ... */
  chainAccelStep: 0.05,
  /** ... for up to this many links */
  chainSpeedLinks: 3,
  /**
   * After a dash, a drift begun within this long earns the next however short (the double). 0: off
   * since 2026-11-18, every dash takes a drift of its own (a tap must never earn one)
   */
  doubleWindow: 0,
  /** The cut: a fresh drift press while counter-steering a slide straightens it in this long */
  cutSeconds: 0.1,

  // Walls
  wallBounce: 0.15,
  wallImpactLoss: 0.55,
  wallScrapeDrag: 8,
  wallBreakSpeed: 8,
  /** A hit at least wallBreakSpeed hard keeps this share of the gauge */
  wallGaugeKeep: 0.5,

  /** MODEL_CLASSIC */
  model: MODEL_CLASSIC as number,
}

export type KartTuning = { readonly [K in keyof typeof KART_TUNING]: number } & {
  /**
   * The circle walls push on, metres, when it is not the standard kart's (walls.ts's KART_RADIUS):
   * a bike's (2026-11-19, karts.ts's applyKart). Not a number of the feel: the tuning panel neither
   * shows nor saves it
   */
  readonly bodyRadius?: number
}

/** The arcade feel (before 2026-11-17), the "arcade (old)" preset: bit for bit what it always drove */
export const ARCADE_TUNING: KartTuning = { ...KART_TUNING, ...ARCADE_NUMBERS, model: MODEL_ARCADE }

/** Whether these numbers drive the classic feel */
export const isClassic = (tuning: KartTuning): boolean => tuning.model === MODEL_CLASSIC

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
  /** The share of the engine's pull that reaches the road: less when stalled or sliding out */
  pull: number,
  tuning: KartTuning,
): number {
  const { braking, coastDrag, reverseSpeed } = tuning
  const acceleration = tuning.acceleration * pull
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

/** The slide-out as the steering sees it */
interface SlideOut {
  /** Which way the drift went; 0 when the car is not sliding out */
  readonly direction: number
  /** How much of the grip is still gone, 0 to 1 */
  readonly loose: number
  /** Whether a counter-steer has caught it: the tyres steer again */
  readonly caught: boolean
}

function yawRate(
  forward: number,
  steer: number,
  driftDirection: number,
  slide: SlideOut,
  tuning: KartTuning,
): number {
  const { driftSteerRate, driftTurnRate, fullTurnSpeed, topSpeed, turnLossAtTopSpeed, turnRate } =
    tuning
  // Steering the drift's way tightens it, the other way widens it; it never turns the car back
  if (driftDirection !== 0) return driftDirection * driftTurnRate + steer * driftSteerRate
  const pace = Math.abs(forward)
  const loss = turnLossAtTopSpeed * Math.min(1, pace / topSpeed)
  const authority = Math.min(1, pace / fullTurnSpeed) * (1 - loss)
  const gripYaw = Math.sign(forward) * steer * turnRate * authority
  if (slide.direction === 0 || slide.loose <= 0 || slide.caught || forward <= 0) return gripYaw
  // Sliding out, not yet caught: the tyres steer only as far as they grip, and the drift's turn
  // still carries the nose round; steering the drift's way keeps it turning as in the drift
  const same = Math.max(0, steer * slide.direction)
  const carried = slide.direction * (driftTurnRate * tuning.slideCarry + same * driftSteerRate)
  return gripYaw * (1 - slide.loose) + carried * slide.loose
}

/** The share of the engine's pull left while stalled after a bad start */
const STALL_SHARE = 0.15
/** The share of the engine's pull left at the start of a slide-out, before any grip is back */
const SLIDE_PULL = 0.2
/** How far against the slide the stick must be for a counter-steer */
const COUNTER_STEER = 0.3
/** The gauge fills by the speed, as a share of the top speed, up to this (a boost slide) */
const GAUGE_SPEED_MAX = 1.25
/** The gauge fills at most this many times its rate, however deep the slide */
const GAUGE_DEPTH_MAX = 1.5

/** Swings the velocity round towards the nose, leaving `fraction` of the slip, keeping its speed */
function align(forward: number, side: number, fraction: number) {
  const speed = Math.hypot(forward, side)
  const slip = Math.atan2(side, forward) * fraction
  return { forward: speed * Math.cos(slip), side: speed * Math.sin(slip) }
}

/**
 * The arcade (old) feel in a team race: it has no faster boost of its own, so a blue charge fired is
 * a boost of the team boost's length (it still shows blue). Fired like the classic feel's: a charge
 * of the stock, the blue ones first, and only once whatever burns has burnt out
 */
function stepArcadeTeam(
  state: KartState,
  input: KartInput,
  tuning: KartTuning,
  rules: KartRules,
  limitScale: number,
): KartState {
  const { teamBoosts: held = 0, teamSeconds: left = 0, ...plain } = state
  let teamBoosts = Math.min(held, state.storedBoosts)
  let teamSeconds = left
  let from: KartState = plain
  if (
    input.boost &&
    !state.boostHeld &&
    teamBoosts > 0 &&
    state.boostSeconds === 0 &&
    teamSeconds === 0
  ) {
    teamBoosts--
    teamSeconds = TEAM_BOOST.seconds
    // The key counts as held, so that this press does not fire a second charge as well
    from = {
      ...plain,
      storedBoosts: state.storedBoosts - 1,
      boostSeconds: TEAM_BOOST.seconds,
      boostHeld: true,
    }
  }
  const next = stepKart(from, input, tuning, rules, limitScale)
  return { ...next, teamBoosts, teamSeconds: Math.max(0, teamSeconds - STEP_SECONDS) }
}

/**
 * One step of 1/60 s. Pure: the same state, input, tuning and rules always give the same result.
 */
export function stepKart(
  state: KartState,
  input: KartInput,
  tuning: KartTuning = KART_TUNING,
  rules: KartRules = DEFAULT_RULES,
  /**
   * The top speed's scale (terrain.ts: a little less uphill, a little more downhill). 1 on a flat
   * track, where multiplying by it changes nothing
   */
  limitScale = 1,
): KartState {
  // The classic feel (2026-11-17) is a step of its own; what follows is the arcade feel, unchanged
  if (tuning.model === MODEL_CLASSIC) return stepClassic(state, input, tuning, rules, limitScale)
  if (state.teamBoosts !== undefined || state.teamSeconds !== undefined) {
    return stepArcadeTeam(state, input, tuning, rules, limitScale)
  }
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

  // Letting go of a long enough drift (the key, not slowing down) earns a release boost and tops up
  // the gauge; so does letting go of the double's tap, however short (two steps at least: a key
  // that flickers for one step is not a tap). The car is now sliding out
  const released = state.drifting && !input.drift
  const earned = released && state.driftSeconds >= tuning.chainMinDrift
  const doubled = released && !earned && state.doubleDrift && state.driftSeconds > dt * 1.5
  let burstReady = state.burstReady
  if (earned || doubled) {
    burstReady = true
    doubleArmed = doubled
  }
  if (earned && storedBoosts < tuning.maxStoredBoosts) {
    gauge += tuning.gaugeDriftBonus * (boostSeconds > 0 ? tuning.boostGaugeShare : 1)
  }
  // The counter-steer: steering against the slide-out catches it. The grip comes back fast for a
  // moment, and if the drift earned a release boost its window opens now
  const slideWay = state.drifting ? state.driftDirection : state.slideDirection
  const slidingOut = !input.drift && slideWay !== 0 && (released || state.traction < 1)
  const countered = slidingOut && steer * slideWay < -COUNTER_STEER
  let catchSeconds = Math.max(0, state.catchSeconds - dt)
  let caught = false
  if (countered && (burstReady || state.catchSeconds <= 0)) {
    catchSeconds = tuning.catchSeconds
    if (burstReady) {
      releaseWindow = tuning.releaseWindow
      burstReady = false
      caught = true
    }
  }

  // A release boost: the throttle pressed afresh once the slide-out is caught (in the same step
  // will do). Inside the chain window it adds a link to the chain; outside it starts a new one
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
    // A bad start bogs the engine down; sliding out of a drift, uncaught, the tyres spin
    (state.stallSeconds > 0 ? STALL_SHARE : 1) *
      (state.drifting || input.drift
        ? 1
        : SLIDE_PULL + (1 - SLIDE_PULL) * state.traction * state.traction),
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
  if (entered) {
    doubleWindow = 0
    // A new drift before the last one's slide-out was caught: that release boost is gone
    burstReady = false
  }
  // The rear lets go the moment a drift begins. Let go, the grip comes back only slowly, the car
  // sliding out meanwhile; much faster while a counter-steer's catch lasts
  const traction = drifting
    ? 0
    : Math.min(
        1,
        state.traction +
          (dt / Math.max(dt, tuning.driftRecovery)) * (catchSeconds > 0 ? tuning.catchGrip : 1),
      )
  // The slide-out goes the way the drift went, until the grip is back
  const slideDirection: -1 | 0 | 1 = drifting || traction >= 1 ? 0 : slideWay
  if (slideDirection === 0) burstReady = false

  // Back to world axes from the old nose, then read against the new nose. The car turning while the
  // velocity stays put is what opens the slip angle.
  const worldVx = forward * Math.sin(state.heading) + side * Math.cos(state.heading)
  const worldVz = -forward * Math.cos(state.heading) + side * Math.sin(state.heading)
  const slide: SlideOut = {
    direction: drifting ? 0 : slideWay,
    loose: 1 - state.traction,
    caught: catchSeconds > 0,
  }
  let heading = wrapAngle(
    state.heading + yawRate(forward, steer, driftDirection, slide, tuning) * dt,
  )

  let newForward = forwardOf(worldVx, worldVz, heading)
  let newSide = sideOf(worldVx, worldVz, heading)

  const slipBefore = Math.atan2(newSide, newForward)
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
    // tyres grip, slowly in a drift and in the slide-out after it (the grip bites late: as the
    // square of the traction), so that the car's momentum carries on the old way
    const rate = tuning.driftAlign + (tuning.grip - tuning.driftAlign) * traction * traction
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
  const limit = tuning.topSpeed * factor * limitScale
  const speed = Math.hypot(newForward, newSide)
  if (speed > limit) {
    const allowed = Math.max(limit, Math.hypot(state.vx, state.vz) - tuning.overSpeedDrag * dt)
    if (speed > allowed) {
      newForward *= allowed / speed
      newSide *= allowed / speed
    }
  }

  // The gauge fills only while the car slides (in a drift, and in the slide-out after it for as
  // much of the grip as is still gone), at speed, and by how deep and how fast it slides: the more
  // road covered sideways, the more gauge. A full gauge becomes a stored boost
  const loose = drifting ? 1 : 1 - traction
  if (loose > 0 && newForward >= tuning.driftMinSpeed && storedBoosts < tuning.maxStoredBoosts) {
    const depth = Math.min(
      GAUGE_DEPTH_MAX,
      Math.abs(Math.atan2(newSide, newForward)) / Math.max(1e-3, tuning.driftGaugeSlip),
    )
    const pace = Math.min(GAUGE_SPEED_MAX, Math.hypot(newForward, newSide) / tuning.topSpeed)
    gauge += tuning.gaugeFillRate * depth * pace * loose * (full ? tuning.boostGaugeShare : 1) * dt
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
  if (releaseWindow > 0 && !caught) releaseWindow = Math.max(0, releaseWindow - dt)
  if (releaseWindow === 0 && !burstReady) doubleArmed = false
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
    slideDirection,
    burstReady,
  }
}

/** Whether the car is sliding: in a drift, or just out of one with the grip not yet back */
export const kartSkidding = (state: KartState): boolean => state.drifting || state.traction < 1

/** Whether any boost (from the gauge, the start or a release) is running */
export const kartBoosting = (state: KartState): boolean =>
  state.boostSeconds > 0 ||
  state.miniSeconds > 0 ||
  (state.launchSeconds ?? 0) > 0 ||
  (state.teamSeconds ?? 0) > 0

/** Whether a team boost (a team race, teamBoost.ts) is burning: the blue one */
export const kartTeamBoosting = (state: KartState): boolean => (state.teamSeconds ?? 0) > 0

/**
 * Whether a release boost (the arcade feel) or a dash (the classic feel) waits for a fresh press of
 * the throttle, so that the touch screen's automatic throttle lets go for the tap and the HUD says
 * so. In the classic feel from the drift key coming up (the car still sliding) until `releaseWindow`
 * after it straightens; during the drift itself the throttle stays on
 */
export const kartBurstWaiting = (state: KartState, tuning: KartTuning): boolean =>
  tuning.model === MODEL_CLASSIC
    ? !state.drifting &&
      (state.releaseWindow > 0 || (state.burstReady && state.slideDirection !== 0))
    : state.burstReady || state.releaseWindow > 0

/**
 * How near the drift under way is to earning a dash (the classic feel), 0 to 1: the lesser of how
 * deep it has slid against `dashMinSlip` and how long it has lasted against `dashMinSeconds`. 1 once
 * it is earned; 0 out of a drift. The HUD's depth meter
 */
export function kartDashDepth(state: KartState, tuning: KartTuning): number {
  if (tuning.model !== MODEL_CLASSIC || !state.drifting) return 0
  if (state.burstReady) return 1
  const deep = (state.driftPeak ?? 0) / Math.max(1e-3, tuning.dashMinSlip)
  const long = state.driftSeconds / Math.max(STEP_SECONDS, tuning.dashMinSeconds)
  return Math.max(0, Math.min(1, deep, long))
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
): { x: number; z: number; heading: number; y?: number } {
  const pose = {
    x: from.x + (to.x - from.x) * alpha,
    z: from.z + (to.z - from.z) * alpha,
    heading: wrapAngle(from.heading + wrapAngle(to.heading - from.heading) * alpha),
  }
  // A track with terrain (terrain.ts): the height too
  if (to.y === undefined) return pose
  const fromY = from.y ?? to.y
  return { ...pose, y: fromY + (to.y - fromY) * alpha }
}
