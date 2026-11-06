import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isSeatToken,
  parseServerMessage,
  roomSocketPath,
  type JoinMessage,
  type WelcomeMessage,
} from '../../shared/protocol.ts'
import { readStored, writeStored } from './storage.ts'

/** What the room page shows after `welcome`. `name` is the server's: it may be `Al (2)` */
export type JoinedRoom = { name: string; seat: number | null; members: number }

export type JoinEnd =
  | 'versionMismatch'
  | 'notFound'
  | 'full'
  | 'connectionLost'
  | 'disconnected'
  | 'replaced'

export type JoinHandlers = {
  onWelcome: (joined: JoinedRoom) => void
  onEnd: (end: JoinEnd) => void
}

const seatKey = (roomId: string) => `tku-arcade.seat.${roomId}`

/** The token that brings this browser back as the same member, not a ghost `Al (2)` */
function readSeatToken(roomId: string): string | null {
  const token = readStored(seatKey(roomId))
  return isSeatToken(token) ? token : null
}

function endOfClose(code: number, welcomed: boolean): JoinEnd {
  if (code === CloseCode.replaced) return 'replaced'
  if (welcomed) return 'disconnected'
  if (code === CloseCode.versionMismatch) return 'versionMismatch'
  if (code === CloseCode.roomNotFound) return 'notFound'
  if (code === CloseCode.roomFull) return 'full'
  return 'connectionLost'
}

function joinedFrom(message: WelcomeMessage, sentName: string): JoinedRoom {
  const me = message.state.members[message.you]
  return {
    name: me?.name ?? sentName,
    seat: me?.seat ?? null,
    members: Object.keys(message.state.members).length,
  }
}

/**
 * Opens the room's socket and joins. Returns the function that leaves: after it, nothing from this
 * socket counts any more. That is what keeps StrictMode's double effect (and a retry) to one member,
 * since `join` is sent only from the `open` of a socket that is still current. Reports one end and
 * never reconnects by itself (B4).
 */
export function joinRoom(roomId: string, name: string, handlers: JoinHandlers): () => void {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${scheme}//${window.location.host}${roomSocketPath(roomId)}`)
  let current = true
  let welcomed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined

  socket.onopen = () => {
    if (!current) return
    const join: JoinMessage = { t: 'join', name, token: readSeatToken(roomId) }
    socket.send(JSON.stringify(join))
    // Without it the server closes the socket as stale
    heartbeat = setInterval(() => socket.send(HEARTBEAT_PING), HEARTBEAT_INTERVAL_MS)
  }

  socket.onmessage = (event: MessageEvent) => {
    if (!current || welcomed || typeof event.data !== 'string') return
    if (event.data === HEARTBEAT_PONG) return
    const message = parseServerMessage(event.data)
    if (message?.t !== 'welcome') return
    welcomed = true
    writeStored(seatKey(roomId), message.token)
    handlers.onWelcome(joinedFrom(message, name))
  }

  socket.onclose = (event: CloseEvent) => {
    clearInterval(heartbeat)
    if (!current) return
    current = false
    handlers.onEnd(endOfClose(event.code, welcomed))
  }

  return () => {
    current = false
    clearInterval(heartbeat)
    socket.close()
  }
}
