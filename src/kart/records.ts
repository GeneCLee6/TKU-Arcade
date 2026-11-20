// e8-t11: the best run and best lap on each track, kept in this browser (an account's in D1 is
// E11's). The best run is kept as a ghost to race against. Storage can be missing or full: then the
// records last as long as the page.
//
// 2026-11-17 (docs/ARCHITECTURE.md §4.24): the records are kept twice, the track's overall best and
// each kart's best on it, so that a slower kart has a ghost of its own to chase. A track's key is any
// string (`recordKey`: a track's id, `id@revision`, or a custom track's content hash): it always
// comes last in a key, after a prefix that ends in a dot.
//
// What was kept before then says nothing of the kart (karts could be changed since 2026-11-14, #61,
// and the records were not told), so such a record stays the overall best, shown as driven in an
// unknown kart, and is not given to any kart's own records: handing it to the standard kart (`tide`)
// would make a faster kart's time that kart's record, one it might never beat.
//
// 2026-11-20 (docs/ARCHITECTURE.md §4.40): the ghosts move to IndexedDB (ghostStore.ts). #108 found
// a ghost for every kart on every track came near what localStorage holds, and a run that did not fit
// was not kept at all. Now localStorage keeps only the records, a few bytes each (`bestRun.<track>`:
// the time and the kart; `kartBestRun.<kart>.<track>`; the laps as before), and a record is kept
// whether or not its ghost can be. The ghosts kept in localStorage before (`ghost.<track>`,
// `kartGhost.<kart>.<track>`) move over the first time a ghost is asked for, and are deleted once
// they are safe; where there is no IndexedDB (some private windows) they stay where they are, and a
// new best run goes without a ghost. A ghost is raced only when it is the record's own run.
//
// The store's limit (MAX_GHOSTS): every track's overall best and every kart's best on it, with room
// over; past it, or when the browser says the disk is full, the oldest kart ghosts go first and the
// tracks' overall bests last. Their records stay.
import { parseGhost, type Ghost } from '../../shared/kart/ghost.ts'
import { isKartId, type KartId } from '../../shared/kart/karts.ts'
import { readStored, removeStored, writeStored } from '../lib/storage.ts'
import {
  ghostKeyOf,
  openIndexedGhostStore,
  type GhostStore,
  type StoredGhost,
} from './ghostStore.ts'

const PREFIX = 'tku-arcade.kart.'
const runKey = (track: string) => `${PREFIX}bestRun.${track}`
const lapKey = (track: string) => `${PREFIX}bestLap.${track}`
const kartRunKey = (track: string, kart: KartId) => `${PREFIX}kartBestRun.${kart}.${track}`
const kartLapKey = (track: string, kart: KartId) => `${PREFIX}kartBestLap.${kart}.${track}`
/** Where the ghosts were kept before 2026-11-20: read only to move them */
const OLD_GHOST = `${PREFIX}ghost.`
const OLD_KART_GHOST = `${PREFIX}kartGhost.`
const oldGhostKey = (track: string) => `${OLD_GHOST}${track}`
const oldKartGhostKey = (track: string, kart: KartId) => `${OLD_KART_GHOST}${kart}.${track}`

/** The most ghosts kept: 17 karts and an overall best on 11 tracks is 198, with room for customs */
export const MAX_GHOSTS = 320
/** A full disk: this share of the oldest ghosts goes before the put is tried once more */
const FULL_PRUNE_SHARE = 0.25

/** A best run's record: its time in steps, and the kart (missing: kept before karts were told) */
export interface RunRecord {
  readonly total: number
  readonly kart?: KartId
}

function readOldGhost(key: string, track: string): Ghost | null {
  try {
    return parseGhost(JSON.parse(readStored(key) ?? 'null'), track)
  } catch {
    return null
  }
}

function readSteps(key: string): number | null {
  const value = Number(readStored(key) ?? Number.NaN)
  return Number.isInteger(value) && value > 0 ? value : null
}

function readRun(key: string): RunRecord | null {
  try {
    const value: unknown = JSON.parse(readStored(key) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { total, kart } = value as { total?: unknown; kart?: unknown }
    if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) return null
    return isKartId(kart) ? { total, kart } : { total }
  } catch {
    return null
  }
}

const runOf = (ghost: Ghost): RunRecord =>
  ghost.kart ? { total: ghost.total, kart: ghost.kart } : { total: ghost.total }

/** The track's overall best run; its `kart` is missing when it was kept before karts were told */
export function loadBestRun(track: string): RunRecord | null {
  const kept = readRun(runKey(track))
  if (kept) return kept
  // Not moved yet: the old ghost is the record
  const old = readOldGhost(oldGhostKey(track), track)
  return old && runOf(old)
}

/** `kart`'s own best run on the track, in steps */
export function loadKartBestRun(track: string, kart: KartId): number | null {
  const kept = readSteps(kartRunKey(track, kart))
  if (kept !== null) return kept
  return readOldGhost(oldKartGhostKey(track, kart), track)?.total ?? null
}

export const loadBestLap = (track: string): number | null => readSteps(lapKey(track))

export const loadKartBestLap = (track: string, kart: KartId): number | null =>
  readSteps(kartLapKey(track, kart))

// The store: opened once, on first need. Tests set their own (setGhostStore)
let storePromise: Promise<GhostStore | null> | null = null
let movePromise: Promise<void> | null = null
/** The ghosts' writes, one after another: a load waits for them (and tests can: settleGhosts) */
let queue: Promise<void> = Promise.resolve()

const enqueue = (task: () => Promise<void>): Promise<void> => {
  queue = queue.then(task).catch(() => undefined)
  return queue
}

function ghostStore(): Promise<GhostStore | null> {
  storePromise ??= openIndexedGhostStore().catch(() => null)
  return storePromise
}

/** Tests: the store to use (null: none, as in a private window); also forgets what was moved */
export function setGhostStore(store: GhostStore | null): void {
  storePromise = Promise.resolve(store)
  movePromise = null
  queue = Promise.resolve()
}

/** Resolves once every ghost being kept or moved is in the store (or has failed to be) */
export const settleGhosts = (): Promise<void> => queue

function storedKeys(): string[] {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

/** An old localStorage ghost's key, read back: the track and the kart (null: the overall best) */
function oldEntryOf(key: string): { track: string; kart: KartId | null } | null {
  if (key.startsWith(OLD_GHOST)) return { track: key.slice(OLD_GHOST.length), kart: null }
  if (!key.startsWith(OLD_KART_GHOST)) return null
  const rest = key.slice(OLD_KART_GHOST.length)
  const dot = rest.indexOf('.')
  const kart = rest.slice(0, dot)
  return dot > 0 && isKartId(kart) ? { track: rest.slice(dot + 1), kart } : null
}

const isFull = (error: unknown) =>
  error instanceof DOMException && error.name === 'QuotaExceededError'

/** Puts a ghost in, making room if the store is over its limit or the disk is full */
async function putGhost(store: GhostStore, entry: StoredGhost): Promise<void> {
  try {
    await store.put(entry)
  } catch (error) {
    if (!isFull(error)) throw error
    await prune(store, entry.key, FULL_PRUNE_SHARE)
    await store.put(entry)
  }
  await prune(store, entry.key, 0)
}

/**
 * Over MAX_GHOSTS (or, with `share`, that share of them however many there are): the oldest go,
 * kart ghosts before the tracks' overall bests, never `keep`
 */
async function prune(store: GhostStore, keep: string, share: number): Promise<void> {
  const keys = (await store.keysByAge()).filter((key) => key !== keep)
  const over = Math.max(keys.length + 1 - MAX_GHOSTS, Math.ceil(keys.length * share))
  if (over <= 0) return
  const order = [
    ...keys.filter((key) => key.startsWith('kart|')),
    ...keys.filter((key) => !key.startsWith('kart|')),
  ]
  await store.remove(order.slice(0, over))
}

const entryOf = (ghost: Ghost, track: string, kart: KartId | null): StoredGhost => ({
  key: ghostKeyOf(track, kart),
  track,
  kart,
  ghost: kart === null ? ghost : { ...ghost, kart },
  savedAt: Date.now(),
})

/**
 * Moves the ghosts localStorage kept into the store, each deleted once it is safe there. A broken
 * one is deleted; with no store, nothing moves. Once a page
 */
export function moveOldGhosts(): Promise<void> {
  movePromise ??= enqueue(async () => {
    const store = await ghostStore()
    if (!store) return
    for (const key of storedKeys()) {
      const entry = oldEntryOf(key)
      if (!entry) continue
      const { track, kart } = entry
      const ghost = readOldGhost(key, track)
      try {
        if (ghost) {
          // The record it is, should it be the first of its kind kept
          if (kart === null && !readRun(runKey(track)))
            writeStored(runKey(track), JSON.stringify(runOf(ghost)))
          if (kart !== null && readSteps(kartRunKey(track, kart)) === null)
            writeStored(kartRunKey(track, kart), String(ghost.total))
          const there = await store.get(ghostKeyOf(track, kart))
          if (!there || ghost.total < there.ghost.total)
            await putGhost(store, entryOf(ghost, track, kart))
        }
        removeStored(key)
      } catch {
        // Left where it is, to try again on another page
      }
    }
  })
  return movePromise
}

async function loadStored(track: string, kart: KartId | null, total: number | null) {
  if (total === null) return null
  await moveOldGhosts()
  await queue
  const store = await ghostStore()
  let ghost: Ghost | null = null
  if (store) {
    try {
      const entry = await store.get(ghostKeyOf(track, kart))
      ghost = entry ? parseGhost(entry.ghost, track) : null
    } catch {
      ghost = null
    }
  }
  // Not moved (no store, or the move failed): where it was
  ghost ??= readOldGhost(kart === null ? oldGhostKey(track) : oldKartGhostKey(track, kart), track)
  // Only the record's own run: a ghost slower than the record (its own could not be kept) is not it
  return ghost && ghost.total === total ? ghost : null
}

/** The track's overall best run's ghost; null when there is none, or it could not be kept */
export const loadGhost = (track: string): Promise<Ghost | null> =>
  loadStored(track, null, loadBestRun(track)?.total ?? null)

/** `kart`'s own best run's ghost on the track */
export async function loadKartGhost(track: string, kart: KartId): Promise<Ghost | null> {
  const ghost = await loadStored(track, kart, loadKartBestRun(track, kart))
  // Kept under one kart's key, it is that kart's, whatever the entry says
  return ghost && { ...ghost, kart }
}

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

/** Keeps the ghost in the store, in the background; without a store it is not kept */
function keepGhost(ghost: Ghost, kart: KartId | null, oldKey: string): void {
  void moveOldGhosts()
  void enqueue(async () => {
    // The old ghost is not the record any more: it goes, whatever comes of the new one
    removeStored(oldKey)
    const store = await ghostStore()
    if (store) await putGhost(store, entryOf(ghost, ghost.track, kart))
  })
}

/** Keeps a run if it beats the best one, and a lap if it beats the best one */
function keepPair(
  ghost: Ghost,
  run: { best: number | null; keep: () => void },
  lap: { key: string; best: number | null },
) {
  const fastest = Math.min(...ghost.laps)
  const newRun = run.best === null || ghost.total < run.best
  if (newRun) run.keep()
  const newLap = lap.best === null || fastest < lap.best
  if (newLap) writeStored(lap.key, String(fastest))
  return {
    newRun,
    newLap,
    runSteps: newRun ? ghost.total : (run.best ?? ghost.total),
    lapSteps: newLap ? fastest : (lap.best ?? fastest),
  }
}

/**
 * Keeps `ghost` if it beats the track's best run, and its fastest lap if that beats the best lap; and
 * the same for the kart it was driven in (`ghost.kart`; without one, only the overall records). The
 * records are kept at once; the ghosts follow in the background (settleGhosts)
 */
export function keepIfBetter(ghost: Ghost): RecordNews {
  const { track, kart } = ghost
  const overall = keepPair(
    ghost,
    {
      best: loadBestRun(track)?.total ?? null,
      keep: () => {
        writeStored(runKey(track), JSON.stringify(runOf(ghost)))
        keepGhost(ghost, null, oldGhostKey(track))
      },
    },
    { key: lapKey(track), best: loadBestLap(track) },
  )
  const own = kart
    ? keepPair(
        ghost,
        {
          best: loadKartBestRun(track, kart),
          keep: () => {
            writeStored(kartRunKey(track, kart), String(ghost.total))
            keepGhost(ghost, kart, oldKartGhostKey(track, kart))
          },
        },
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
