import { vi } from 'vitest'
import { PROTOCOL_VERSION, type RoomMember, type WelcomeMessage } from '../../shared/protocol.ts'

/** Stands in for the browser's WebSocket: tests play the server's side of each socket */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  /** Replaces the global; vi.unstubAllGlobals() takes it away */
  static install(): void {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  }

  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1)
    if (!socket) throw new Error('No socket was opened')
    return socket
  }

  readonly url: string
  readonly sent: string[] = []
  closedByClient = false
  /** Closed, by either side */
  gone = false
  private opened = false

  get readyState(): number {
    return this.gone ? FakeWebSocket.CLOSED : this.opened ? FakeWebSocket.OPEN : FakeWebSocket.CONNECTING
  }
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closedByClient = true
    this.gone = true
    this.onclose?.({ code: 1005 })
  }

  // ── The server's side ──────────────────────────────────────────────────────────────────────

  open(): void {
    this.opened = true
    this.onopen?.()
  }

  receive(data: unknown): void {
    this.onmessage?.({ data })
  }

  serverClose(code: number): void {
    this.gone = true
    this.onclose?.({ code })
  }

  /**
   * The messages this socket sent; a `join`'s `session` (shared/protocol.ts 20.) left out, being
   * random: `sessions` has it
   */
  get joins(): { t: string; name: string; token: string | null }[] {
    return this.sent
      .filter((data) => data !== 'ping')
      .map((data) => {
        const { session: _session, ...message } = JSON.parse(data) as Record<string, unknown>
        return message as { t: string; name: string; token: string | null }
      })
  }

  /** The `session` of each `join` this socket sent */
  get sessions(): unknown[] {
    return this.sent
      .filter((data) => data !== 'ping')
      .map((data) => JSON.parse(data) as Record<string, unknown>)
      .filter((message) => message.t === 'join')
      .map((message) => message.session)
  }

  /** What this socket sent but pings and joins, parsed */
  get messages(): Record<string, unknown>[] {
    return this.sent
      .filter((data) => data !== 'ping')
      .map((data) => JSON.parse(data) as Record<string, unknown>)
      .filter((message) => message.t !== 'join')
  }
}

export const TOKEN_A = 'a'.repeat(43)
export const TOKEN_B = 'b'.repeat(43)

/** The `welcome` for member `me`; `others` are further members in the room */
export function welcome(
  me: Partial<RoomMember>,
  {
    token = TOKEN_A,
    others = 0,
    ack,
  }: { token?: string; others?: number; ack?: number } = {},
): string {
  const member: RoomMember = {
    id: 'm1',
    name: 'Al',
    seat: 0,
    ready: false,
    host: true,
    online: true,
    absent: false,
    ...me,
  }
  const members: Record<string, RoomMember> = { [member.id]: member }
  for (let i = 0; i < others; i++) {
    members[`other${i}`] = { ...member, id: `other${i}`, name: `Other ${i}`, seat: i + 1 }
  }
  const message: WelcomeMessage = {
    t: 'welcome',
    v: PROTOCOL_VERSION,
    you: member.id,
    token,
    rev: 0,
    state: {
      room: {
        id: 'room',
        gameId: 'promotion',
        status: 'waiting',
        options: {},
        minPlayers: 2,
        maxSeats: 6,
      },
      members,
      game: null,
      coverable: [],
    },
    // A server that acknowledges (shared/protocol.ts 20.)
    ...(ack !== undefined ? { ack } : {}),
  }
  return JSON.stringify(message)
}
