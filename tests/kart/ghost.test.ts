import { beforeEach, describe, expect, it } from 'vitest'
import {
  finishRecording,
  ghostAt,
  GHOST_STEPS,
  parseGhost,
  recordStep,
  startRecording,
} from '../../shared/kart/ghost.ts'
import { keepIfBetter, loadBestLap, loadGhost } from '../../src/kart/records.ts'

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
