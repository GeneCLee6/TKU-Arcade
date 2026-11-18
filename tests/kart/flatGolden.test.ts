import { describe, expect, it } from 'vitest'
import { TEST_ARENA } from '../../shared/kart/arena.ts'
import { startRun, stepRun, type Run } from '../../shared/kart/course.ts'
import {
  ARCADE_TUNING,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { startTrial, stepTrial, type Trial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'

// The flat tracks do not change (2026-11-17, slopes and jumps; docs/ARCHITECTURE.md §4.26). The
// hashes below were taken on main at 7f53e13, BEFORE the terrain came in: the same inputs on the four
// flat tracks (and the test yard) must give the very same trajectory, bit for bit, every step. If one
// of them changes, the physics of the flat tracks changed and every record and ghost with it.
//
// Then the classic feel (2026-11-17, docs/KART-FEEL.md) became the default: the hashes taken at
// 7f53e13 now lock the "arcade (old)" preset (ARCADE_TUNING), which must still drive exactly as it
// always did, and a second set locks the classic feel as it was signed in.

/** FNV-1a over the bytes of every number that matters in each step's state */
function hasher() {
  let hash = 0x811c9dc5
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  const add = (value: number) => {
    view.setFloat64(0, value, true)
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  return {
    kart(kart: KartState, run: Run) {
      for (const value of [
        kart.x,
        kart.z,
        kart.heading,
        kart.vx,
        kart.vz,
        kart.gauge,
        kart.storedBoosts,
        kart.boostSeconds,
        kart.miniSeconds,
        kart.traction,
        kart.driftSeconds,
        run.crossings,
        run.nextGate,
        run.resets,
      ]) {
        add(value)
      }
    },
    keys(kart: KartState) {
      // No new fields on a flat track's state, either
      for (const char of Object.keys(kart).join(',')) add(char.charCodeAt(0))
    },
    get value() {
      return hash.toString(16).padStart(8, '0')
    },
  }
}

/** The hard bot, three laps (or 200 s), every step hashed */
function trackHash(id: string, seed: number, tuning: KartTuning): { hash: string; steps: number } {
  const track = raceTrack(id)!
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const brain = createBotBrain(BOT_SKILLS.hard, track.road, tuning, seed)
  const hash = hasher()
  let trial: Trial = startTrial(course)
  let steps = 0
  for (; trial.phase !== 'finished' && steps < 200 * 60; steps++) {
    trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course, tuning)
    hash.kart(trial.run.kart, trial.run)
  }
  hash.keys(trial.run.kart)
  return { hash: hash.value, steps }
}

/** The test yard, a fixed script of inputs: drives, drifts, hits walls, boosts, resets */
function arenaHash(tuning: KartTuning): string {
  const hash = hasher()
  let run = startRun(TEST_ARENA)
  for (let step = 0; step < 60 * 40; step++) {
    const phase = Math.floor(step / 60) % 8
    const input: KartInput = {
      ...NO_INPUT,
      throttle: phase !== 5,
      brake: phase === 5,
      steer: phase === 2 || phase === 3 ? 1 : phase === 6 ? -0.6 : Math.sin(step / 37) * 0.3,
      drift: phase === 2 || phase === 6,
      boost: step % 97 === 0,
      reset: step % 900 === 899,
    }
    run = stepRun(run, input, TEST_ARENA, tuning)
    hash.kart(run.kart, run)
  }
  hash.keys(run.kart)
  return hash.value
}

const TRACKS = [
  ['riverside', 1],
  ['harbour', 2],
  ['tamkang', 3],
  ['oldstreet', 4],
] as const

describe('the arcade (old) preset is unchanged, on the flat tracks', () => {
  it.each(TRACKS)('%s: the hard bot drives the very same three laps', (id, seed) => {
    expect(trackHash(id, seed, ARCADE_TUNING)).toEqual(GOLDEN[id])
  })

  it('the test yard: the same scripted inputs give the same steps', () => {
    expect(arenaHash(ARCADE_TUNING)).toBe(GOLDEN_ARENA)
  })
})

describe('the classic feel is locked too', () => {
  it.each(TRACKS)('%s: the hard bot drives the very same three laps', (id, seed) => {
    expect(trackHash(id, seed, KART_TUNING)).toEqual(CLASSIC_GOLDEN[id])
  })

  it('the test yard: the same scripted inputs give the same steps', () => {
    expect(arenaHash(KART_TUNING)).toBe(CLASSIC_GOLDEN_ARENA)
  })
})

// Taken at 7f53e13 (before the terrain), by this file's own functions
const GOLDEN: Record<string, { hash: string; steps: number }> = {
  riverside: { hash: 'a317934d', steps: 6289 },
  harbour: { hash: '21ae7039', steps: 6160 },
  tamkang: { hash: '2f242f4e', steps: 6442 },
  oldstreet: { hash: '03b2e55f', steps: 5285 },
}
const GOLDEN_ARENA = '72389793'

// Taken when the classic feel came in (2026-11-17), by this file's own functions. When the classic
// feel is changed on purpose, take them again (and raise the built-in tracks' revisions). Taken
// again the same day: the instant boost fires only on a fresh press of the throttle and pulls
// harder, and the start boost lifts the top speed (the yard's script fires neither: unchanged).
// Taken again 2026-11-18 (owner: "it should take a big drift to boost ... one boost has to end before
// the next"): the drift is looser, the instant boost takes a deep and long drift, a boost cannot be
// fired while one runs, and the hard bot drifts deep and no longer taps down the straights
const CLASSIC_GOLDEN: Record<string, { hash: string; steps: number }> = {
  riverside: { hash: '0acf0140', steps: 6129 },
  harbour: { hash: 'a9bcf104', steps: 7069 },
  tamkang: { hash: 'd65550a9', steps: 7052 },
  oldstreet: { hash: '437d5977', steps: 6644 },
}
const CLASSIC_GOLDEN_ARENA = '5359be40'
