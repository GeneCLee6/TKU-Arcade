// 2026-11-21 (docs/KART-FEEL.md §19, docs/ARCHITECTURE.md §4.60): the challenge mode's medal times
// and mission paces, measured. Every built-in track and every challenge track is raced three laps by
// the drivers of `npm run kart:feel` (scripts/kart/drivers.ts: the average driver, the expert, the
// master who knows a track by heart), three seeds each; src/kart/challenge/medals.ts's `calibrate`
// turns the times into bronze, silver, gold and the hidden platinum. Then every mission that is
// driven alone is driven by the master (and the expert and the average driver, for the table): the
// master's pass (the expert's, where the master never passes) sets its stars. The result is written to src/kart/challenge/medalTable.ts.
// Run again whenever the physics or a track changes: npm run kart:medals   (-- --dry: print only)
import { writeFileSync } from 'node:fs'
import { KART_TUNING } from '../shared/kart/physics.ts'
import { CHALLENGE_TRACK_IDS } from '../shared/kart/tracks/challenge.ts'
import { trackGuide } from '../shared/kart/tracks/guides.ts'
import { RACE_TRACK_IDS } from '../shared/kart/tracks/list.ts'
import { createDriver } from '../src/kart/bots/drivers.ts'
import { missionTrack, runMission } from '../src/kart/challenge/headless.ts'
import { calibrate, type MedalTimes } from '../src/kart/challenge/medals.ts'
import { isRaceMission, MISSIONS } from '../src/kart/challenge/missions.ts'
import { DRIVERS, measure, type DriverId } from './kart/drivers.ts'

const SEEDS = [7, 14, 21]
const TRACKS = [...RACE_TRACK_IDS, ...CHALLENGE_TRACK_IDS]

const table: Record<string, MedalTimes> = {}
console.log(`${'track'.padEnd(13)}${'average'.padEnd(18)}${'expert'.padEnd(18)}${'master'.padEnd(18)}bronze  silver  gold    platinum`)
for (const id of TRACKS) {
  const track = missionTrack(id)
  const race = (who: DriverId) =>
    SEEDS.map((seed) => {
      const run = measure(track, DRIVERS[who], KART_TUNING, seed)
      return run.finished ? run.seconds : 400
    })
  const average = race('average')
  const expert = race('expert')
  const master = trackGuide(id) ? race('master') : expert
  const times = calibrate({ average, expert, master }, track.laps)
  table[id] = times
  const list = (values: readonly number[]) => values.map((one) => one.toFixed(1)).join('/').padEnd(18)
  console.log(
    `${id.padEnd(13)}${list(average)}${list(expert)}${list(master)}${String(times.bronze).padEnd(8)}${String(times.silver).padEnd(8)}${String(times.gold).padEnd(8)}${times.platinum}`,
  )
}

const paces: Record<string, number> = {}
console.log('\nmission       track        master (passed, seconds)  expert          average')
for (const mission of MISSIONS) {
  if (isRaceMission(mission)) continue
  const drive = (who: DriverId) =>
    SEEDS.map((seed) =>
      runMission(mission, (track, tuning) => createDriver(DRIVERS[who], track, tuning, seed), KART_TUNING, table),
    )
  const master = drive('master')
  const expert = drive('expert')
  // The master's slowest pass (the expert's where the master never passes): three stars are
  // within reach of a driver who knows the track
  const passes = master.some((one) => one.passed) ? master : expert
  const won = passes.filter((one) => one.passed)
  if (won.length > 0) paces[mission.id] = Math.max(...won.map((one) => one.seconds))
  const show = (runs: ReturnType<typeof drive>) => {
    const won = runs.filter((one) => one.passed)
    const why = runs.find((one) => !one.passed)?.judge.why
    return `${won.length}/${runs.length} ${won.length > 0 ? (won.reduce((sum, one) => sum + one.seconds, 0) / won.length).toFixed(1) : '-'}${why ? ` (${why})` : ''}`
  }
  console.log(
    `${mission.id.padEnd(14)}${mission.track.padEnd(13)}${show(master).padEnd(26)}${show(expert).padEnd(26)}${show(drive('average'))}`,
  )
}

const round = (value: number) => Math.round(value * 10) / 10
const body = `// Written by \`npm run kart:medals\` (scripts/kart-medals.ts): do not edit by hand. Measured with the
// drivers of \`npm run kart:feel\`, seeds ${SEEDS.join(', ')}, three laps of each track (docs/KART-FEEL.md §19).
import type { MedalTimes } from './medals.ts'

export const MEDAL_TABLE: Readonly<Record<string, MedalTimes>> = {
${Object.entries(table)
  .map(
    ([id, t]) =>
      `  ${/^[a-z]+$/.test(id) ? id : `'${id}'`}: { laps: ${t.laps}, bronze: ${t.bronze}, silver: ${t.silver}, gold: ${t.gold}, platinum: ${t.platinum} },`,
  )
  .join('\n')}
}

/**
 * The master's slowest pass of each mission driven alone (the expert's where the master never
 * passes), seconds from GO; none where neither does
 */
export const MISSION_PACE: Readonly<Record<string, number>> = {
${Object.entries(paces)
  .map(([id, seconds]) => `  ${id}: ${round(seconds)},`)
  .join('\n')}
}
`
if (process.argv.includes('--dry')) {
  console.log('\n(dry run: medalTable.ts left as it was)')
} else {
  writeFileSync(new URL('../src/kart/challenge/medalTable.ts', import.meta.url), body)
  console.log('\nwrote src/kart/challenge/medalTable.ts')
}
