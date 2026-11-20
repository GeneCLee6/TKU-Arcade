// 2026-11-20 (docs/KART-PERF.md): dynamic resolution. A phone that cannot keep up draws fewer pixels
// rather than fewer frames: over each second of frames, a mean below LOW_FPS takes the pixel ratio a
// step down (to no less than MIN_SHARE of the quality's own), and some seconds of a steady frame rate
// take it a step back up, but never to a ratio that was too slow for a while after (so that it
// does not seesaw). A machine that keeps up never leaves the quality's own ratio: the picture on high
// is exactly as it was. Pure: Scene.ts applies the ratio.

/** Frames a second below which the picture gets smaller */
export const LOW_FPS = 50
/** Frames a second at or above which it may grow again */
export const STEADY_FPS = 57
/** Seconds of steady frames before a step up */
const STEADY_SECONDS = 4
/** How long a ratio found too slow stays out of reach, seconds */
const BLOCK_SECONDS = 30
/** A step down or up, as a share of the ratio */
const STEP = 0.85
/** The smallest ratio, as a share of the quality's own */
export const MIN_SHARE = 0.6
/** A frame longer than this (the tab hidden, a stall) is not counted */
const HITCH_SECONDS = 0.25

export interface Resolution {
  /** The quality's own pixel ratio, the most */
  readonly top: number
  /** The pixel ratio to draw at now */
  readonly ratio: number
  /** Frames and seconds counted towards this second */
  readonly frames: number
  readonly seconds: number
  /** Seconds in a row at a steady frame rate */
  readonly steady: number
  /** A ratio found too slow, and how many more seconds it stays out of reach */
  readonly ceiling: number
  readonly blocked: number
}

export const startResolution = (top: number): Resolution => ({
  top,
  ratio: top,
  frames: 0,
  seconds: 0,
  steady: 0,
  ceiling: Infinity,
  blocked: 0,
})

const round = (ratio: number) => Math.round(ratio * 100) / 100

/** After a frame that took `frameSeconds` */
export function nextResolution(state: Resolution, frameSeconds: number): Resolution {
  if (!(frameSeconds > 0) || frameSeconds > HITCH_SECONDS) return state
  const frames = state.frames + 1
  const seconds = state.seconds + frameSeconds
  if (seconds < 1) return { ...state, frames, seconds }
  const fps = frames / seconds
  const blocked = Math.max(0, state.blocked - seconds)
  const ceiling = blocked > 0 ? state.ceiling : Infinity
  const floor = round(state.top * MIN_SHARE)
  const fresh = { ...state, frames: 0, seconds: 0, blocked, ceiling }
  if (fps < LOW_FPS) {
    if (state.ratio <= floor) return { ...fresh, steady: 0 }
    return {
      ...fresh,
      ratio: Math.max(floor, round(state.ratio * STEP)),
      steady: 0,
      // The ratio just left was too slow: not again for a while
      ceiling: state.ratio,
      blocked: BLOCK_SECONDS,
    }
  }
  if (fps < STEADY_FPS || state.ratio >= state.top) return { ...fresh, steady: 0 }
  const steady = state.steady + seconds
  if (steady < STEADY_SECONDS) return { ...fresh, steady }
  // (Within a hair of the top, the top itself: the steps are rounded)
  const raised = round(state.ratio / STEP)
  const up = raised >= state.top - 0.03 ? state.top : raised
  if (up >= ceiling - 0.03) return { ...fresh, steady: 0 }
  return { ...fresh, ratio: up, steady: 0 }
}
