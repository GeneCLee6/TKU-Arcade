// e8-t11: the best run and best lap on each track, kept in this browser (an account's in D1 is
// E11's). The best run is kept as a ghost to race against. Storage can be missing or full: then the
// records last as long as the page.
//
// 2026-11-17 (docs/ARCHITECTURE.md §4.24): the records are kept twice, the track's overall best and
// each kart's best on it, so that a slower kart has a ghost of its own to chase. A track's key is any
// string (`recordKey`: a track's id, `id@revision`, or a custom track's content hash): it always
// comes last in a key, after a prefix that ends in a dot.
//
// The overall records keep the keys they have had since e8-t11, `ghost.<track>` and
// `bestLap.<track>`, so nothing a player kept is lost and nothing needs moving. What was kept before
// then says nothing of the kart (karts could be changed since 2026-11-14, #61, and the records were
// not told), so such a record stays the overall best, shown as driven in an unknown kart, and is not
// given to any kart's own records: handing it to the standard kart (`tide`) would make a faster
// kart's time that kart's record, one it might never beat.
import { parseGhost, type Ghost } from '../../shared/kart/ghost.ts'
import type { KartId } from '../../shared/kart/karts.ts'
import { readStored, writeStored } from '../lib/storage.ts'

const ghostKey = (track: string) => `tku-arcade.kart.ghost.${track}`
const lapKey = (track: string) => `tku-arcade.kart.bestLap.${track}`
const kartGhostKey = (track: string, kart: KartId) => `tku-arcade.kart.kartGhost.${kart}.${track}`
const kartLapKey = (track: string, kart: KartId) => `tku-arcade.kart.kartBestLap.${kart}.${track}`

function readGhost(key: string, track: string): Ghost | null {
  try {
    return parseGhost(JSON.parse(readStored(key) ?? 'null'), track)
  } catch {
    return null
  }
}

function readLap(key: string): number | null {
  const value = Number(readStored(key))
  return Number.isInteger(value) && value > 0 ? value : null
}

/** The track's overall best run; its `kart` is missing when it was kept before karts were told */
export const loadGhost = (track: string): Ghost | null => readGhost(ghostKey(track), track)

export const loadBestLap = (track: string): number | null => readLap(lapKey(track))

/** `kart`'s own best run on the track */
export function loadKartGhost(track: string, kart: KartId): Ghost | null {
  const ghost = readGhost(kartGhostKey(track, kart), track)
  // Kept under one kart's key, it is that kart's, whatever the entry says
  return ghost && { ...ghost, kart }
}

export const loadKartBestLap = (track: string, kart: KartId): number | null =>
  readLap(kartLapKey(track, kart))

/** Which ghost races along on /kart: the track's overall best, the kart's own, or none */
export const GHOST_PICKS = ['overall', 'kart', 'off'] as const
export type GhostPick = (typeof GHOST_PICKS)[number]

const PICK_KEY = 'tku-arcade.kart.ghostPick'

export function loadGhostPick(): GhostPick {
  const stored = readStored(PICK_KEY)
  return GHOST_PICKS.find((one) => one === stored) ?? 'overall'
}

export const saveGhostPick = (pick: GhostPick): void => writeStored(PICK_KEY, pick)

export interface RecordNews {
  /** The track's overall records */
  readonly bestRun: boolean
  readonly bestLap: boolean
  /** What the records are now, in steps */
  readonly runSteps: number
  readonly lapSteps: number
  /** The kart's own records on the track */
  readonly kartBestRun: boolean
  readonly kartBestLap: boolean
  readonly kartRunSteps: number
  readonly kartLapSteps: number
}

/** Keeps a run if it beats the best one, and a lap if it beats the best one */
function keepPair(
  ghost: Ghost,
  run: { key: string; best: Ghost | null },
  lap: { key: string; best: number | null },
) {
  const fastest = Math.min(...ghost.laps)
  const newRun = run.best === null || ghost.total < run.best.total
  if (newRun) writeStored(run.key, JSON.stringify(ghost))
  const newLap = lap.best === null || fastest < lap.best
  if (newLap) writeStored(lap.key, String(fastest))
  return {
    newRun,
    newLap,
    runSteps: newRun ? ghost.total : (run.best?.total ?? ghost.total),
    lapSteps: newLap ? fastest : (lap.best ?? fastest),
  }
}

/**
 * Keeps `ghost` if it beats the track's best run, and its fastest lap if that beats the best lap; and
 * the same for the kart it was driven in (`ghost.kart`; without one, only the overall records)
 */
export function keepIfBetter(ghost: Ghost): RecordNews {
  const { track, kart } = ghost
  const overall = keepPair(
    ghost,
    { key: ghostKey(track), best: loadGhost(track) },
    { key: lapKey(track), best: loadBestLap(track) },
  )
  const own = kart
    ? keepPair(
        ghost,
        { key: kartGhostKey(track, kart), best: loadKartGhost(track, kart) },
        { key: kartLapKey(track, kart), best: loadKartBestLap(track, kart) },
      )
    : null
  return {
    bestRun: overall.newRun,
    bestLap: overall.newLap,
    runSteps: overall.runSteps,
    lapSteps: overall.lapSteps,
    kartBestRun: own?.newRun ?? false,
    kartBestLap: own?.newLap ?? false,
    kartRunSteps: own?.runSteps ?? ghost.total,
    kartLapSteps: own?.lapSteps ?? Math.min(...ghost.laps),
  }
}
