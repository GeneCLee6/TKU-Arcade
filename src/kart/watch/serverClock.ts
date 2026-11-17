// e9-t10: the room's clock for someone watching (the item boxes and shields are timed by it). The
// same pings a racer sends (netRace.ts, docs/KART-NETCODE.md §3), without the rest of the race.
import { clockOffset, type ClockSample } from '../../../shared/kart/net.ts'
import { CLOCK_ANSWER_BYTES, CLOCK_FRAME, CLOCK_PING_BYTES } from '../../../shared/protocol.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'

const FIRST_PINGS = 3
const FIRST_PING_GAP_MS = 300
const PING_EVERY_MS = 3_000
const KEEP_SAMPLES = 8

export interface ServerClock {
  /** The server's time now (ms since the epoch); this browser's own before the first answer */
  now(): number
  stop(): void
}

export function createServerClock(realtime: RoomRealtime): ServerClock {
  const samples: ClockSample[] = []
  let offset: number | null = null
  const ping = () => {
    const bytes = new Uint8Array(CLOCK_PING_BYTES)
    bytes[0] = CLOCK_FRAME
    new DataView(bytes.buffer).setFloat64(1, performance.now(), true)
    realtime.send(bytes)
  }
  const stopListening = realtime.listen((data) => {
    if (data.byteLength !== CLOCK_ANSWER_BYTES || data[0] !== CLOCK_FRAME) return
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    samples.push({
      sent: view.getFloat64(1, true),
      received: performance.now(),
      server: view.getFloat64(CLOCK_PING_BYTES, true),
    })
    if (samples.length > KEEP_SAMPLES) samples.shift()
    offset = clockOffset(samples)
  })
  const timers = Array.from({ length: FIRST_PINGS }, (_, i) =>
    setTimeout(ping, i * FIRST_PING_GAP_MS),
  )
  const pinger = setInterval(ping, PING_EVERY_MS)
  return {
    now: () => (offset === null ? Date.now() : performance.now() + offset),
    stop() {
      stopListening()
      for (const timer of timers) clearTimeout(timer)
      clearInterval(pinger)
    },
  }
}
