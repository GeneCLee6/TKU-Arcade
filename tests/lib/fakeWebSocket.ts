import { vi } from 'vitest'
import type { RoomMember, WelcomeMessage } from '../../shared/protocol.ts'

/** Stands in for the browser's WebSocket: tests play the server's side of each socket */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = []

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
    this.onclose?.({ code: 1005 })
  }

  // ── The server's side ──────────────────────────────────────────────────────────────────────

  open(): void {
    this.onopen?.()
  }

  receive(data: unknown): void {
    this.onmessage?.({ data })
  }

  serverClose(code: number): void {
    this.onclose?.({ code })
  }

  /** The `join` messages this socket sent */
  get joins(): { t: string; name: string; token: string | null }[] {
    return this.sent.filter((data) => data !== 'ping').map((data) => JSON.parse(data))
  }
}

export const TOKEN_A = 'a'.repeat(43)
export const TOKEN_B = 'b'.repeat(43)

/** The `welcome` for member `me`; `others` are further members in the room */
export function welcome(
  me: Partial<RoomMember>,
  { token = TOKEN_A, others = 0 }: { token?: string; others?: number } = {},
): string {
  const member: RoomMember = { id: 'm1', name: 'Al', seat: 0, host: true, online: true, ...me }
  const members: Record<string, RoomMember> = { [member.id]: member }
  for (let i = 0; i < others; i++) {
    members[`other${i}`] = { ...member, id: `other${i}`, name: `Other ${i}`, seat: i + 1 }
  }
  const message: WelcomeMessage = {
    t: 'welcome',
    v: 1,
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
    },
  }
  return JSON.stringify(message)
}
