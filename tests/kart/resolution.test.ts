import { describe, expect, it } from 'vitest'
import { MIN_SHARE, nextResolution, startResolution, type Resolution } from '../../src/kart/resolution.ts'

/** `seconds` of frames at `fps` */
function run(state: Resolution, fps: number, seconds: number): Resolution {
  let next = state
  for (let frame = 0; frame < Math.round(fps * seconds); frame++) next = nextResolution(next, 1 / fps)
  return next
}

describe('dynamic resolution (docs/KART-PERF.md)', () => {
  it('never leaves the quality’s own ratio while the frames keep up', () => {
    expect(run(startResolution(2), 60, 30).ratio).toBe(2)
    expect(run(startResolution(1.5), 120, 30).ratio).toBe(1.5)
  })

  it('steps down while the frames are slow, to no less than its floor', () => {
    const slower = run(startResolution(1.5), 40, 1.05)
    expect(slower.ratio).toBeLessThan(1.5)
    const floor = run(startResolution(1.5), 20, 60)
    expect(floor.ratio).toBe(Math.round(1.5 * MIN_SHARE * 100) / 100)
  })

  it('steps back up after steady seconds, but not to a ratio just found too slow', () => {
    const down = run(startResolution(1.5), 40, 1.05)
    // Steady at once: the ratio that was too slow stays out of reach for a while
    expect(run(down, 60, 10).ratio).toBe(down.ratio)
    // Long after, it is tried again
    expect(run(down, 60, 40).ratio).toBe(1.5)
  })

  it('does not count a hitch (a hidden tab, a stall)', () => {
    let state = startResolution(1)
    for (let i = 0; i < 20; i++) state = nextResolution(state, 2)
    expect(state.ratio).toBe(1)
    expect(state.frames).toBe(0)
  })
})
