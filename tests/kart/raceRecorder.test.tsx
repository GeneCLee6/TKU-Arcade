import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KartView } from '../../shared/games/kart/types.ts'
import { encodeFrame, relayFrame, type KartFrame } from '../../shared/kart/net.ts'
import { decodeTape } from '../../shared/kart/replay.ts'
import { useRaceRecorder } from '../../src/games/kart/useRaceRecorder.ts'
import type { RoomRealtime } from '../../src/lib/useRoom.ts'

// e9-t10: the race screen records what this browser sees, for the replay

const frame = (tick: number): KartFrame => ({
  tick,
  x: tick,
  z: 0,
  heading: 0,
  vx: 0,
  vz: -30,
  reset: false,
  drifting: false,
  boosting: false,
  skidding: false,
  finished: false,
  driftDirection: 0,
  steer: 0,
  body: 0,
  crossings: 1,
  nextGate: 1,
  seq: tick,
})

const view = (seed: number, you: number | null): KartView => ({
  track: 'riverside',
  laps: 1,
  phase: 'racing',
  goAt: 1000,
  racers: [0, 1].map((seat) => ({
    seat,
    loaded: true,
    lapMs: [],
    finishMs: null,
    out: false,
    item: null,
    shieldUntil: 0,
  })),
  mode: 'race',
  seed,
  boxes: [],
  draws: 0,
  events: [],
  shots: [],
  used: 0,
  you,
})

function channel() {
  const listeners = new Set<(data: Uint8Array) => void>()
  const realtime: RoomRealtime = {
    send: vi.fn(() => true),
    listen: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return { realtime, deliver: (data: Uint8Array) => listeners.forEach((one) => one(data)) }
}

describe('recording the race (e9-t10)', () => {
  it('keeps this kart as it sends and the others as they come', async () => {
    const { realtime, deliver } = channel()
    const { result } = renderHook(() => useRaceRecorder(view(7, 0), realtime))
    const sent = encodeFrame(frame(0))
    expect(result.current.realtime!.send(sent)).toBe(true)
    expect(realtime.send).toHaveBeenCalledWith(sent)
    // A clock ping goes out untouched and is not a frame
    result.current.realtime!.send(new Uint8Array(9))
    deliver(relayFrame(1, encodeFrame(frame(0))))
    deliver(relayFrame(1, encodeFrame(frame(6))))
    // 2026-11-22: what came before the recording's chunk is kept for it, in order
    await result.current.recorder.ready
    const replay = result.current.recorder.replay()
    expect(replay.karts.map((kart) => [kart.seat, decodeTape(kart.bytes).length])).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  it('records a watcher too, and starts again for the next race', async () => {
    const { realtime, deliver } = channel()
    const { result, rerender } = renderHook(
      ({ seed }) => useRaceRecorder(view(seed, null), realtime),
      {
        initialProps: { seed: 1 },
      },
    )
    deliver(relayFrame(0, encodeFrame(frame(0))))
    expect(result.current.recorder.hasFrames()).toBe(false)
    await result.current.recorder.ready
    expect(result.current.recorder.hasFrames()).toBe(true)
    const first = result.current.recorder
    rerender({ seed: 1 })
    expect(result.current.recorder).toBe(first)
    rerender({ seed: 2 })
    expect(result.current.recorder).not.toBe(first)
    await result.current.recorder.ready
    expect(result.current.recorder.hasFrames()).toBe(false)
    deliver(relayFrame(1, encodeFrame(frame(0))))
    expect(result.current.recorder.replay().karts.map((kart) => kart.seat)).toEqual([1])
  })
})
