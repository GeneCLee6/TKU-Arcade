import { describe, expect, it } from 'vitest'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import {
  cycleSeat,
  keyCommand,
  padCommands,
  watchOrder,
  type WatchedSpot,
} from '../../shared/kart/watch.ts'

const track = raceTrack('riverside')!

const spotAt = (gate: number, crossings = 1): WatchedSpot => {
  const one = track.gates[gate]!
  return { crossings, nextGate: gate, x: (one.ax + one.bx) / 2, z: (one.az + one.bz) / 2 }
}

describe('watching a race (e9-t10)', () => {
  it('orders the finished by time, then the rest by how far round, then those out', () => {
    const spots = new Map<number, WatchedSpot>([
      [0, spotAt(2)],
      [1, spotAt(5)],
      [2, spotAt(1, 2)],
      [4, spotAt(9)],
    ])
    const order = watchOrder(
      track,
      [
        { seat: 0, finishMs: null, out: false },
        { seat: 1, finishMs: null, out: false },
        { seat: 2, finishMs: null, out: false },
        { seat: 3, finishMs: 61_000, out: false },
        { seat: 4, finishMs: null, out: true },
        { seat: 5, finishMs: 60_000, out: false },
        { seat: 6, finishMs: null, out: false },
      ],
      (seat) => spots.get(seat) ?? null,
    )
    // Seat 2 is a lap ahead; seat 6 has sent nothing yet
    expect(order).toEqual([5, 3, 2, 1, 0, 6, 4])
  })

  it('goes round the karts either way', () => {
    expect(cycleSeat([3, 1, 4], 1, 1)).toBe(4)
    expect(cycleSeat([3, 1, 4], 4, 1)).toBe(3)
    expect(cycleSeat([3, 1, 4], 3, -1)).toBe(4)
    expect(cycleSeat([3, 1, 4], null, 1)).toBe(3)
    expect(cycleSeat([3, 1, 4], 9, -1)).toBe(3)
    expect(cycleSeat([], 1, 1)).toBeNull()
  })

  it('reads keys and gamepad presses, each press once', () => {
    expect(keyCommand('ArrowRight')).toBe('next')
    expect(keyCommand('KeyA')).toBe('previous')
    expect(keyCommand('KeyV')).toBe('view')
    expect(keyCommand('Space')).toBe('pause')
    expect(keyCommand('KeyZ')).toBeNull()
    const none: boolean[] = []
    const bumper = Array.from({ length: 16 }, (_, i) => i === 5)
    expect(padCommands(none, bumper)).toEqual(['next'])
    expect(padCommands(bumper, bumper)).toEqual([])
    const several = Array.from({ length: 16 }, (_, i) => i === 3 || i === 14 || i === 0)
    expect(padCommands(none, several).sort()).toEqual(['pause', 'previous', 'view'])
  })
})
