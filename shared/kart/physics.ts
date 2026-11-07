// The kart's step function: pure, no DOM and no clock, so that Node and the server can run the same
// code (docs/ARCHITECTURE.md §4). e8-t01 is the spike's minimum: accelerate, steer, drift. The boost
// bar, chained boosts, walls and respawn come with e8-t02 and build on this file.
//
// Units are metres, seconds and radians. Seen from above, heading 0 faces -z and heading grows
// clockwise, so a positive steer turns right.

/** The simulation's one fixed step: 60 Hz, whatever the display does */
export const STEP_SECONDS = 1 / 60

export interface KartInput {
  readonly throttle: boolean
  readonly brake: boolean
  /** -1 is full left, 1 is full right */
  readonly steer: number
  readonly drift: boolean
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
}

export const INITIAL_KART: KartState = {
  x: 0,
  z: 0,
  heading: 0,
  vx: 0,
  vz: 0,
  drifting: false,
  driftDirection: 0,
}

export const NO_INPUT: KartInput = { throttle: false, brake: false, steer: 0, drift: false }

// Starting values for the spike, not a signed-off feel (AC-8.3, AC-8.8)
export const KART_TUNING = {
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
  /** How fast sideways speed dies, per second */
  grip: 10,
  driftGrip: 0.9,
  driftMinSpeed: 8,
  driftExitSpeed: 5,
  driftTurnRate: 1.5,
  /** How much the steering can tighten or widen a drift */
  driftSteerRate: 0.9,
  driftMaxSlip: (32 * Math.PI) / 180,
  driftTopSpeed: 26.5,
  driftDrag: 8,
} as const

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

function drive(forward: number, input: KartInput, dt: number): number {
  const { acceleration, braking, coastDrag, reverseSpeed, topSpeed } = KART_TUNING
  if (input.brake) {
    return forward > 0
      ? Math.max(0, forward - braking * dt)
      : Math.max(-reverseSpeed, forward - acceleration * dt)
  }
  if (input.throttle) {
    return forward < 0
      ? Math.min(0, forward + braking * dt)
      : Math.min(topSpeed, forward + acceleration * dt)
  }
  return forward > 0 ? Math.max(0, forward - coastDrag * dt) : Math.min(0, forward + coastDrag * dt)
}

function yawRate(forward: number, steer: number, driftDirection: number): number {
  const { driftSteerRate, driftTurnRate, fullTurnSpeed, topSpeed, turnLossAtTopSpeed, turnRate } =
    KART_TUNING
  if (driftDirection !== 0) return driftDirection * driftTurnRate + steer * driftSteerRate
  const pace = Math.abs(forward)
  const authority = Math.min(1, pace / fullTurnSpeed) * (1 - turnLossAtTopSpeed * (pace / topSpeed))
  return Math.sign(forward) * steer * turnRate * authority
}

/** One step of 1/60 s. Pure: the same state and input always give the same result. */
export function stepKart(state: KartState, input: KartInput): KartState {
  const dt = STEP_SECONDS
  const steer = clamp(input.steer, -1, 1)
  const { driftExitSpeed, driftGrip, driftMaxSlip, driftMinSpeed, driftTopSpeed, driftDrag, grip } =
    KART_TUNING

  const forward = drive(forwardOf(state.vx, state.vz, state.heading), input, dt)
  const side = sideOf(state.vx, state.vz, state.heading)

  let driftDirection = state.driftDirection
  if (!input.drift || forward < driftExitSpeed) driftDirection = 0
  else if (driftDirection === 0 && steer !== 0 && forward >= driftMinSpeed) {
    driftDirection = steer > 0 ? 1 : -1
  }
  const drifting = driftDirection !== 0

  // Back to world axes from the old nose, then read against the new nose. The car turning while the
  // velocity stays put is what opens the slip angle.
  const worldVx = forward * Math.sin(state.heading) + side * Math.cos(state.heading)
  const worldVz = -forward * Math.cos(state.heading) + side * Math.sin(state.heading)
  const heading = wrapAngle(state.heading + yawRate(forward, steer, driftDirection) * dt)

  let newForward = forwardOf(worldVx, worldVz, heading)
  let newSide = sideOf(worldVx, worldVz, heading) * Math.exp(-(drifting ? driftGrip : grip) * dt)

  if (drifting) {
    const speed = Math.hypot(newForward, newSide)
    // Past the cap the velocity turns with the car: the angle is limited, not the speed
    if (Math.abs(newSide) > newForward * Math.tan(driftMaxSlip)) {
      newForward = speed * Math.cos(driftMaxSlip)
      newSide = Math.sign(newSide) * speed * Math.sin(driftMaxSlip)
    }
    if (speed > driftTopSpeed) {
      const scale = Math.max(driftTopSpeed, speed - driftDrag * dt) / speed
      newForward *= scale
      newSide *= scale
    }
  }

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
