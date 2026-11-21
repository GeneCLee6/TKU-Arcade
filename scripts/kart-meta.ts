// 2026-11-21 (owner: "which kart is quickest on which track?"; docs/KART-META.md): every vehicle on
// every built-in track with the same hands, and what makes each track. Prints each track's traits,
// the quickest three (the season flagship aside), the flagship's lead and the fairness rule, and
// the lines shared/kart/meta.ts keeps for the garage.
// Run: npm run kart:meta   (-- --who master: the driver, master by default; -- --seeds 9: the median
// of nine races each; -- --jobs 6: tracks raced side by side, one process each; -- --vehicles a,b;
// -- --tracks a,b; -- --save out.json: keep the times; -- --load a.json,b.json: print saved times
// instead of racing). The whole table takes a few minutes with six jobs.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isKartId, KART_IDS, seasonFlagship, type KartId } from '../shared/kart/karts.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { DRIVER_IDS, type DriverId } from './kart/drivers.ts'
import { FEEL_DRIVERS, FEEL_TRACKS } from './kart/feel.ts'
import {
  fairness,
  flagshipLead,
  podiums,
  raceMatrix,
  ranking,
  trackTraits,
  winCounts,
  without,
  type Matrix,
} from './kart/meta.ts'

const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : undefined
}
const who = (DRIVER_IDS as readonly string[]).includes(option('who') ?? '')
  ? (option('who') as DriverId)
  : 'master'
const seeds = Math.max(1, Number(option('seeds')) || 9)
const jobs = Math.max(1, Number(option('jobs')) || 6)
const vehicles: readonly KartId[] = option('vehicles')?.split(',').filter(isKartId) ?? KART_IDS
const tracks: readonly string[] =
  option('tracks')
    ?.split(',')
    .filter((id) => raceTrack(id)) ?? FEEL_TRACKS

/** One process's share: race and print the times as JSON */
if (process.argv.includes('--worker')) {
  process.stdout.write(JSON.stringify(raceMatrix(FEEL_DRIVERS[who], tracks, vehicles, seeds)))
  process.exit(0)
}

/** The tracks raced `jobs` at a time, each in a process of its own */
async function raceAll(): Promise<Matrix> {
  const self = fileURLToPath(import.meta.url)
  const queue = [...tracks]
  const matrix: Record<string, Matrix[string]> = {}
  const one = (track: string) =>
    new Promise<void>((done, fail) => {
      const child = spawn(
        process.execPath,
        [
          ...process.execArgv,
          self,
          '--worker',
          '--tracks',
          track,
          '--who',
          who,
          '--seeds',
          String(seeds),
          '--vehicles',
          vehicles.join(','),
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      )
      let out = ''
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
      child.on('error', fail)
      child.on('close', (code) => {
        if (code !== 0) return fail(new Error(`${track}: exit ${code}`))
        Object.assign(matrix, JSON.parse(out) as Matrix)
        console.error(`  ${track} done`)
        done()
      })
    })
  const lanes = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let track = queue.shift(); track; track = queue.shift()) await one(track)
  })
  await Promise.all(lanes)
  return Object.fromEntries(tracks.filter((id) => matrix[id]).map((id) => [id, matrix[id]!]))
}

const loaded = option('load')
const matrix: Matrix = loaded
  ? loaded
      .split(',')
      .map((file) => JSON.parse(readFileSync(file, 'utf8')) as Matrix)
      .reduce<Record<string, Matrix[string]>>((all, part) => {
        for (const [track, row] of Object.entries(part)) all[track] = { ...all[track], ...row }
        return all
      }, {})
  : await raceAll()
const saved = option('save')
if (saved) writeFileSync(saved, JSON.stringify(matrix))

const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`
console.log('track       length  sharp/km  straight  longest  climb  up    down  up grade  down grade')
for (const id of Object.keys(matrix)) {
  const traits = trackTraits(raceTrack(id)!)
  console.log(
    `${id.padEnd(12)}${`${traits.length.toFixed(0)} m`.padEnd(8)}${traits.sharpPerKm.toFixed(1).padEnd(10)}${pct(traits.straightShare).padEnd(10)}${`${traits.longestStraight.toFixed(0)} m`.padEnd(9)}${`${traits.climb.toFixed(0)} m`.padEnd(7)}${pct(traits.upShare).padEnd(6)}${pct(traits.downShare).padEnd(6)}${pct(traits.upGrade, 1).padEnd(10)}${pct(traits.downGrade, 1)}`,
  )
}

const flagship = seasonFlagship()
const flagships = flagship ? [flagship] : []
const rest = without(matrix, flagships)
console.log(`\nthe ${who}, the median of ${seeds} races each: the quickest five, the flagship aside`)
for (const [track, row] of Object.entries(rest)) {
  const order = ranking(row)
  const best = order[0]!.seconds
  const worst = order.at(-1)!
  const own = flagship ? matrix[track]![flagship] : undefined
  console.log(
    `${track.padEnd(11)}${order
      .slice(0, 5)
      .map((one) => `${one.kart} ${one.seconds.toFixed(2)}`)
      .join(' | ')}   slowest ${worst.kart} +${pct(worst.seconds / best - 1, 1)}${own === undefined ? '' : `   ${flagship} ${own.toFixed(2)} (${(((best - own) / best) * 100).toFixed(2)}%)`}`,
  )
}
console.log('wins:', JSON.stringify(winCounts(rest)))
const problems = fairness(matrix, flagships)
console.log(problems.length === 0 ? 'fair: no vehicle but the flagship wins everywhere' : problems.join('\n'))
if (flagship && Object.values(matrix).some((row) => row[flagship] !== undefined)) {
  const lead = flagshipLead(matrix, flagship)
  console.log(
    `${flagship}: the quickest on ${lead.wins} of ${lead.tracks}, ${(lead.margin * 100).toFixed(2)}% on the mean against the best of the rest`,
  )
}
console.log('\nshared/kart/meta.ts podiums:')
for (const [track, karts] of Object.entries(podiums(rest))) {
  console.log(`  ${track}: [${karts.map((kart) => `'${kart}'`).join(', ')}],`)
}
