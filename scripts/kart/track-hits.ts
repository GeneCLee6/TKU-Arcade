// A design aid (2026-11-18): where on a built-in track the feel drivers (scripts/kart/feel.ts) lose
// speed against a wall and where the expert earns its instant boosts, by road point, over three
// laps: the corners that tell the drivers apart, and the ones that are only unfair.
// Run: node --experimental-strip-types scripts/kart/track-hits.ts <id> [seed]
import { KART_TUNING } from '../../shared/kart/physics.ts'
import {
  nearestRoadPoint,
  seconds,
  startTrial,
  stepTrial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { FEEL_DRIVERS } from './feel.ts'

const [id, seedText] = process.argv.slice(2)
const seed = Number(seedText ?? 7)
const track = raceTrack(id!)!
const plain = courseOf(track)
const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
for (const name of ['novice', 'average', 'expert'] as const) {
  // The driver's skill alone: the plain computer hands, without a person's mistakes
  const { skill } = FEEL_DRIVERS[name]
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
  const hits: number[] = []
  const dashes: number[] = []
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial.run.kart
    trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course, KART_TUNING)
    const { kart } = trial.run
    const at = nearestRoadPoint(track.road, kart.x, kart.z)
    if (kart.miniSeconds > before.miniSeconds) dashes.push(at)
    const v0 = Math.hypot(before.vx, before.vz)
    if (v0 > 20 && Math.hypot(kart.vx, kart.vz) < v0 * 0.8) hits.push(at)
  }
  const sorted = (list: number[]) => [...list].sort((a, b) => a - b).join(' ')
  console.log(`${name.padEnd(8)} ${seconds(trial.steps).toFixed(1)} s`)
  console.log(`  hits   ${sorted(hits)}`)
  console.log(`  dashes ${sorted(dashes)}`)
}
