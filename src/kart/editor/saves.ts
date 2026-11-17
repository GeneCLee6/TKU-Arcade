// e10-t07: tracks made in the editor, kept in this browser until accounts (F1) and R2 can keep them
// for a person. Storage can be missing, blocked or full (storage.ts never throws): then the list
// lasts as long as the page. Whatever is read back is checked: a hand edit cannot break the page.
import { decodeSpec, encodeSpec } from '../../../shared/kart/editor/codec.ts'
import type { TrackSpec } from '../../../shared/kart/editor/spec.ts'
import { readStored, writeStored } from '../../lib/storage.ts'

const KEY = 'tku-arcade.kart.editor.tracks'
/** The most kept; saving one more drops the oldest */
export const MAX_SAVES = 30

export interface SavedTrack {
  /** This browser's own name for the save, so that two of the same name stay apart */
  readonly id: string
  readonly code: string
  /** ms since the epoch */
  readonly savedAt: number
}

let memory: SavedTrack[] | null = null

function readAll(): SavedTrack[] {
  if (memory) return memory
  let list: SavedTrack[] = []
  try {
    const raw: unknown = JSON.parse(readStored(KEY) ?? '[]')
    if (Array.isArray(raw)) {
      list = raw.filter(
        (item): item is SavedTrack =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.code === 'string' &&
          typeof item.savedAt === 'number' &&
          decodeSpec(item.code) !== null,
      )
    }
  } catch {
    list = []
  }
  memory = list.slice(0, MAX_SAVES)
  return memory
}

function writeAll(list: SavedTrack[]): void {
  memory = list
  writeStored(KEY, JSON.stringify(list))
}

/** Newest first */
export function loadSaves(): readonly SavedTrack[] {
  return [...readAll()].sort((a, b) => b.savedAt - a.savedAt)
}

/** Keeps `spec` under `id` (a new save when null); returns the save's id */
export function saveTrack(spec: TrackSpec, id: string | null, now = Date.now()): string {
  const keep = id ?? `t${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  const others = readAll().filter((item) => item.id !== keep)
  const next = [{ id: keep, code: encodeSpec(spec), savedAt: now }, ...others]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SAVES)
  writeAll(next)
  return keep
}

export function deleteTrack(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id))
}

/** For tests: forget what was read, as a new page would */
export function forgetSaves(): void {
  memory = null
}
