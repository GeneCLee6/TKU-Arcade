// 2026-11-17 (owner: "a perfect start has to feel like a launch; a drift needs the tyres' squeal and
// skid marks"; docs/KART-FEEL.md §7): what the sliding and the boosts look and sound like, as plain
// numbers, so that Node tests them. effects.ts draws the marks and the smoke from them, kartAudio.ts
// makes the squeal, camera.ts and Scene.ts the kick. Our own synthesis and drawing: no sample, no
// texture and no model from any other game.

const DEG = Math.PI / 180

/** Slower than this nothing squeals and nothing marks the road, m/s */
export const SKID_MIN_SPEED = 6
/** A slip this small leaves no mark: the tyres still roll */
export const SKID_MIN_SLIP = 3 * DEG
/** A slip this deep, or deeper, marks the road as dark as it gets */
export const SKID_FULL_SLIP = 24 * DEG
/** The faintest mark a slide leaves, once it leaves one at all */
const SKID_FAINT = 0.4
/** Braking hard at this speed or more locks the tyres: marks and a squeal without any slip */
export const BRAKE_SKID_SPEED = 14
/** How dark a locked tyre's mark is, and how loud, as a share of a deep slide's */
const BRAKE_SKID = 0.6

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

/**
 * How hard the tyres are sliding, 0 (rolling) to 1 (as sideways as a drift gets): how dark the skid
 * mark laid this frame is, how thick the smoke, how loud the squeal. `slip` is the angle between the
 * nose and the direction of travel, radians; `sliding` whether the car is in a drift or sliding out
 * of one (a grip turn has a slip too, a small one, which marks nothing)
 */
export function skidStrength(
  slip: number,
  speed: number,
  sliding: boolean,
  braking = false,
): number {
  const pace = Math.abs(speed)
  if (pace < SKID_MIN_SPEED) return 0
  const depth = sliding
    ? clamp01((Math.abs(slip) - SKID_MIN_SLIP) / (SKID_FULL_SLIP - SKID_MIN_SLIP))
    : 0
  const slide = depth > 0 ? SKID_FAINT + (1 - SKID_FAINT) * depth : 0
  const locked = braking && pace >= BRAKE_SKID_SPEED ? BRAKE_SKID : 0
  return Math.max(slide, locked)
}

/** The squeal's loudest gain, before the master volume */
export const SQUEAL_GAIN = 0.34
/** The squeal's pitch at a walking pace and what a deep, fast slide adds, Hz */
const SQUEAL_LOW_HZ = 780
const SQUEAL_SPEED_HZ = 520
const SQUEAL_SLIP_HZ = 260
/** The speed the squeal's pitch and loudness are measured against, m/s */
const SQUEAL_SPEED = 68

/**
 * The tyres' squeal for a slide `strength` hard (skidStrength) at `speed` m/s: louder the harder and
 * the faster it slides, higher the faster, and a little higher the harder (a howl that climbs as the
 * drift deepens). Silent when nothing slides
 */
export function squealVoice(strength: number, speed: number): { gain: number; hz: number } {
  const pace = clamp01(Math.abs(speed) / SQUEAL_SPEED)
  const hard = clamp01(strength)
  if (hard <= 0) return { gain: 0, hz: SQUEAL_LOW_HZ }
  return {
    gain: SQUEAL_GAIN * hard * (0.45 + 0.55 * pace),
    hz: SQUEAL_LOW_HZ + SQUEAL_SPEED_HZ * pace + SQUEAL_SLIP_HZ * hard,
  }
}

/** What fired: the start boost (full or small), a boost from the gauge or a pad, or an instant boost */
export type BurstKind = 'start' | 'quick' | 'boost' | 'dash'

/**
 * How hard a boost kicks, 0 to 1: the camera's lurch and shake, the thrusters' burst, the bang. A
 * perfect start kicks hardest, an instant boost least (it comes several times a corner)
 */
export const BURST_POWER: Readonly<Record<BurstKind, number>> = {
  start: 1,
  boost: 0.8,
  quick: 0.6,
  dash: 0.45,
}

/** Which boost began between two steps, the strongest first; null for none */
export function burstBetween(
  before: { boostSeconds: number; miniSeconds: number; launchSeconds?: number },
  after: { boostSeconds: number; miniSeconds: number; launchSeconds?: number },
  /** How long a full start boost lasts (tuning.startBoostDuration): a shorter one is the small one */
  fullStart: number,
): BurstKind | null {
  const launch = after.launchSeconds ?? 0
  if (launch > (before.launchSeconds ?? 0)) return launch >= fullStart * 0.75 ? 'start' : 'quick'
  if (after.boostSeconds > before.boostSeconds) return 'boost'
  if (after.miniSeconds > before.miniSeconds) return 'dash'
  return null
}
