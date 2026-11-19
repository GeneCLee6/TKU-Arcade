// What the classic feel's techniques are worth, against the arcade (old) preset: a novice, an
// average driver and an expert (scripts/kart/drivers.ts: people's hands, mistakes and all), three
// laps of every built-in track. The boost cover is the share of the race spent in any boost: the
// owner's targets are 70% or more for the expert, 15% or less for the novice, 30 to 45% between
// (docs/KART-FEEL.md §5).
// 2026-11-19: and a fourth driver, the master, who knows a track by heart (its guide: shared/kart/
// tracks/guide.ts); the line under each track with a guide is what that is worth.
// Run: npm run kart:feel   (-- --seeds 5: the mean of five races each; -- --classic: skip the old preset)
import { ARCADE_TUNING, KART_TUNING } from '../shared/kart/physics.ts'
import { trackGuide } from '../shared/kart/tracks/guides.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { DRIVER_IDS, type Measure } from './kart/drivers.ts'
import { FEEL_DRIVERS, FEEL_TRACKS, feelRace } from './kart/feel.ts'
import { roadShape } from './kart/shape.ts'

const seedsAt = process.argv.indexOf('--seeds')
const SEEDS = seedsAt > 0 ? Math.max(1, Number(process.argv[seedsAt + 1]) || 1) : 3

// 2026-11-18: each track's shape too (scripts/kart/shape.ts): how long it is, how much of it drives
// as a straight, its longest straight and how often it changes the way it turns
console.log('track       length   straight  longest straight  changes of direction')
for (const id of FEEL_TRACKS) {
  const shape = roadShape(raceTrack(id)!.road)
  console.log(
    `${id.padEnd(12)}${`${shape.length.toFixed(0)} m`.padEnd(9)}${`${(shape.straightShare * 100).toFixed(0)}%`.padEnd(10)}${`${shape.longestStraight.toFixed(0)} m`.padEnd(18)}${shape.flips}`,
  )
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length
const pct = (share: number) => `${(share * 100).toFixed(0)}%`

const FEELS = [
  ['classic', KART_TUNING],
  ['arcade (old)', ARCADE_TUNING],
] as const
// --classic: the classic feel only (half the time)
for (const [name, tuning] of process.argv.includes('--classic') ? FEELS.slice(0, 1) : FEELS) {
  console.log(`\n${name}: the mean of ${SEEDS} race${SEEDS > 1 ? 's' : ''} each, three laps`)
  console.log(
    'track       driver   time     cover  charge  fired  dashes (perfect/good/late)  combo  crashes  resets',
  )
  for (const id of FEEL_TRACKS) {
    const rows = DRIVER_IDS.map((who) => {
      const runs: Measure[] = []
      for (let seed = 1; seed <= SEEDS; seed++) {
        runs.push(feelRace(id, FEEL_DRIVERS[who], tuning, seed * 7))
      }
      const of = (pick: (run: Measure) => number) => mean(runs.map(pick))
      return {
        who,
        finished: runs.every((run) => run.finished),
        seconds: of((run) => run.seconds),
        cover: of((run) => run.cover),
        charge: of((run) => run.charge),
        fired: of((run) => run.fired),
        dashes: of((run) => run.dashes),
        perfect: of((run) => run.perfect),
        good: of((run) => run.good),
        late: of((run) => run.late),
        combo: Math.max(...runs.map((run) => run.combo)),
        crashes: of((run) => run.crashes),
        resets: of((run) => run.resets),
      }
    })
    for (const row of rows) {
      console.log(
        `${id.padEnd(12)}${row.who.padEnd(9)}${`${row.seconds.toFixed(1)}${row.finished ? '' : '!'}`.padEnd(9)}${pct(row.cover).padEnd(7)}${pct(row.charge).padEnd(8)}${row.fired.toFixed(1).padEnd(7)}${`${row.dashes.toFixed(1)} (${row.perfect.toFixed(1)}/${row.good.toFixed(1)}/${row.late.toFixed(1)})`.padEnd(28)}${String(row.combo).padEnd(7)}${row.crashes.toFixed(1).padEnd(9)}${row.resets.toFixed(1)}`,
      )
    }
    const [novice, , expert, master] = rows
    const gap = novice!.seconds - expert!.seconds
    console.log(
      `${''.padEnd(12)}expert vs novice: ${gap.toFixed(1)} s faster (${((gap / novice!.seconds) * 100).toFixed(0)}% less time; the novice takes ${((gap / expert!.seconds) * 100).toFixed(0)}% longer)`,
    )
    // 2026-11-19: the skilled driver (the expert: drives well, does not know the track) against
    // the top one (the master: the technical line, the slots, the drift jumps). On a track
    // without a guide the two are the same driver
    const known = expert!.seconds - master!.seconds
    if (trackGuide(id)) {
      console.log(
        `${''.padEnd(12)}master vs expert: ${known.toFixed(1)} s faster (${((known / expert!.seconds) * 100).toFixed(1)}% less time): what knowing the track is worth`,
      )
    }
  }
}
