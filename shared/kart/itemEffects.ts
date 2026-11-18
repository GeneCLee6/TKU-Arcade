// e9-t06a, e9-t06b: what an item does to a kart, in its own browser. The room decides who an item reaches
// (shared/games/kart/rules.ts); each browser then changes its own kart, step by step, with these.
// Pure, so that the numbers are tested without a page.
import type { Run } from './course.ts'
import { HEADWIND_TOP_SPEED, ITEM_TUNING, safeBehind, TOW_TOP_SPEED, type Warp } from './items.ts'
import { KART_TUNING, type KartState } from './physics.ts'
import { SHOT_TUNING } from './shots.ts'
import type { Track } from './track.ts'

/** The boost: the physics' own, so that it looks, sounds and stacks as any other */
export function boostKart(kart: KartState): KartState {
  return { ...kart, boostSeconds: Math.max(kart.boostSeconds, ITEM_TUNING.boostSeconds) }
}

/** A headwind's step: every boost blown out, and the speed brought down to the headwind's top */
export function headwindStep(kart: KartState, seconds: number): KartState {
  const speed = Math.hypot(kart.vx, kart.vz)
  const calm =
    kart.boostSeconds === 0 &&
    kart.miniSeconds === 0 &&
    kart.stackSeconds === 0 &&
    (kart.teamSeconds ?? 0) === 0
  if (speed <= HEADWIND_TOP_SPEED && calm) return kart
  const share =
    speed > HEADWIND_TOP_SPEED
      ? Math.max(HEADWIND_TOP_SPEED / speed, 1 - ITEM_TUNING.headwindDrag * seconds)
      : 1
  return {
    ...kart,
    vx: kart.vx * share,
    vz: kart.vz * share,
    boostSeconds: 0,
    miniSeconds: 0,
    stackSeconds: 0,
    // A team boost (a team race) is blown out with the rest
    ...(kart.teamSeconds ? { teamSeconds: 0 } : {}),
  }
}

/** Closer than this, a tow stops pulling: the kart is on the other's tail */
const TOW_CLOSE = 6

/** A tow's step: pulled towards the kart ahead, up to the tow's top speed */
export function towStep(
  kart: KartState,
  target: { x: number; z: number },
  seconds: number,
): KartState {
  const dx = target.x - kart.x
  const dz = target.z - kart.z
  const distance = Math.hypot(dx, dz)
  if (distance < TOW_CLOSE) return kart
  let vx = kart.vx + (dx / distance) * ITEM_TUNING.towPull * seconds
  let vz = kart.vz + (dz / distance) * ITEM_TUNING.towPull * seconds
  const speed = Math.hypot(vx, vz)
  if (speed > TOW_TOP_SPEED) {
    vx *= TOW_TOP_SPEED / speed
    vz *= TOW_TOP_SPEED / speed
  }
  return { ...kart, vx, vz }
}

/**
 * A swap: the kart put where the other was, facing its way at its own speed, with the other's count
 * of gates. Counted as a reset, so that the frame says it is a jump and the camera starts behind it
 */
export function warpRun(run: Run, warp: Warp, track: Track): Run {
  const speed = Math.hypot(run.kart.vx, run.kart.vz)
  return {
    ...run,
    kart: {
      ...run.kart,
      x: warp.x,
      z: warp.z,
      heading: warp.heading,
      vx: Math.sin(warp.heading) * speed,
      vz: -Math.cos(warp.heading) * speed,
      drifting: false,
      driftDirection: 0,
    },
    nextGate: warp.nextGate,
    crossings: warp.crossings,
    safe: safeBehind(track, warp.nextGate),
    candidate: null,
    candidateSeconds: 0,
    resets: run.resets + 1,
  }
}

/** The top speed while stunned by a shot (e9-t06b), m/s */
export const STUN_TOP_SPEED = KART_TUNING.topSpeed * SHOT_TUNING.stunTopFactor

/**
 * A stunned step (e9-t06b, hit by a shot): every boost lost, and the speed brought down
 * hard to the stun's top. Harsher than a headwind, and shorter
 */
export function stunStep(kart: KartState, seconds: number): KartState {
  const speed = Math.hypot(kart.vx, kart.vz)
  const calm =
    kart.boostSeconds === 0 &&
    kart.miniSeconds === 0 &&
    kart.stackSeconds === 0 &&
    (kart.teamSeconds ?? 0) === 0
  if (speed <= STUN_TOP_SPEED && calm) return kart
  const share =
    speed > STUN_TOP_SPEED
      ? Math.max(STUN_TOP_SPEED / speed, 1 - SHOT_TUNING.stunDrag * seconds)
      : 1
  return {
    ...kart,
    vx: kart.vx * share,
    vz: kart.vz * share,
    boostSeconds: 0,
    miniSeconds: 0,
    stackSeconds: 0,
    // A team boost (a team race) is blown out with the rest
    ...(kart.teamSeconds ? { teamSeconds: 0 } : {}),
  }
}
