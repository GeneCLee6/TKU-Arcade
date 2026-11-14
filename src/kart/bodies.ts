// The hover kart a player drives (owner, 2026-11-14): one of three bodies of our own, all driving
// the same (cosmetic only, so that a ghost or a record is never about the kart). Kept in this
// browser; the names are working names until KART-WORLD.md (e10-t01).
import { readStored, writeStored } from '../lib/storage.ts'
import type { kartBodies } from '../styles/kartTokens.ts'

export type KartBody = keyof typeof kartBodies
export const KART_BODIES: readonly KartBody[] = ['tide', 'comet', 'ray']

const KEY = 'tku-arcade.kart.body'

export function loadBody(): KartBody {
  const stored = readStored(KEY)
  return KART_BODIES.find((body) => body === stored) ?? 'tide'
}

export const saveBody = (body: KartBody): void => writeStored(KEY, body)
