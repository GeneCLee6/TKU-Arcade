// 2026-11-23 (docs/ARCHITECTURE.md §4.86): how a kart's body moves on its thrusters besides the bob,
// bank and pitch it already had (art/kartModel.ts): a spring under it, so that it squats as it pulls
// away, rides up a little in the air and is pressed down by a landing and bounces back; the thruster
// glow by the throttle; and how far the vanes at its nose turn with the steering. Looks only, pure so
// that a test can read it: nothing here reaches the physics or the race's verdicts.

/** The body's height off its rest, metres (+ up), and how fast it moves */
export interface Spring {
  readonly height: number
  readonly speed: number
}

export const SPRING_REST: Spring = { height: 0, speed: 0 }

/** The spring's stiffness (1/s²) and damping (1/s): a quick press, one soft bounce, settled in half a second */
const STIFFNESS = 140
const DAMPING = 10
/** No step longer than this, s: a long frame is taken in pieces so that the spring stays steady */
const STEP = 1 / 120

/** Where the spring wants the body: lower pulling away and in a boost, a little up in the air */
export function springTarget(surge: number, airborne: boolean, heat: number): number {
  if (airborne) return 0.05
  const squat = Math.min(0.045, Math.max(0, surge) * 0.0028)
  const dive = Math.min(0.03, Math.max(0, -surge) * 0.0016)
  return -squat - dive - heat * 0.025
}

/** How hard a landing presses the body down, m/s, by how long it flew (s) */
export const landingKick = (airSeconds: number): number => -Math.min(1.6, 0.5 + airSeconds * 1.4)

/** The spring `seconds` on toward `target`, with `kick` (m/s) added to its speed first */
export function stepSpring(spring: Spring, target: number, seconds: number, kick = 0): Spring {
  let height = spring.height
  let speed = spring.speed + kick
  let left = Math.max(0, Math.min(0.25, seconds))
  while (left > 1e-6) {
    const dt = Math.min(STEP, left)
    speed += (-(height - target) * STIFFNESS - speed * DAMPING) * dt
    height += speed * dt
    left -= dt
  }
  // Pressed down no further than the pads allow
  if (height < -0.12) {
    height = -0.12
    speed = Math.max(0, speed)
  }
  return { height, speed }
}

/**
 * The throttle as the thrusters show it, 0 to 1: as pressed when the look says (this browser's own
 * kart), otherwise read from how it gathers speed
 */
export function throttleOf(pressed: number | undefined, surge: number, speedShare: number): number {
  if (pressed !== undefined) return Math.max(0, Math.min(1, pressed))
  return Math.max(0, Math.min(1, surge / 10 + speedShare * 0.35))
}

/** The thruster glow: how bright the mouths are, and how strong the halo behind them */
export interface ThrusterGlow {
  readonly mouth: number
  readonly halo: number
}

export function thrusterGlow(throttle: number, speedShare: number, heat: number): ThrusterGlow {
  return {
    mouth: 0.45 + speedShare * 0.35 + throttle * 0.35 + heat * 1.4,
    halo: Math.min(1, 0.08 + throttle * 0.42 + speedShare * 0.12 + heat * 0.55),
  }
}

/** The nose's vanes at full lock, radians */
export const VANE_LOCK = 0.5

/** How far the vanes turn: with the steering, more at speed, opposite lock held in a drift */
export function vaneAngle(steer: number, drift: number, speedShare: number): number {
  const angle = (steer * (0.6 + speedShare * 0.4) - drift * 0.35) * VANE_LOCK
  return Math.max(-VANE_LOCK, Math.min(VANE_LOCK, angle))
}
