// 2026-11-22 (the owner: 「常常連線不穩」): `npm run net:soak -- [--url <site>] [--clients 4]
// [--minutes 20] [--ping 15] [--idle 120] [--game silent-table] [--json <file>]`. Opens one private room
// on a site (the local dev server by default), keeps N clients in it over the real protocol for a
// while, the way a browser does (join with the seat token it was given, `ping` every --ping seconds,
// a tap now and then) and records every time a socket closes: its close code and reason, how long it
// had been open, and how long the client took to be welcomed again (it reconnects as the page does,
// at once and then backing off). Long quiet stretches (--idle) let the room's Durable Object hibernate
// between taps, which is where a room can lose track of who is still there.
//
// `--ping 60` is a background tab that the browser wakes once a minute (Chrome's intensive timer
// throttling after five minutes hidden): before 2026-11-22 the room closed such a socket as stale
// (4408) every minute or two. Results and how to read them: docs/NETWORK.md.
//
// Never against the live site unless its owner asks: that needs --allow-production.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  HEARTBEAT_PING,
  roomSocketPath,
  type CreateRoomResponse,
  type ServerMessage,
} from '../shared/protocol.ts'

const PRODUCTION_HOST = 'tku-arcade.genelee-pro.workers.dev'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5175' },
    clients: { type: 'string', default: '4' },
    minutes: { type: 'string', default: '20' },
    ping: { type: 'string', default: '15' },
    // Seconds between one client's taps (`ready` on and off); the others' are spread across it
    idle: { type: 'string', default: '120' },
    game: { type: 'string', default: 'silent-table' },
    json: { type: 'string' },
    'allow-production': { type: 'boolean', default: false },
  },
})

const base = new URL(values.url)
if (base.host === PRODUCTION_HOST && !values['allow-production']) {
  console.error('Not against the live site: run it on a preview, or pass --allow-production')
  process.exit(2)
}
const clientCount = Number(values.clients)
const minutes = Number(values.minutes)
const pingMs = Number(values.ping) * 1000
const idleMs = Number(values.idle) * 1000
const started = Date.now()
const endAt = started + minutes * 60_000
/** As the page waits (src/lib/roomConnection.ts), without the jitter */
const RECONNECT_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000]

type CloseRecord = {
  client: number
  at: number
  code: number
  reason: string
  openMs: number
  /** Until welcomed again; null when the run ended first */
  backMs: number | null
  attempts: number
}

const closes: CloseRecord[] = []
let welcomes = 0
let taps = 0
let answered = 0
const stamp = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(5)} s`

async function createRoom(): Promise<string> {
  const response = await fetch(new URL('/api/rooms', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base.origin },
    body: JSON.stringify({ gameId: values.game, public: false }),
  })
  if (response.status !== 201) throw new Error(`create: ${response.status} ${await response.text()}`)
  return ((await response.json()) as CreateRoomResponse).id
}

class Client {
  token: string | null = null
  socket: WebSocket | null = null
  openedAt = 0
  lostAt: number | null = null
  attempts = 0
  pending: CloseRecord | null = null
  ready = false
  readonly index: number
  readonly roomId: string
  private pinger: ReturnType<typeof setInterval> | undefined
  private tapper: ReturnType<typeof setTimeout> | undefined
  constructor(index: number, roomId: string) {
    this.index = index
    this.roomId = roomId
  }

  connect(): void {
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${scheme}//${base.host}${roomSocketPath(this.roomId)}${this.lostAt !== null ? '&resume=1' : ''}`)
    this.socket = socket
    this.attempts++
    socket.addEventListener('open', () => {
      this.openedAt = Date.now()
      socket.send(JSON.stringify({ t: 'join', name: `soak-${this.index + 1}`, token: this.token }))
      this.pinger = setInterval(() => socket.send(HEARTBEAT_PING), pingMs)
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return
      const message = JSON.parse(event.data) as ServerMessage
      if (message.t === 'welcome') {
        welcomes++
        this.token = message.token
        if (this.pending) {
          this.pending.backMs = Date.now() - this.pending.at
          this.pending.attempts = this.attempts
          console.log(`${stamp()}  client ${this.index + 1} back after ${this.pending.backMs} ms (${this.attempts} tries)`)
          this.pending = null
        }
        this.lostAt = null
        this.attempts = 0
        this.scheduleTap()
      } else if (message.t === 'patch' || message.t === 'snapshot') answered++
    })
    socket.addEventListener('close', (event) => {
      clearInterval(this.pinger)
      clearTimeout(this.tapper)
      if (this.socket !== socket || Date.now() >= endAt) return
      const now = Date.now()
      if (this.lostAt === null) {
        this.lostAt = now
        this.pending = {
          client: this.index + 1,
          at: now,
          code: event.code,
          reason: event.reason,
          openMs: this.openedAt ? now - this.openedAt : 0,
          backMs: null,
          attempts: 0,
        }
        closes.push(this.pending)
        console.log(`${stamp()}  client ${this.index + 1} closed ${event.code} ${event.reason || '-'} after ${(this.pending.openMs / 1000).toFixed(0)} s open`)
      }
      const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts - 1, RECONNECT_DELAYS_MS.length - 1)]
      setTimeout(() => this.connect(), delay)
    })
  }

  private scheduleTap(): void {
    clearTimeout(this.tapper)
    // Spread: each client taps at its own point of the idle stretch
    const wait = idleMs * (0.5 + ((this.index + 1) / (clientCount + 1)) * 0.5)
    this.tapper = setTimeout(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.ready = !this.ready
        this.socket.send(JSON.stringify({ t: 'ready', ready: this.ready }))
        taps++
      }
      this.scheduleTap()
    }, wait)
  }

  stop(): void {
    clearInterval(this.pinger)
    clearTimeout(this.tapper)
    const socket = this.socket
    this.socket = null
    socket?.close()
  }
}

const roomId = await createRoom()
console.log(`room ${roomId} on ${base.origin}: ${clientCount} clients for ${minutes} min, ping every ${pingMs / 1000} s, a tap every ~${idleMs / 1000} s`)
const clients = Array.from({ length: clientCount }, (_, index) => new Client(index, roomId))
for (const client of clients) {
  client.connect()
  await new Promise((resolve) => setTimeout(resolve, 300))
}
await new Promise((resolve) => setTimeout(resolve, Math.max(0, endAt - Date.now())))
for (const client of clients) client.stop()

const byCode = new Map<string, number>()
for (const one of closes) {
  const key = `${one.code} ${one.reason || '-'}`
  byCode.set(key, (byCode.get(key) ?? 0) + 1)
}
const back = closes.flatMap((one) => (one.backMs === null ? [] : [one.backMs])).sort((a, b) => a - b)
const pick = (q: number) => (back.length ? back[Math.min(back.length - 1, Math.floor(q * back.length))] : null)
const summary = {
  url: base.origin,
  clients: clientCount,
  minutes,
  pingSeconds: pingMs / 1000,
  closes: closes.length,
  closesPerClientHour: Number((closes.length / clientCount / (minutes / 60)).toFixed(2)),
  byCode: Object.fromEntries(byCode),
  reconnectMs: { p50: pick(0.5), p90: pick(0.9), max: back.at(-1) ?? null },
  neverBack: closes.filter((one) => one.backMs === null).length,
  welcomes,
  taps,
  answered,
}
console.log(JSON.stringify(summary, null, 2))
if (values.json) writeFileSync(values.json, JSON.stringify({ summary, closes }, null, 2))
process.exit(0)
