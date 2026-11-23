// 2026-11-23 (docs/KART-FEEL.md §13.5): the bends one after another the other way (the S-bends of
// Guanyin, the mangroves and Datun, both ways round), where the hard and expert computer karts used
// to hit the wall most. Three laps of each, two seeds: home, never the wrong way, never put back on
// the road (stuck or turned round), and the hard hits few. And the habit (skill.esses) is the
// computer karts' own: the scripted drivers that weigh the medals (drivers.ts) leave it out.
import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { DRIVERS } from '../../src/kart/bots/drivers.ts'
import { EXPERT_SKILL } from '../../src/kart/bots/expert.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'

const TRACKS = ['guanyin', 'mangrove', 'datun', 'guanyin-rev', 'mangrove-rev', 'datun-rev']
const LEVELS = ['hard', 'expert'] as const
const SEEDS = [1, 2]

describe.each(TRACKS)('the hard and expert computer karts through the S-bends of %s', (id) => {
  it('finish three laps, never the wrong way, never put back, seldom into the wall', () => {
    const track = raceTrack(id)!
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    for (const level of LEVELS) {
      let crashes = 0
      for (const seed of SEEDS) {
        const skill = BOT_SKILLS[level]
        const brain = createTrackBrain(skill, track, KART_TUNING, seed)
        let trial = startTrial(course)
        let wrongWays = 0
        for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
          const before = trial
          trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
          if (trial.wrongWay && !before.wrongWay) wrongWays++
          if (trial.phase === 'racing' && trial.run.hitSpeed >= KART_TUNING.wallBreakSpeed) crashes++
        }
        const label = `${level} ${seed}`
        expect(trial.phase, label).toBe('finished')
        expect(trial.laps, label).toHaveLength(3)
        expect(wrongWays, label).toBe(0)
        // A reset is the bot stuck against a wall or turned round (brain.ts)
        expect(trial.run.resets, label).toBe(0)
      }
      // Measured 2026-11-23 (npm run kart:bots, five seeds): at most 3 a race on these, 0 on most
      // (before the habit: 2 to 9)
      expect(crashes / SEEDS.length, level).toBeLessThanOrEqual(6)
    }
  }, 120_000)
})

describe('the S-bends habit', () => {
  it('is the hard and expert computer karts own, not the scripted drivers', () => {
    expect(BOT_SKILLS.hard.esses).toBe(true)
    expect(EXPERT_SKILL.esses).toBe(true)
    expect(BOT_SKILLS.easy.esses).toBeFalsy()
    expect(BOT_SKILLS.normal.esses).toBeFalsy()
    for (const driver of Object.values(DRIVERS)) expect(driver.skill.esses).toBeFalsy()
  })
})
