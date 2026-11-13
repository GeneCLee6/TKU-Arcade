// e8-t11: the best run and best lap on each track, kept in this browser (an account's in D1 is
// E11's). The best run is kept as a ghost to race against. Storage can be missing or full: then the
// records last as long as the page.
import { parseGhost, type Ghost } from '../../shared/kart/ghost.ts'
import { readStored, writeStored } from '../lib/storage.ts'

const ghostKey = (track: string) => `tku-arcade.kart.ghost.${track}`
const lapKey = (track: string) => `tku-arcade.kart.bestLap.${track}`

export function loadGhost(track: string): Ghost | null {
  try {
    return parseGhost(JSON.parse(readStored(ghostKey(track)) ?? 'null'), track)
  } catch {
    return null
  }
}

export function loadBestLap(track: string): number | null {
  const value = Number(readStored(lapKey(track)))
  return Number.isInteger(value) && value > 0 ? value : null
}

export interface RecordNews {
  readonly bestRun: boolean
  readonly bestLap: boolean
  /** What the records are now, in steps */
  readonly runSteps: number
  readonly lapSteps: number
}

/** Keeps `ghost` if it beats the best run, and its fastest lap if that beats the best lap */
export function keepIfBetter(ghost: Ghost): RecordNews {
  const best = loadGhost(ghost.track)
  const bestRun = best === null || ghost.total < best.total
  if (bestRun) writeStored(ghostKey(ghost.track), JSON.stringify(ghost))
  const fastest = Math.min(...ghost.laps)
  const lap = loadBestLap(ghost.track)
  const bestLap = lap === null || fastest < lap
  if (bestLap) writeStored(lapKey(ghost.track), String(fastest))
  return {
    bestRun,
    bestLap,
    runSteps: bestRun ? ghost.total : (best?.total ?? ghost.total),
    lapSteps: bestLap ? fastest : (lap ?? fastest),
  }
}
