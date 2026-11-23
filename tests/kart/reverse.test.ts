// 2026-11-23 (#131, docs/ARCHITECTURE.md §4.87): the tracks driven the other way round. The reversal
// itself (shared/kart/tracks/reverse.ts), what it does to each thing that has a direction, and every
// reversed track's geometry; the computer karts' three laps are in reverseBots.test.ts.
import { describe, expect, it } from 'vitest'
import { roadDepth } from '../../shared/kart/branches.ts'
import { KART_RADIUS } from '../../shared/kart/kartRadius.ts'
import { MAX_GRADE, parseTrack, recordKey, type RoadPoint, type Track, type TrackJson } from '../../shared/kart/track.ts'
import { RACE_TRACK_IDS, REVERSE_TRACK_IDS, isRaceTrackId } from '../../shared/kart/tracks/list.ts'
import { RACE_TRACKS, raceTrack } from '../../shared/kart/tracks/registry.ts'
import {
  forwardId,
  isReverseId,
  reverseId,
  reverseTrack,
  turnJumps,
} from '../../shared/kart/tracks/reverse.ts'
import { trackGuide, routeGuide } from '../../shared/kart/tracks/guides.ts'

const parsed = (json: TrackJson): Track => {
  const result = parseTrack(json)
  if ('problems' in result) throw new Error(result.problems.join('; '))
  return result.track
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

describe('reversing a track', () => {
  it('names a reversed track by its original’s id, and back', () => {
    expect(reverseId('fort')).toBe('fort-rev')
    expect(forwardId('fort-rev')).toBe('fort')
    expect(forwardId('fort')).toBe('fort')
    expect(isReverseId('fort-rev')).toBe(true)
    expect(isReverseId('custom:abc')).toBe(false)
    expect(isRaceTrackId('fort-rev')).toBe(true)
    expect(isRaceTrackId('nope-rev')).toBe(false)
  })

  it.each(RACE_TRACK_IDS)('%s: reversed twice is the original road, gates and respawns', (id) => {
    const json = RACE_TRACKS[id]
    const once = reverseTrack(json).track
    const twice = reverseTrack(once).track
    expect(twice.road.map((p) => [p.x, p.z, p.width, p.bank ?? 0])).toEqual(
      json.road.map((p) => [p.x, p.z, p.width, p.bank ?? 0]),
    )
    expect(twice.gates).toEqual(json.gates)
    twice.respawns.forEach((spot, index) => {
      const was = json.respawns[index]!
      expect([spot.x, spot.z]).toEqual([was.x, was.z])
      expect(Math.abs(wrap(spot.heading - was.heading))).toBeLessThan(1e-5)
    })
    // The jumps are where they were, their ramps on the original's side again (within a centimetre
    // or two of rounding, but for a short drop whose ramp had to be eased)
    expect(twice.jumps ?? []).toEqual(json.jumps ?? [])
  })

  it.each(RACE_TRACK_IDS)('%s: turns the road and what has a direction', (id) => {
    const json = RACE_TRACKS[id]
    const { track: reversed, notes } = reverseTrack(json)
    const n = json.road.length
    expect(reversed.id).toBe(`${id}-rev`)
    // A reversed track's records are its own, and follow its original's revision
    expect(recordKey(reversed)).not.toBe(recordKey(json))
    expect(reversed.revision).toBe(json.revision ?? 1)
    // Road point 0 (the line) stays; the rest the other way round, each leaning the other way
    reversed.road.forEach((point, index) => {
      const was = json.road[(n - index) % n]!
      expect([point.x, point.z, point.width]).toEqual([was.x, was.z, was.width])
      expect(point.bank ?? 0).toBe(was.bank ? -was.bank : 0)
    })
    // The finish line is the same line, its ends swapped
    expect(reversed.gates[0]).toEqual({
      ax: json.gates[0]!.bx,
      az: json.gates[0]!.bz,
      bx: json.gates[0]!.ax,
      bz: json.gates[0]!.az,
    })
    expect(reversed.gates).toHaveLength(json.gates.length)
    // Boost pads face the other way
    reversed.boostPads.forEach((pad) => {
      const was = json.boostPads.find((one) => one.x === pad.x && one.z === pad.z)!
      expect(Math.abs(wrap(pad.heading - was.heading - Math.PI))).toBeLessThan(1e-5)
    })
    // Every lip is turned round where it stands, none taken out
    expect(notes.jumpsRemoved).toBe(0)
    expect(reversed.jumps ?? []).toEqual((json.jumps ?? []).map((lip) => (n - lip) % n).sort((a, b) => a - b))
    // A branch flown into (a high platform, the works' deck) is closed; the rest are kept, reversed
    for (const branch of json.branches ?? []) {
      const flown = branch.rise !== undefined || (json.jumps ?? []).includes(branch.from)
      const kept = (reversed.branches ?? []).find((one) => one.from === (n - branch.to) % n)
      if (flown) expect(kept).toBeUndefined()
      else {
        expect(kept?.to).toBe((n - branch.from) % n)
        expect(kept?.road.map((p) => [p.x, p.z])).toEqual([...branch.road].reverse().map((p) => [p.x, p.z]))
      }
    }
    // A moving obstacle keeps its clock and its place, its sides swapped
    ;(reversed.obstacles ?? []).forEach((one, index) => {
      const was = json.obstacles![index]!
      expect(one.period).toBe(was.period)
      expect(one.shift).toBe(was.shift)
      if (one.kind === 'boom' && was.kind === 'boom') expect([one.from, one.to]).toEqual([-was.to, -was.from])
      if (one.kind === 'slider' && was.kind === 'slider') expect([one.a, one.b]).toEqual([-was.a, -was.b])
    })
  })

  it('has no guide of its original’s: the computer karts drive it by its road', () => {
    for (const id of REVERSE_TRACK_IDS) {
      expect(trackGuide(id)).toBeUndefined()
      expect(routeGuide(id)).toBeUndefined()
    }
  })

  it('closes the high platforms and leaves off what stood on them alone', () => {
    const { track, notes } = reverseTrack(RACE_TRACKS.breakwater)
    expect(track.branches).toBeUndefined()
    expect(notes.branchesClosed).toBe(3)
    // The two pads on the roofs are gone; the road's own stay
    expect(notes.padsDropped).toBe(2)
    expect(track.boostPads).toHaveLength(RACE_TRACKS.breakwater.boostPads.length - 2)
    // Their lips stay, as jumps the other way round
    expect(track.jumps).toHaveLength(3)
  })
})

describe('turning a jump round', () => {
  /** A straight road along -z, 6 m a point, flat but for one lip */
  const road = (heights: readonly number[]): RoadPoint[] =>
    heights.map((y, index) => ({ x: 0, z: -6 * index, width: 20, y }))

  it('moves the ramp to the other side of the lip, and back again', () => {
    // The original: a ramp up to the lip at 5, then the drop (driven 0 → 9)
    const original = road([2, 2, 2, 2, 2.9, 3.8, 2, 2, 2, 2])
    // Reversed (driven 9 → 0, so point 5 is the reversed road's 4)
    const backwards = [...original].reverse()
    const once = turnJumps(backwards, [4], false)
    expect(once.lips).toEqual([4])
    expect(once.removed).toBe(0)
    // The ramp is before the lip now (the reversed road's 3), the far side flat
    expect(once.points[3]!.y).toBeCloseTo(2.9, 5)
    expect(once.points[5]!.y).toBeCloseTo(2, 5)
    // And turned again, it is the original
    const twice = turnJumps([...once.points].reverse(), [5], false)
    expect(twice.points.map((p) => p.y)).toEqual(original.map((p) => p.y))
  })

  it('takes out a lip at the top of a step, easing the road over it', () => {
    // A step down of 8 m after the lip: driven up, it would be a wall
    const original = road([10, 10, 10, 10, 10.5, 11, 3, 3, 3, 3, 3, 3])
    const backwards = [...original].reverse()
    const turned = turnJumps(backwards, [6], false)
    expect(turned.lips).toEqual([])
    expect(turned.removed).toBe(1)
    for (let index = 0; index + 1 < turned.points.length; index++) {
      const rise = Math.abs((turned.points[index + 1]!.y ?? 0) - (turned.points[index]!.y ?? 0))
      expect(rise).toBeLessThanOrEqual(MAX_GRADE * 6 + 1e-9)
    }
  })
})

describe.each(REVERSE_TRACK_IDS)('the reversed %s', (id) => {
  const track = raceTrack(id)!
  const original = raceTrack(forwardId(id))!

  it('is a race track of its own, checked', () => {
    expect(track.id).toBe(id)
    expect(track.laps).toBe(original.laps)
    // Its name says so in both languages
    expect(track.name.en).toBe(`${original.name.en} (Reverse)`)
    expect(track.name['zh-TW']).toBe(`${original.name['zh-TW']}（反向）`)
    expect(parsed(reverseTrack(RACE_TRACKS[forwardId(id) as keyof typeof RACE_TRACKS]).track).road).toEqual(track.road)
  })

  it('has its gates in order round the road, each respawn on the road facing along it', () => {
    const n = track.road.length
    const nearest = (x: number, z: number) => {
      let best = 0
      track.road.forEach((point, index) => {
        if (Math.hypot(point.x - x, point.z - z) < Math.hypot(track.road[best]!.x - x, track.road[best]!.z - z))
          best = index
      })
      return best
    }
    const at = track.gates.map((gate) => nearest((gate.ax + gate.bx) / 2, (gate.az + gate.bz) / 2))
    expect(at[0]).toBe(0)
    for (let index = 1; index < at.length; index++) expect(at[index]!).toBeGreaterThan(at[index - 1]!)
    // No gap between two gates longer than a fifth of the lap
    for (let index = 0; index < at.length; index++) {
      const next = index + 1 < at.length ? at[index + 1]! : n
      expect(next - at[index]!).toBeLessThan(n / 5)
    }
    track.respawns.forEach((spot, index) => {
      expect(roadDepth(track.road, true, spot.x, spot.z), `respawn ${index}`).toBeGreaterThan(3)
      // Facing the way the road runs there
      const k = nearest(spot.x, spot.z)
      const a = track.road[(k - 1 + n) % n]!
      const b = track.road[(k + 1) % n]!
      const along = Math.atan2(b.x - a.x, -(b.z - a.z))
      expect(Math.abs(wrap(spot.heading - along))).toBeLessThan(0.6)
    })
  })

  it('seats eight on the line, on the road and clear of every jump', () => {
    expect(track.grid).toHaveLength(8)
    const spots = [...track.grid, track.solo!]
    for (const spot of spots) {
      expect(roadDepth(track.road, true, spot.x, spot.z)).toBeGreaterThan(KART_RADIUS)
      for (const lip of track.jumps ?? []) {
        const point = track.road[lip]!
        expect(Math.hypot(point.x - spot.x, point.z - spot.z)).toBeGreaterThan(20)
      }
    }
    for (let a = 0; a < track.grid.length; a++) {
      for (let b = a + 1; b < track.grid.length; b++) {
        const one = track.grid[a]!
        const two = track.grid[b]!
        expect(Math.hypot(one.x - two.x, one.z - two.z)).toBeGreaterThan(2 * KART_RADIUS)
      }
    }
    // Behind the line the way the reversed road runs: the line is ahead of the pole
    const pole = track.grid[0]!
    const line = track.road[0]!
    const ahead = (line.x - pole.x) * Math.sin(pole.heading) - (line.z - pole.z) * Math.cos(pole.heading)
    expect(ahead).toBeGreaterThan(5)
  })
})
