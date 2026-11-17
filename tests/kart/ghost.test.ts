import { beforeEach, describe, expect, it } from 'vitest'
import {
  finishRecording,
  ghostAt,
  GHOST_STEPS,
  parseGhost,
  recordStep,
  startRecording,
} from '../../shared/kart/ghost.ts'
import type { KartId } from '../../shared/kart/karts.ts'
import {
  keepIfBetter,
  loadBestLap,
  loadGhost,
  loadGhostPick,
  loadKartBestLap,
  loadKartGhost,
  saveGhostPick,
} from '../../src/kart/records.ts'

// e8-t11 (AC-8.4): the best run, recorded, played back and kept

function straightRun(total: number, speed: number) {
  const recorder = startRecording('test-oval')
  for (let step = 0; step <= total; step++)
    recordStep(recorder, step, { x: 0, z: -step * speed, heading: 0 })
  return finishRecording(recorder, total, [total])
}

describe('the ghost', () => {
  it('keeps one sample every few steps, and plays back between them', () => {
    const ghost = straightRun(60, 0.5)
    expect(ghost.samples).toHaveLength((60 / GHOST_STEPS + 1) * 3)
    expect(ghostAt(ghost, 0)).toEqual({ x: 0, z: 0, heading: 0 })
    // Between two samples: in between
    expect(ghostAt(ghost, 4)!.z).toBeCloseTo(-2)
    // After the finish it waits where it finished
    expect(ghostAt(ghost, 600)!.z).toBeCloseTo(-30)
  })

  it('turns the short way across ±π', () => {
    const recorder = startRecording('test-oval')
    recordStep(recorder, 0, { x: 0, z: 0, heading: 3.1 })
    recordStep(recorder, 3, { x: 0, z: 0, heading: -3.1 })
    const ghost = finishRecording(recorder, 3, [3])
    const between = ghostAt(ghost, 1.5)!.heading
    expect(Math.abs(Math.abs(between) - Math.PI)).toBeLessThan(0.05)
  })

  it('refuses what storage gives back when it is not a ghost of this track', () => {
    const ghost = straightRun(30, 1)
    const json = JSON.parse(JSON.stringify(ghost))
    expect(parseGhost(json, 'test-oval')).toEqual(ghost)
    expect(parseGhost(json, 'riverside')).toBeNull()
    expect(parseGhost({ ...json, samples: [1, 2] }, 'test-oval')).toBeNull()
    expect(parseGhost({ ...json, samples: ['a', 2, 3] }, 'test-oval')).toBeNull()
    expect(parseGhost({ ...json, total: -1 }, 'test-oval')).toBeNull()
    expect(parseGhost(null, 'test-oval')).toBeNull()
  })
})

describe('the records', () => {
  beforeEach(() => localStorage.clear())

  it('keep the faster run and the faster lap, apart', () => {
    const first = { ...straightRun(30, 1), total: 900, laps: [320, 290, 290] }
    expect(keepIfBetter(first)).toMatchObject({
      bestRun: true,
      bestLap: true,
      runSteps: 900,
      lapSteps: 290,
    })
    // Slower overall, one faster lap
    const second = { ...first, total: 950, laps: [300, 280, 370] }
    expect(keepIfBetter(second)).toMatchObject({
      bestRun: false,
      bestLap: true,
      runSteps: 900,
      lapSteps: 280,
    })
    expect(loadGhost('test-oval')?.total).toBe(900)
    expect(loadBestLap('test-oval')).toBe(280)
    expect(loadGhost('riverside')).toBeNull()
  })

  it('shrug off a broken entry', () => {
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', '{not json')
    expect(loadGhost('test-oval')).toBeNull()
  })
})

// 2026-11-17 (docs/ARCHITECTURE.md §4.23): the records of each kart, beside the track's overall ones
describe('each kart’s records', () => {
  beforeEach(() => localStorage.clear())

  const run = (total: number, laps: number[], kart?: KartId) => ({
    ...straightRun(30, 1),
    total,
    laps,
    ...(kart ? { kart } : {}),
  })

  it('keep the overall best and each kart’s best apart', () => {
    expect(keepIfBetter(run(900, [300, 300, 300], 'heron'))).toMatchObject({
      bestRun: true,
      kartBestRun: true,
      kartRunSteps: 900,
    })
    // A slower kart: not the track's record, but its own
    expect(keepIfBetter(run(960, [330, 310, 320], 'tide'))).toMatchObject({
      bestRun: false,
      runSteps: 900,
      kartBestRun: true,
      kartRunSteps: 960,
      kartBestLap: true,
      kartLapSteps: 310,
    })
    // The same kart, slower than its own: nothing new
    expect(keepIfBetter(run(990, [330, 330, 330], 'tide'))).toMatchObject({
      bestRun: false,
      kartBestRun: false,
      kartRunSteps: 960,
    })
    expect(loadGhost('test-oval')).toMatchObject({ total: 900, kart: 'heron' })
    expect(loadKartGhost('test-oval', 'tide')).toMatchObject({ total: 960, kart: 'tide' })
    expect(loadKartGhost('test-oval', 'heron')?.total).toBe(900)
    expect(loadKartGhost('test-oval', 'crab')).toBeNull()
    expect(loadKartBestLap('test-oval', 'tide')).toBe(310)
    expect(loadBestLap('test-oval')).toBe(300)
  })

  it('leave a record kept before karts were told where it was: the overall best, its kart unknown', () => {
    // As e8-t11 kept it: under the track's id, with no kart
    const old = straightRun(30, 1)
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', JSON.stringify({ ...old, total: 900 }))
    localStorage.setItem('tku-arcade.kart.bestLap.test-oval', '290')
    const kept = loadGhost('test-oval')
    expect(kept?.total).toBe(900)
    expect(kept && 'kart' in kept).toBe(false)
    expect(loadBestLap('test-oval')).toBe(290)
    // Not handed to any kart: the standard kart has no record yet
    expect(loadKartGhost('test-oval', 'tide')).toBeNull()
    // A slower run keeps it, and starts the kart's own
    expect(keepIfBetter(run(950, [320, 310, 320], 'tide'))).toMatchObject({
      bestRun: false,
      runSteps: 900,
      bestLap: false,
      lapSteps: 290,
      kartBestRun: true,
    })
    expect(loadGhost('test-oval')?.total).toBe(900)
    // A faster one replaces it, and says which kart
    keepIfBetter(run(880, [300, 290, 290], 'crab'))
    expect(loadGhost('test-oval')).toMatchObject({ total: 880, kart: 'crab' })
  })

  it('work with any track key: a revision, a content hash', () => {
    for (const key of ['riverside@4', 'custom.9f86d081884c7d65', 'a.b.c']) {
      const ghost = { ...run(700, [700], 'ray'), track: key }
      keepIfBetter(ghost)
      expect(loadGhost(key)?.total).toBe(700)
      expect(loadKartGhost(key, 'ray')?.total).toBe(700)
    }
    // Keys of one track never reach another's
    expect(loadGhost('custom')).toBeNull()
    expect(loadKartGhost('c', 'ray')).toBeNull()
  })

  it('drop a kart the ghost names that is not one', () => {
    const json = JSON.parse(JSON.stringify(run(900, [300], 'tide')))
    expect(parseGhost(json, 'test-oval')?.kart).toBe('tide')
    expect(parseGhost({ ...json, kart: 'rocket' }, 'test-oval')).not.toHaveProperty('kart')
  })

  it('remember which ghost races along, the overall best unless told otherwise', () => {
    expect(loadGhostPick()).toBe('overall')
    saveGhostPick('kart')
    expect(loadGhostPick()).toBe('kart')
    localStorage.setItem('tku-arcade.kart.ghostPick', 'nonsense')
    expect(loadGhostPick()).toBe('overall')
  })
})
