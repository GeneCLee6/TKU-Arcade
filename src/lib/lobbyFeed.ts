// The lobby's room list, pushed (2026-11-23, shared/lobby-feed.ts, docs/NETWORK.md §6): one WebSocket
// to the LobbyDO that is sent the game's rooms, then each change. The connection habits are the room
// socket's (src/lib/roomConnection.ts, #149, #153): a heartbeat, reconnecting with growing, jittered
// delays, and a hidden tab that lets go (coming back asks afresh). Where pushing cannot work (no
// WebSocket, a proxy that blocks it, a site past its watcher limit) it says so once (`onFallback`)
// and the page polls GET /api/lobby as before.
import {
  applyLobbyFeed,
  lobbyFeedPath,
  lobbyRooms,
  parseLobbyFeed,
} from '../../shared/lobby-feed.ts'
import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  type RoomListing,
} from '../../shared/protocol.ts'

/** Waits before each reconnect, as the room socket's (roomConnection.ts RECONNECT_DELAYS_MS) */
export const FEED_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const
/** Up to this much less, so that a whole campus does not come back in the same second */
const FEED_JITTER = 0.25
/**
 * Sockets in a row that close before their first list: then pushing is taken not to work here (a
 * proxy, an extension, an old Worker) and the page polls instead
 */
export const FEED_FAILS_BEFORE_POLL = 3
/** A socket that has heard nothing (not even a `pong`) for this long is taken to be dead */
export const FEED_SILENT_MS = HEARTBEAT_INTERVAL_MS * 2 + 5_000

export type FeedHandlers = {
  /** The list as it is now, in GET /api/lobby's order and cut */
  onRooms(rooms: RoomListing[]): void
  /** Pushing does not work here: poll instead. Called at most once, after which nothing else is */
  onFallback(): void
}

export type FeedOptions = {
  createSocket?: (url: string) => WebSocket
  /** Defaults to the page's own */
  doc?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>
  random?: () => number
}

/** Watches `gameId`'s listed rooms; the function it returns stops for good */
export function watchLobby(gameId: string, handlers: FeedHandlers, options: FeedOptions = {}): () => void {
  const doc = options.doc ?? (typeof document === 'undefined' ? undefined : document)
  const random = options.random ?? Math.random
  const createSocket =
    options.createSocket ??
    (typeof WebSocket === 'undefined'
      ? undefined
      : (url: string) => new WebSocket(url))
  if (!createSocket || typeof location === 'undefined') {
    handlers.onFallback()
    return () => {}
  }
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${lobbyFeedPath(gameId)}`

  let socket: WebSocket | null = null
  let rooms = new Map<string, RoomListing>()
  let stopped = false
  /** Sockets in a row that closed before any list came */
  let failed = 0
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let beatTimer: ReturnType<typeof setInterval> | undefined
  let heardAt = 0

  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(retryTimer)
    drop()
    doc?.removeEventListener('visibilitychange', onVisibility)
  }

  const fallBack = () => {
    stop()
    handlers.onFallback()
  }

  /** Lets go of the socket, without counting it as a failure */
  function drop() {
    clearInterval(beatTimer)
    const open = socket
    socket = null
    if (!open) return
    open.onopen = open.onmessage = open.onclose = open.onerror = null
    try {
      open.close(1000, 'bye')
    } catch {
      // Already closed
    }
  }

  function connect() {
    if (stopped || socket || doc?.hidden) return
    let listed = false
    const ws = createSocket!(url)
    socket = ws
    heardAt = Date.now()
    ws.onmessage = (event) => {
      heardAt = Date.now()
      if (typeof event.data !== 'string') return
      const message = parseLobbyFeed(event.data)
      if (!message) return
      if (message.t === 'rooms') {
        listed = true
        failed = 0
        retries = 0
      } else if (!listed) {
        return
      }
      rooms = applyLobbyFeed(rooms, message)
      handlers.onRooms(lobbyRooms([...rooms.values()], gameId))
    }
    ws.onopen = () => {
      heardAt = Date.now()
      clearInterval(beatTimer)
      beatTimer = setInterval(() => {
        if (Date.now() - heardAt > FEED_SILENT_MS) {
          // Dead without a close (a phone that slept, a Wi-Fi that changed): start over
          drop()
          scheduleRetry()
          return
        }
        try {
          ws.send(HEARTBEAT_PING)
        } catch {
          // Closing; onclose follows
        }
      }, HEARTBEAT_INTERVAL_MS)
    }
    ws.onclose = (event) => {
      if (socket !== ws) return
      clearInterval(beatTimer)
      socket = null
      // Too many lists watched (the site's or this network's), or a Worker that does not know this
      // feed: polling is what is left
      if (event.code === CloseCode.tooManyConnections || event.code === CloseCode.versionMismatch) {
        fallBack()
        return
      }
      if (!listed && ++failed >= FEED_FAILS_BEFORE_POLL) {
        fallBack()
        return
      }
      scheduleRetry()
    }
    ws.onerror = () => {
      // onclose follows and decides
    }
  }

  function scheduleRetry() {
    if (stopped) return
    clearTimeout(retryTimer)
    const base = FEED_RETRY_MS[Math.min(retries, FEED_RETRY_MS.length - 1)]!
    retries++
    retryTimer = setTimeout(connect, base * (1 - FEED_JITTER * random()))
  }

  // A hidden tab lets go (nobody is looking, and a phone would kill the socket anyway); coming back
  // opens a new one, which starts with the whole list
  function onVisibility() {
    if (stopped) return
    if (doc?.hidden) {
      clearTimeout(retryTimer)
      drop()
    } else if (!socket) {
      retries = 0
      connect()
    }
  }

  doc?.addEventListener('visibilitychange', onVisibility)
  connect()
  return stop
}
