import {
  LOBBY_HEARTBEAT_MS,
  LOBBY_LIST_LIMIT,
  LOBBY_MAX_ROOMS,
  LOBBY_TTL_MS,
  type RoomListing,
} from '../shared/protocol.ts'

/** The one LobbyDO's name (`idFromName`) */
export const LOBBY_NAME = 'lobby'

/** What a room last told the lobby: `key` is the listing as JSON, `at` is when */
export type LobbyReport = { id: string; key: string; at: number }

/** Should a room with `listing` (null: not listed) tell the lobby now? */
export function lobbyReportDue(
  reported: LobbyReport | null,
  listing: RoomListing | null,
  now: number,
): boolean {
  if (listing === null) return reported !== null
  return (
    reported === null ||
    reported.key !== JSON.stringify(listing) ||
    now - reported.at >= LOBBY_HEARTBEAT_MS
  )
}

/** One listed room, with when the room was last heard from */
export type LobbyEntry = { listing: RoomListing; heardAt: number }

export type LobbyBoardDeps = {
  storage: {
    save(entry: LobbyEntry): void
    drop(id: string): void
  }
  now(): number
}

/**
 * The public room list, without Cloudflare (worker/lobby.ts is the glue). Rooms come and go by their
 * own reports (`RoomDO.syncLobby`); one that stops reporting, whose removal got lost or whose object
 * failed, drops off after LOBBY_TTL_MS.
 */
export class LobbyBoard {
  private readonly entries = new Map<string, LobbyEntry>()
  private readonly deps: LobbyBoardDeps

  constructor(deps: LobbyBoardDeps) {
    this.deps = deps
  }

  restore(entries: Iterable<LobbyEntry>): void {
    this.entries.clear()
    for (const entry of entries) this.entries.set(entry.listing.id, entry)
  }

  report(id: string, listing: RoomListing | null): void {
    if (listing === null) {
      if (this.entries.delete(id)) this.deps.storage.drop(id)
      return
    }
    if (!this.entries.has(id) && this.entries.size >= LOBBY_MAX_ROOMS) return
    const entry = { listing, heardAt: this.deps.now() }
    this.entries.set(id, entry)
    this.deps.storage.save(entry)
  }

  /** Newest first. Ignores rooms past their time even if the alarm has not removed them yet */
  list(): RoomListing[] {
    const oldest = this.deps.now() - LOBBY_TTL_MS
    return [...this.entries.values()]
      .filter((entry) => entry.heardAt > oldest)
      .map((entry) => entry.listing)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LOBBY_LIST_LIMIT)
  }

  sweep(): void {
    const oldest = this.deps.now() - LOBBY_TTL_MS
    for (const [id, entry] of [...this.entries]) {
      if (entry.heardAt <= oldest) {
        this.entries.delete(id)
        this.deps.storage.drop(id)
      }
    }
  }

  /** When the next room runs out of time; null for no alarm */
  nextAlarm(): number | null {
    if (this.entries.size === 0) return null
    return Math.min(...[...this.entries.values()].map((entry) => entry.heardAt)) + LOBBY_TTL_MS
  }
}
