// 2026-11-22 (docs/NETWORK.md): the room's clock, for someone watching, is synced anew when the
// socket is back after a drop or the page after the background: the device may have slept, and
// this browser's performance.now() with it, so the old offset would be off by the whole sleep
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLOCK_ANSWER_BYTES, CLOCK_FRAME, CLOCK_PING_BYTES } from '../../shared/protocol.ts'
import { createServerClock } from '../../src/kart/watch/serverClock.ts'
import type { RoomRealtime } from '../../src/lib/useRoom.ts'

function fakeRealtime() {
  const listeners = new Set<(data: Uint8Array) => void>()
  const resumers = new Set<() => void>()
  const sent: Uint8Array[] = []
  const realtime: RoomRealtime = {
    send: (data) => {
      sent.push(data)
      return true
    },
    listen: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onResume: (listener) => {
      resumers.add(listener)
      return () => resumers.delete(listener)
    },
  }
  /** The room answers every ping sent so far, its clock reading `server` */
  const answer = (server: number) => {
    for (const ping of sent.splice(0)) {
      const bytes = new Uint8Array(CLOCK_ANSWER_BYTES)
      bytes.set(ping.subarray(0, CLOCK_PING_BYTES))
      bytes[0] = CLOCK_FRAME
      new DataView(bytes.buffer).setFloat64(CLOCK_PING_BYTES, server, true)
      for (const listener of listeners) listener(bytes)
    }
  }
  return { realtime, sent, answer, resume: () => resumers.forEach((one) => one()), resumers }
}

afterEach(() => vi.useRealTimers())

describe('the watcher’s server clock', () => {
  it('starts over after a resume: answers from before it no longer count', () => {
    vi.useFakeTimers()
    const net = fakeRealtime()
    const clock = createServerClock(net.realtime)
    vi.advanceTimersByTime(1_000)
    net.answer(performance.now() + 1_000_000)
    expect(clock.synced()).toBe(true)
    const before = clock.now() - performance.now()
    expect(before).toBeGreaterThan(900_000)

    // Back from a sleep: the room's clock is now read 60 s further on than this page thinks
    net.resume()
    vi.advanceTimersByTime(1_000)
    expect(net.sent.length).toBeGreaterThanOrEqual(3)
    net.answer(performance.now() + 1_060_000)
    expect(clock.now() - performance.now()).toBeGreaterThan(before + 50_000)

    clock.stop()
    expect(net.resumers.size).toBe(0)
  })
})
