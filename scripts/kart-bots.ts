// 2026-11-22 (docs/KART-FEEL.md §13.5): how the computer karts drive, measured. Two tables:
//
// - alone: each level (`--levels hard,expert`) three laps of every built-in track in the standard
//   kart, seeds 1 to 5 (the measure of `npm run kart:feel`, scripts/kart/drivers.ts, with steady
//   hands): the race time and the hard hits on a wall (the ones that halve the gauge);
// - a team race (`--team`): six computer karts of one level, three laps, sunset against estuary,
//   seeds 7, 14, 21: how many charges they fired, and how many of those blue.
//
// Run: npm run kart:bots   (-- --levels hard: one level; -- --tracks harbour,fort: those tracks;
// -- --seeds 3: fewer seeds; -- --team: the team table too; -- --only-team: only that)
import { KART_TUNING } from '../shared/kart/physics.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import type { KartState } from '../shared/kart/physics.ts'
import { BOT_SKILLS, isDifficulty, type Difficulty } from '../src/kart/bots/skill.ts'
import { STEADY_HANDS } from '../src/kart/bots/drivers.ts'
import { FEEL_TRACKS } from './kart/feel.ts'
import { measure } from './kart/drivers.ts'

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(name)
  return at > 0 ? process.argv[at + 1] : undefined
}
const LEVELS = (arg('--levels') ?? 'hard,expert').split(',').filter(isDifficulty) as Difficulty[]
const TRACKS = arg('--tracks')?.split(',') ?? [...FEEL_TRACKS]
const SEED_COUNT = Math.max(1, Number(arg('--seeds')) || 5)
const ONLY_TEAM = process.argv.includes('--only-team')
const TEAM = ONLY_TEAM || process.argv.includes('--team')

// The room of this browser and the bots' race, loaded by a path the node project does not follow:
// they name the page's types (the room's connection), which this project has no DOM for
interface TeamRoom {
  state(): { phase: string }
}
interface TeamBots {
  advance(now: number): void
  bots(): readonly { seat: number; trial: { run: { kart: KartState } } }[]
  stop(): void
}
const load = (path: string) => import(path)
const { createLocalRoom } = (await load('../src/kart/bots/localRoom.ts')) as {
  createLocalRoom(options: object): TeamRoom
}
const { botSeats, createBotRace } = (await load('../src/kart/bots/botRace.ts')) as {
  botSeats(entries: readonly object[], first: number, level: Difficulty): readonly object[]
  createBotRace(options: object): TeamBots
}
const { drawBots } = (await load('../src/kart/bots/roster.ts')) as {
  drawBots(count: number, seed: number): readonly object[]
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length

if (!ONLY_TEAM) {
  console.log(`alone: three laps, the standard kart, the mean of seeds 1-${SEED_COUNT}`)
  console.log(`track       ${LEVELS.map((level) => `${level} s / crashes`.padEnd(22)).join('')}`)
  const sums = LEVELS.map(() => ({ seconds: 0, crashes: 0 }))
  for (const id of TRACKS) {
    const track = raceTrack(id)!
    const cells = LEVELS.map((level, at) => {
      const runs = Array.from({ length: SEED_COUNT }, (_, seed) =>
        measure(track, { skill: BOT_SKILLS[level], hands: STEADY_HANDS }, KART_TUNING, seed + 1),
      )
      const seconds = mean(runs.map((run) => (run.finished ? run.seconds : 400)))
      const crashes = mean(runs.map((run) => run.crashes))
      sums[at]!.seconds += seconds
      sums[at]!.crashes += crashes
      return `${seconds.toFixed(2)} / ${crashes.toFixed(1)}`.padEnd(22)
    })
    console.log(`${id.padEnd(12)}${cells.join('')}`)
  }
  console.log(
    `${'total'.padEnd(12)}${sums.map(({ seconds, crashes }) => `${seconds.toFixed(2)} / ${crashes.toFixed(1)}`.padEnd(22)).join('')}`,
  )
}

if (TEAM) {
  console.log('\na team race: six computer karts, three laps, seeds 7/14/21; charges fired, of them blue')
  console.log(`track       ${LEVELS.map((level) => `${level} fired / blue`.padEnd(22)).join('')}`)
  const sums = LEVELS.map(() => ({ fired: 0, blue: 0 }))
  for (const id of TRACKS) {
    const cells = LEVELS.map((level, at) => {
      let fired = 0
      let blue = 0
      for (const seed of [7, 14, 21]) {
        const one = teamRace(id, level, seed)
        fired += one.fired
        blue += one.blue
      }
      sums[at]!.fired += fired
      sums[at]!.blue += blue
      return `${fired} / ${blue} (${((blue / Math.max(1, fired)) * 100).toFixed(0)}%)`.padEnd(22)
    })
    console.log(`${id.padEnd(12)}${cells.join('')}`)
  }
  console.log(
    `${'total'.padEnd(12)}${sums.map(({ fired, blue }) => `${fired} / ${blue} (${((blue / Math.max(1, fired)) * 100).toFixed(0)}%)`.padEnd(22)).join('')}`,
  )
}

/** Six bots of `level` in a team race of this browser's room: the charges they fired, and the blue ones */
function teamRace(id: string, level: Difficulty, seed: number): { fired: number; blue: number } {
  let now = 1_000_000
  const room = createLocalRoom({
    seats: 6,
    options: { track: id, laps: 3, mode: 'race', teams: 'teams' },
    seed,
    now: () => now,
  })
  const race = createBotRace({
    room,
    track: raceTrack(id)!,
    laps: 3,
    bots: botSeats(drawBots(6, seed), 0, level),
    players: [],
    seed,
    now,
  })
  let fired = 0
  let blue = 0
  const last = new Map<number, { stored: number; boost: number; team: number }>()
  // One step at a time, so that no fire is missed between two looks
  for (let step = 0; room.state().phase !== 'finished' && step < 10 * 60 * 60; step++) {
    now += 1000 / 60
    race.advance(now)
    for (const bot of race.bots()) {
      const kart = bot.trial.run.kart
      const was = last.get(bot.seat)
      const team = kart.teamSeconds ?? 0
      if (was) {
        if (team > was.team + 1e-6) {
          fired++
          blue++
        } else if (kart.boostSeconds > was.boost + 1e-6 && kart.storedBoosts < was.stored) fired++
      }
      last.set(bot.seat, { stored: kart.storedBoosts, boost: kart.boostSeconds, team })
    }
  }
  race.stop()
  return { fired, blue }
}
