// 2026-11-23 (#131, docs/ARCHITECTURE.md §4.90): every reversed track is driven by the computer karts
// at every difficulty, two seeds each, three laps: home, never the wrong way, never stuck. And a race
// of computer karts in a room judged by the race room's own rules (the Worker's judgeFrame), on a
// reversed track with branches and one with moving obstacles.
import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { REVERSE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { botSeats, createBotRace } from '../../src/kart/bots/botRace.ts'
import { createLocalRoom } from '../../src/kart/bots/localRoom.ts'
import { drawBots } from '../../src/kart/bots/roster.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES } from '../../src/kart/bots/skill.ts'

const SEEDS = [1, 2]

describe.each(REVERSE_TRACK_IDS)('bots alone on %s', (id) => {
  it('finish three laps at every difficulty, never the wrong way', () => {
    const track = raceTrack(id)!
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const skill = BOT_SKILLS[difficulty]
        const brain = createTrackBrain(skill, track, KART_TUNING, seed)
        let trial = startTrial(course)
        let wrongWays = 0
        for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
          const before = trial
          trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
          if (trial.wrongWay && !before.wrongWay) wrongWays++
        }
        expect(trial.phase, `${difficulty} ${seed}`).toBe('finished')
        expect(trial.laps).toHaveLength(3)
        expect(wrongWays, `${difficulty} ${seed}`).toBe(0)
      }
    }
  }, 120_000)
})

describe('a race of bots in a room, on a reversed track', () => {
  it.each(['works-rev', 'harbour-rev'])('the room judges an item race on %s to its end', (id) => {
    let now = 1_000_000
    const track = raceTrack(id)!
    const room = createLocalRoom({ seats: 4, options: { track: id, laps: 3, mode: 'items' }, seed: 7, now: () => now })
    expect(room.state().track).toBe(id)
    const race = createBotRace({
      room,
      track,
      laps: 3,
      bots: botSeats(drawBots(4, 7), 0, 'normal'),
      players: [],
      seed: 7,
      now,
    })
    for (let ms = 0; room.state().phase !== 'finished' && ms < 10 * 60_000; ms += 50) {
      now += 50
      race.advance(now)
    }
    const state = room.state()
    expect(state.phase).toBe('finished')
    expect(state.racers.some((racer) => racer.finishMs !== null && racer.lapMs.length === 3)).toBe(true)
    race.stop()
  }, 60_000)
})
