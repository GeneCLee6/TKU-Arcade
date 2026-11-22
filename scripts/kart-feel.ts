// What the classic feel's techniques are worth, against the arcade (old) preset: a novice, an
// average driver and an expert (scripts/kart/drivers.ts: people's hands, mistakes and all), three
// laps of every built-in track. The boost cover is the share of the race spent in any boost: the
// owner's targets are 70% or more for the expert, 15% or less for the novice, 30 to 45% between
// (docs/KART-FEEL.md §5).
// 2026-11-19: and a fourth driver, the master, who knows a track by heart (its guide: shared/kart/
// tracks/guide.ts); the line under each track with a guide is what that is worth.
// Run: npm run kart:feel   (-- --seeds 5: the mean of five races each; -- --classic: skip the old preset;
// -- --karts: every vehicle with the same hands too, -- --only-karts: only that, -- --who expert: one driver,
// -- --vehicles swift,tide: only these vehicles; -- --school: the driving school's lessons instead)
import { isKartId, KART_IDS } from '../shared/kart/karts.ts'
import { trackLedges } from '../shared/kart/ledges.ts'
import { ARCADE_TUNING, KART_TUNING } from '../shared/kart/physics.ts'
import { trackGuide } from '../shared/kart/tracks/guides.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { DRIVER_IDS, type Driver, type Measure } from './kart/drivers.ts'
import { FEEL_DRIVERS, FEEL_TRACKS, feelRace, vehicleTable } from './kart/feel.ts'
import { roadShape } from './kart/shape.ts'
import { createDriver } from '../src/kart/bots/drivers.ts'
import { runLesson } from '../src/kart/school/headless.ts'
import { LESSON_IDS } from '../src/kart/school/lessons.ts'

const trackHasJumps = (id: string): boolean => {
  const track = raceTrack(id)
  return (track?.jumps?.length ?? 0) > 0 || (track?.forks ?? []).some((fork) => fork.jumps.length > 0)
}

const seedsAt = process.argv.indexOf('--seeds')
const SEEDS = seedsAt > 0 ? Math.max(1, Number(process.argv[seedsAt + 1]) || 1) : 3

// 2026-11-20 (--school, docs/KART-FEEL.md §17): every lesson of the driving school, each driver's
// hands, judged as the page judges a player (src/kart/school/): passed or not, the stars, the
// seconds from GO to the pass, the tries, and what went wrong most. The master passes every one
if (process.argv.includes('--school')) {
  console.log(`driving school: the mean of ${SEEDS} run${SEEDS > 1 ? 's' : ''} each (up to 5 tries)`)
  console.log('lesson    driver   passed  stars  seconds  tries  most often wrong')
  for (const id of LESSON_IDS) {
    for (const who of DRIVER_IDS) {
      const runs = Array.from({ length: SEEDS }, (_, at) =>
        runLesson(id, (track) => createDriver(FEEL_DRIVERS[who], track, KART_TUNING, (at + 1) * 7), KART_TUNING),
      )
      const passed = runs.filter((one) => one.passed)
      const mean = (values: readonly number[]) =>
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      const wrong = new Map<string, number>()
      for (const one of runs) {
        for (const [note, times] of Object.entries(one.judge.mistakes)) {
          wrong.set(note, (wrong.get(note) ?? 0) + times)
        }
      }
      const most = [...wrong].sort((a, b) => b[1] - a[1])[0]
      console.log(
        `${id.padEnd(10)}${who.padEnd(9)}${`${passed.length}/${runs.length}`.padEnd(8)}${mean(runs.map((one) => one.stars)).toFixed(1).padEnd(7)}${(passed.length > 0 ? mean(passed.map((one) => one.seconds)).toFixed(1) : '-').padEnd(9)}${mean(runs.map((one) => one.judge.attempts)).toFixed(1).padEnd(7)}${most ? `${most[0]} ×${most[1]}` : ''}`,
      )
    }
  }
  process.exit(0)
}

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
const ONLY_KARTS = process.argv.includes('--only-karts')
const CHOSEN = ONLY_KARTS ? [] : process.argv.includes('--classic') ? FEELS.slice(0, 1) : FEELS
for (const [name, tuning] of CHOSEN) {
  console.log(`\n${name}: the mean of ${SEEDS} race${SEEDS > 1 ? 's' : ''} each, three laps`)
  console.log(
    'track       driver   time     cover  charge  fired  dashes (perfect/good/late)  combo  crashes  resets',
  )
  for (const id of FEEL_TRACKS) {
    // The master is the expert where a track has no guide: not raced twice
    const rows = DRIVER_IDS.filter((who) => who !== 'master' || trackGuide(id)).map((who) => {
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
    if (master) {
      const known = expert!.seconds - master.seconds
      console.log(
        `${''.padEnd(12)}master vs expert: ${known.toFixed(1)} s faster (${((known / expert!.seconds) * 100).toFixed(1)}% less time): what knowing the track is worth`,
      )
    }
    // 2026-11-22: the master's timed landings (on a track without a guide the master is the expert
    // with the timed landing), and what they are worth against holding the
    // throttle through the air as everyone else does (docs/KART-FEEL.md §22)
    if (trackHasJumps(id)) {
      const plain = { ...FEEL_DRIVERS.master, skill: { ...FEEL_DRIVERS.master.skill, landTap: false } }
      const without = mean(
        Array.from({ length: SEEDS }, (_, at) => feelRace(id, plain, tuning, (at + 1) * 7).seconds),
      )
      const runs = Array.from({ length: SEEDS }, (_, at) => feelRace(id, FEEL_DRIVERS.master, tuning, (at + 1) * 7))
      const timed = mean(runs.map((run) => run.timedLandings))
      const top = mean(runs.map((run) => run.seconds))
      console.log(
        `${''.padEnd(12)}timed landings: ${timed.toFixed(1)} a race, ${(without - top).toFixed(2)} s (${(((without - top) / without) * 100).toFixed(2)}%) against holding the throttle through the air`,
      )
    }
  }
}

// 2026-11-23 (docs/KART-FEEL.md §26): what the high platforms are worth, track by track: the
// master flying onto them against the same master kept to the main road there (`platforms: false`),
// and the expert, who never goes for them. Each platform's least speed off its lip beside
if (!ONLY_KARTS) {
  const grounded: Driver = {
    ...FEEL_DRIVERS.master,
    skill: { ...FEEL_DRIVERS.master.skill, platforms: false },
  }
  console.log(`
high platforms (classic): the mean of ${SEEDS} race${SEEDS > 1 ? 's' : ''} each, three laps`)
  console.log('track       need (m/s)        master  platforms  kept off  saved          expert')
  for (const id of FEEL_TRACKS) {
    const track = raceTrack(id)!
    const ledges = trackLedges(track)
    if (ledges.length === 0) continue
    const of = (driver: Driver) =>
      Array.from({ length: SEEDS }, (_, at) => feelRace(id, driver, KART_TUNING, (at + 1) * 7))
    const up = of(FEEL_DRIVERS.master)
    const kept = mean(of(grounded).map((run) => run.seconds))
    const expert = mean(of(FEEL_DRIVERS.expert).map((run) => run.seconds))
    const top = mean(up.map((run) => run.seconds))
    console.log(
      `${id.padEnd(12)}${ledges.map((one) => one.need.toFixed(1)).join(' / ').padEnd(18)}${top.toFixed(1).padEnd(8)}${mean(up.map((run) => run.platforms)).toFixed(1).padEnd(11)}${kept.toFixed(1).padEnd(10)}${`${(kept - top).toFixed(1)} s (${(((kept - top) / kept) * 100).toFixed(1)}%)`.padEnd(15)}${expert.toFixed(1)}`,
    )
  }
}

// 2026-11-19 (--karts): the same hands in every vehicle (shared/kart/karts.ts). What a kart is worth
// is the spread of this table: no vehicle the quickest everywhere, none the slowest everywhere, and
// the whole spread small beside the gap between two drivers (docs/KART-FEEL.md §12)
if (process.argv.includes('--karts') || ONLY_KARTS) {
  const whoAt = process.argv.indexOf('--who')
  const chosen = DRIVER_IDS.filter((who) => whoAt < 0 || who === process.argv[whoAt + 1])
  const vehiclesAt = process.argv.indexOf('--vehicles')
  const vehicles =
    vehiclesAt > 0 ? (process.argv[vehiclesAt + 1] ?? '').split(',').filter(isKartId) : KART_IDS
  for (const who of chosen) {
    const table = vehicleTable(FEEL_DRIVERS[who], SEEDS, FEEL_TRACKS, vehicles)
    console.log(
      `\nevery vehicle, the ${who}: three laps, the mean of ${SEEDS}; seconds behind the quickest`,
    )
    console.log(
      `${'vehicle'.padEnd(10)}${table.tracks.map((id) => id.slice(0, 7).padEnd(8)).join('')}mean    race     wins  last`,
    )
    for (const row of table.rows) {
      console.log(
        `${`${row.kart}${row.finished ? '' : '!'}`.padEnd(10)}${row.behind.map((gap) => `+${gap.toFixed(1)}`.padEnd(8)).join('')}${`+${row.mean.toFixed(2)}`.padEnd(8)}${`${row.seconds.toFixed(1)} s`.padEnd(9)}${String(row.wins).padEnd(6)}${row.lasts}`,
      )
    }
    console.log(
      `spread of the means: ${table.spread.toFixed(2)} s (${(table.spreadShare * 100).toFixed(1)}% of a race)`,
    )
  }
}
