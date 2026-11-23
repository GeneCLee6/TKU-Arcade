// 2026-11-23 (docs/ARCHITECTURE.md §4.91, owner: "a phone's 3D in the race room is a still picture
// with CSS swaying it, not live"): how often each 3D picture in the race room is drawn. A computer
// draws every picture at 30 a second. A phone draws them live too, but cheaply: at most 18 frames a
// second, each picture at a lower resolution (lobbyStage.ts), the one that matters most (the big
// picture of your own racer held upright, a racer who has just pressed Ready) every frame, the
// others every other frame; and if the drawing takes too long on this phone, the others less often
// still, until it keeps up. Pure, so that a test can read it.

/** A frame at most this often, ms: a computer, a phone */
export const FRAME_MS = { fast: 33, slow: 1000 / 18 } as const

/** On a phone, the drawing's own time a frame this pacing aims under, ms (a mid-range phone's share) */
export const SLOW_BUDGET_MS = 9

/** How much less often than every frame the quiet pictures are drawn at most */
export const MAX_STRIDE = 4

export interface Pacing {
  /** The quiet pictures are drawn every this many frames (1 to MAX_STRIDE, may be fractional) */
  readonly stride: number
  /** The drawing's time a frame, ms, averaged */
  readonly cost: number
}

export const START_PACING: Pacing = { stride: 2, cost: 0 }

/**
 * After a frame whose drawing took `ms`: the average, and the stride eased out when over the budget
 * and back in when well under it
 */
export function nextPacing(pacing: Pacing, ms: number, budget = SLOW_BUDGET_MS): Pacing {
  const cost = pacing.cost === 0 ? ms : pacing.cost * 0.85 + ms * 0.15
  let stride = pacing.stride
  if (cost > budget) stride = Math.min(MAX_STRIDE, stride * 1.04)
  else if (cost < budget * 0.5) stride = Math.max(2, stride * 0.98)
  return { stride, cost }
}

/**
 * Whether a picture is due this frame: a busy one (the big picture, a cheer) every frame; a quiet one
 * once every `stride` frames, the places taking turns so that the work is spread
 */
export function isDue(frame: number, slot: number, busy: boolean, stride: number): boolean {
  if (busy) return true
  const every = Math.max(1, Math.round(stride))
  return (frame + slot) % every === 0
}
