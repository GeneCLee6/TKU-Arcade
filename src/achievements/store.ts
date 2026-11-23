// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): the achievements as this browser keeps them, in
// localStorage through lib/storage.ts (which never throws: blocked, they last until the page closes).
// One small JSON value, the same shape an account will take in once signing in exists (F1):
//
//   { "format": 1, "stats": { "n": {...}, "t": {...} }, "unlocked": { "<rule id>": <ms since epoch> } }
//
// A value that is not what this file wrote reads as nothing kept, field by field: a broken counter
// is dropped, not the rest. An unlock of a rule this version does not know is kept (a newer version
// may have written it).
import { readStored, writeStored } from '../lib/storage.ts'
import { EMPTY_STATS, mergeStats, parseStats, type Stats } from './stats.ts'

export const ACHIEVEMENTS_KEY = 'tku-arcade.achievements'
export const FORMAT = 1

export interface Saved {
  readonly stats: Stats
  /** Each unlocked rule's id, and when it unlocked (ms since the epoch) */
  readonly unlocked: Readonly<Record<string, number>>
}

export const EMPTY_SAVED: Saved = { stats: EMPTY_STATS, unlocked: {} }

const ID = /^[a-z][a-z0-9-]{0,63}$/

/** What was kept, from its JSON; anything that is not right is left out */
export function parseSaved(stored: string | null): Saved {
  if (!stored) return EMPTY_SAVED
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return EMPTY_SAVED
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_SAVED
  const { format, stats, unlocked } = value as Record<string, unknown>
  if (format !== FORMAT) return EMPTY_SAVED
  const kept: Record<string, number> = {}
  if (typeof unlocked === 'object' && unlocked !== null && !Array.isArray(unlocked)) {
    for (const [id, at] of Object.entries(unlocked)) {
      if (ID.test(id) && typeof at === 'number' && Number.isFinite(at) && at > 0) kept[id] = at
    }
  }
  return { stats: parseStats(stats), unlocked: kept }
}

export const serialize = (saved: Saved): string =>
  JSON.stringify({ format: FORMAT, stats: saved.stats, unlocked: saved.unlocked })

export const loadSaved = (): Saved => parseSaved(readStored(ACHIEVEMENTS_KEY))

export const save = (saved: Saved): void => writeStored(ACHIEVEMENTS_KEY, serialize(saved))

/**
 * Two copies as one (F1: an account's and this browser's): the stats merged (stats.ts) and every
 * unlock kept, at the earlier of its two times
 */
export function mergeSaved(a: Saved, b: Saved): Saved {
  const unlocked: Record<string, number> = { ...a.unlocked }
  for (const [id, at] of Object.entries(b.unlocked)) {
    unlocked[id] = unlocked[id] === undefined ? at : Math.min(unlocked[id], at)
  }
  return { stats: mergeStats(a.stats, b.stats), unlocked }
}
