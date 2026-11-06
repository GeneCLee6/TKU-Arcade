import {
  CloseCode,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isSeatToken,
  parseServerMessage,
  roomSocketPath,
  type ClientMessage,
  type ErrorMessage,
  type JoinMessage,
  type RoomView,
} from '../../shared/protocol.ts'
import { applyPatch, type JsonValue, type PatchOp } from '../../shared/patch.ts'
import { readStored, writeStored } from './storage.ts'

export type RoomEnd =
  | 'versionMismatch'
  | 'notFound'
  | 'full'
  | 'connectionLost'
  | 'disconnected'
  | 'replaced'

export type RoomHandlers = {
  /** After `welcome`, and whenever what this person sees changes */
  onView: (you: string, view: RoomView) => void
  onError: (error: ErrorMessage) => void
  onEnd: (end: RoomEnd) => void
}

export type RoomConnection = {
  /** Does nothing before `welcome` or after the end */
  send: (message: ClientMessage) => void
  /** After it, nothing from this socket counts any more */
  leave: () => void
}

const seatKey = (roomId: string) => `tku-arcade.seat.${roomId}`

/** The token that brings this browser back as the same member, not a ghost `Al (2)` */
function readSeatToken(roomId: string): string | null {
  const token = readStored(seatKey(roomId))
  return isSeatToken(token) ? token : null
}

function endOfClose(code: number, welcomed: boolean): RoomEnd {
  if (code === CloseCode.replaced) return 'replaced'
  if (welcomed) return 'disconnected'
  if (code === CloseCode.versionMismatch) return 'versionMismatch'
  if (code === CloseCode.roomNotFound) return 'notFound'
  if (code === CloseCode.roomFull) return 'full'
  return 'connectionLost'
}

/**
 * Opens the room's socket, joins and keeps this person's view of the room up to date. `join` is sent
 * only from the `open` of a socket that is still current, which is what keeps StrictMode's double
 * effect (and a retry) to one member. Reports one end and never reconnects by itself (B4).
 */
export function connectRoom(roomId: string, name: string, handlers: RoomHandlers): RoomConnection {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${scheme}//${window.location.host}${roomSocketPath(roomId)}`)
  let current = true
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let joined: { you: string; rev: number; view: RoomView } | null = null
  let resyncing = false

  // The socket can be closing before its close event arrives, and then `send` throws
  const sendRaw = (data: string) => {
    try {
      socket.send(data)
    } catch {
      // onclose reports it
    }
  }

  const resync = () => {
    if (resyncing) return
    resyncing = true
    sendRaw(JSON.stringify({ t: 'resync' } satisfies ClientMessage))
  }

  const onPatch = (rev: number, ops: PatchOp[]) => {
    if (!joined || resyncing || rev <= joined.rev) return
    if (rev !== joined.rev + 1) return resync()
    let view: RoomView
    try {
      view = applyPatch(joined.view as JsonValue, ops) as RoomView
    } catch {
      return resync()
    }
    joined.rev = rev
    // Everyone gets a patch for every rev, most of them empty for someone who can't see the change
    if (ops.length === 0) return
    joined.view = view
    handlers.onView(joined.you, view)
  }

  socket.onopen = () => {
    if (!current) return
    const join: JoinMessage = { t: 'join', name, token: readSeatToken(roomId) }
    sendRaw(JSON.stringify(join))
    // Without it the server closes the socket as stale
    heartbeat = setInterval(() => sendRaw(HEARTBEAT_PING), HEARTBEAT_INTERVAL_MS)
  }

  socket.onmessage = (event: MessageEvent) => {
    if (!current || typeof event.data !== 'string' || event.data === HEARTBEAT_PONG) return
    const message = parseServerMessage(event.data)
    // `timer` (e2-t08) and `chat` (e1-t07) come with their batches
    switch (message?.t) {
      case 'welcome':
        if (joined) return
        joined = { you: message.you, rev: message.rev, view: message.state }
        writeStored(seatKey(roomId), message.token)
        handlers.onView(message.you, message.state)
        return
      case 'snapshot':
        if (!joined) return
        joined.rev = message.rev
        joined.view = message.state
        resyncing = false
        handlers.onView(joined.you, message.state)
        return
      case 'patch':
        onPatch(message.rev, message.ops)
        return
      case 'error':
        handlers.onError(message)
        return
    }
  }

  socket.onclose = (event: CloseEvent) => {
    clearInterval(heartbeat)
    if (!current) return
    current = false
    handlers.onEnd(endOfClose(event.code, joined !== null))
  }

  return {
    send: (message) => {
      if (current && joined) sendRaw(JSON.stringify(message))
    },
    leave: () => {
      current = false
      clearInterval(heartbeat)
      socket.close()
    },
  }
}
