// A design aid (2026-11-18): the three computer difficulties and the feel drivers' pursuit (without
// their hands' mistakes: scripts/kart/drivers.ts and `npm run kart:feel` have those), three laps of a
// built-in track each: whether they finish, how long they take, and how often they were told they
// were going the wrong way or had to be put back on the road.
// Run: node --experimental-strip-types scripts/kart/track-check.ts <id> [seed]
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { BOT_SKILLS, type BotSkill } from '../../src/kart/bots/skill.ts'
import { FEEL_DRIVERS } from './feel.ts'

const [id, seedText] = process.argv.slice(2)
const seed = Number(seedText ?? 7)
const track = raceTrack(id!)!
const plain = courseOf(track)
const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
const drivers: [string, BotSkill][] = [
  ['easy', BOT_SKILLS.easy],
  ['normal', BOT_SKILLS.normal],
  ['hard', BOT_SKILLS.hard],
  ['expert-cpu', BOT_SKILLS.expert],
  ['novice', FEEL_DRIVERS.novice.skill],
  ['average', FEEL_DRIVERS.average.skill],
  ['expert', FEEL_DRIVERS.expert.skill],
]
for (const [name, skill] of drivers) {
  const brain = createBotBrain(
    skill,
    track.road,
    KART_TUNING,
    seed,
    track.jumps,
    track.walls,
    trackGuide(track.id),
  )
  let trial = startTrial(course)
  let wrong = 0
  let resets = 0
  let dashes = 0
  let hits = 0
  const wrongAt: string[] = []
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial
    const input = brain(trial, { speedShare: skill.topSpeedShare })
    if (input.reset) {
      resets++
      wrongAt.push(`reset@${trial.run.kart.x.toFixed(0)},${trial.run.kart.z.toFixed(0)}`)
    }
    trial = stepTrial(trial, input, course, KART_TUNING)
    if (trial.wrongWay && !before.wrongWay) {
      wrong++
      wrongAt.push(`wrong@${trial.run.kart.x.toFixed(0)},${trial.run.kart.z.toFixed(0)}`)
    }
    if (trial.run.kart.miniSeconds > before.run.kart.miniSeconds) dashes++
    const v0 = Math.hypot(before.run.kart.vx, before.run.kart.vz)
    const v1 = Math.hypot(trial.run.kart.vx, trial.run.kart.vz)
    if (v0 > 20 && v1 < v0 * 0.8) hits++
  }
  console.log(
    `${name.padEnd(8)} ${trial.phase === 'finished' ? 'ok ' : 'DNF'} ${seconds(trial.steps).toFixed(1).padStart(6)} s  wrong ${wrong} resets ${resets} dashes ${dashes} hits ${hits} ${wrongAt.slice(0, 6).join(' ')}`,
  )
}
