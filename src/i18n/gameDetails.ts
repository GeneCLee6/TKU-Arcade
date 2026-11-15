// A game's room details: its options (shared/games/<id>/info.ts) and the strings the room shows of it
// before its screen has loaded (shared/games/<id>/i18n.ts: the options form, errors, results). Out of
// the first load, which has only the lobby's record (shared/games/lobby.ts): a room loads its own
// game's when it opens, so a new game costs the lobby one line and nothing more (ARCHITECTURE §5).
import { useEffect, useSyncExternalStore } from 'react'
import type { AnyGameInfo } from '../../shared/games/types.ts'
import { registerMessages, type Language } from './t.ts'

type Module = Record<string, unknown>

// One small chunk per game and file, fetched only for a room of that game
const INFOS = import.meta.glob<Module>('./*/info.ts', { base: '../../shared/games' })
const MESSAGES = import.meta.glob<Module>('./*/i18n.ts', { base: '../../shared/games' })

/** A settled load: the game's info, or null when it is unknown or could not load (the room still shows) */
export type GameDetails = { info: AnyGameInfo | null; failed?: true }

const settled = new Map<string, GameDetails>()
const pending = new Map<string, Promise<GameDetails>>()
const listeners = new Set<() => void>()

const isInfo = (value: unknown, id: string): value is AnyGameInfo =>
  typeof value === 'object' && value !== null && (value as { id?: unknown }).id === id

const isMessages = (value: unknown): value is Record<Language, Record<string, string>> =>
  typeof value === 'object' && value !== null && 'en' in value && 'zh-TW' in value

function settle(id: string, details: GameDetails): GameDetails {
  settled.set(id, details)
  for (const listener of listeners) listener()
  return details
}

/** Loads a game's info and room strings once; never rejects. `id` comes from the network */
export function loadGameDetails(id: string): Promise<GameDetails> {
  const known = settled.get(id)
  if (known !== undefined && !known.failed) return Promise.resolve(known)
  let promise = pending.get(id)
  if (promise === undefined) {
    const info = INFOS[`./${id}/info.ts`]
    const messages = MESSAGES[`./${id}/i18n.ts`]
    promise =
      info === undefined
        ? Promise.resolve(settle(id, { info: null }))
        : Promise.all([info(), messages?.()]).then(
            ([infoModule, messageModule]) => {
              const strings = Object.values(messageModule ?? {}).find(isMessages)
              if (strings !== undefined) registerMessages(strings)
              return settle(id, { info: Object.values(infoModule).find((value) => isInfo(value, id)) ?? null })
            },
            () => {
              // Offline or a newer deployment: the room shows without them, and the next call tries again
              pending.delete(id)
              return settle(id, { info: null, failed: true })
            },
          )
    pending.set(id, promise)
  }
  return promise
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The game's details once loaded (undefined until then, or for no game), loading them if need be */
export function useGameDetails(id: string | null): GameDetails | undefined {
  const details = useSyncExternalStore(subscribe, () => (id === null ? undefined : settled.get(id)))
  useEffect(() => {
    if (id !== null) void loadGameDetails(id)
  }, [id])
  return details
}
