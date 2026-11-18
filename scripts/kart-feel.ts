// What the classic feel's techniques are worth, against the arcade (old) preset: novice, average and
// expert drivers, three laps of every built-in track (scripts/kart/feel.ts; docs/KART-FEEL.md).
// Run: npm run kart:feel
import { ARCADE_TUNING, KART_TUNING } from '../shared/kart/physics.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { FEEL_DRIVERS, FEEL_TRACKS, feelRace, type FeelResult } from './kart/feel.ts'
import { roadShape } from './kart/shape.ts'

// 2026-11-18: each track's shape too (scripts/kart/shape.ts): how long it is, how much of it drives
// as a straight, its longest straight and how often it changes the way it turns
console.log('track       length   straight  longest straight  changes of direction')
for (const id of FEEL_TRACKS) {
  const shape = roadShape(raceTrack(id)!.road)
  console.log(
    `${id.padEnd(12)}${`${shape.length.toFixed(0)} m`.padEnd(9)}${`${(shape.straightShare * 100).toFixed(0)}%`.padEnd(10)}${`${shape.longestStraight.toFixed(0)} m`.padEnd(18)}${shape.flips}`,
  )
}

for (const [name, tuning] of [
  ['classic', KART_TUNING],
  ['arcade (old)', ARCADE_TUNING],
] as const) {
  console.log(`\n${name}`)
  console.log('track       novice   average  expert   expert vs novice  dashes')
  for (const id of FEEL_TRACKS) {
    const [n, a, e] = (['novice', 'average', 'expert'] as const).map((who) =>
      feelRace(id, FEEL_DRIVERS[who], tuning),
    )
    const gap = n!.seconds - e!.seconds
    const cell = (r: FeelResult) => `${r.seconds.toFixed(1)}${r.finished ? ' ' : '!'}`.padEnd(9)
    console.log(
      `${id.padEnd(12)}${cell(n!)}${cell(a!)}${cell(e!)}${`${gap.toFixed(1)} s (${((gap / e!.seconds) * 100).toFixed(0)}%)`.padEnd(18)}${e!.dashes}`,
    )
  }
}
