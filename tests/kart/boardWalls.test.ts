// 2026-11-23 (docs/SECURITY.md §11, docs/ARCHITECTURE.md §4.92): the leaderboard's walls
// (shared/kart/boardWalls.ts). Real runs go through no wall, with the master's technical line (drift
// jumps over the fences, onto the platforms, down the real branches) and the reset key; a forged run
// that cuts through a kerb between two gates, steps through one and back, or claims a flight off no
// lip to clear a fence is refused `wall`, every other check passed. The full sweep (all 28 tracks,
// the four drivers and the autopilot, karts and bikes, resets) is `npm run kart:board-walls`.
import { describe, expect, it } from 'vitest'
import { checkBoardRun } from '../../shared/kart/boardCheck.ts'
import { throughWall, wallCrossed, WALL_END_INSET, type WallSample } from '../../shared/kart/boardWalls.ts'
import { decodeTape, type Replay } from '../../shared/kart/replay.ts'
import { readReplayFile } from '../../shared/kart/replayFile.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import type { Wall } from '../../shared/kart/walls.ts'
import { boardFile, driveBoardRun, retape } from './boardDrive.ts'

const check = async (replay: Replay, track: Track) => {
  const read = await readReplayFile(await boardFile(replay, track))
  if (!read.ok) throw new Error(read.problem)
  return checkBoardRun(read.file, track, track.revision ?? 1)
}

const at = (x: number, z: number, y = 0, airborne = false): WallSample => ({ x, z, airborne, height: () => y })

describe('a chord and a wall', () => {
  const wall: Wall = { ax: 0, az: 0, bx: 10, bz: 0 }
  it('through the line is through the wall; beside it, or round its free end, is not', () => {
    expect(wallCrossed([wall], at(5, -1), at(5, 1))).toBe(0)
    expect(wallCrossed([wall], at(5, -1), at(6, -0.2))).toBe(-1)
    // Round the end: within WALL_END_INSET of it
    expect(wallCrossed([wall], at(10 - WALL_END_INSET / 2, -1), at(10 - WALL_END_INSET / 2, 1))).toBe(-1)
    expect(wallCrossed([wall], at(11, -1), at(11, 1))).toBe(-1)
    // A sample right on the line is on one side of it: two chords cannot step through by it
    expect(wallCrossed([wall], at(5, -1), at(5, 0))).toBe(0)
    expect(wallCrossed([wall], at(5, 0), at(5, 1))).toBe(-1)
    expect(wallCrossed([wall], at(5, 1), at(5, 0))).toBe(-1)
    expect(wallCrossed([wall], at(5, 0), at(5, -1))).toBe(0)
  })

  it('leaves no gap where two walls meet', () => {
    const next: Wall = { ax: 10, az: 0, bx: 20, bz: 2 }
    expect(wallCrossed([wall, next], at(10.3, -1), at(10.3, 1))).toBe(1)
    expect(wallCrossed([wall, next], at(9.7, -1), at(9.7, 1))).toBe(0)
  })

  it('is flown over only by a kart in the air at its top, and passed under or over at a crossing', () => {
    const fence: Wall = { ...wall, top: 1.5 }
    expect(wallCrossed([fence], at(5, -1, 2), at(5, 1, 2))).toBe(0)
    expect(wallCrossed([fence], at(5, -1, 2, true), at(5, 1, 2, true))).toBe(-1)
    expect(wallCrossed([fence], at(5, -1, 0, true), at(5, 1, 0, true))).toBe(0)
    // A kerb of the road 6 m up: under it on the road below, over it on the road above, in it at its own
    const kerb: Wall = { ...wall, base: 4.5, top: 9.5 }
    expect(wallCrossed([kerb], at(5, -1, 0), at(5, 1, 0))).toBe(-1)
    expect(wallCrossed([kerb], at(5, -1, 12), at(5, 1, 12))).toBe(-1)
    expect(wallCrossed([kerb], at(5, -1, 6), at(5, 1, 6))).toBe(0)
  })
})

describe('a forged run through a wall', () => {
  // The gates stand kerb to kerb a few seconds apart, so a corner cut across the infield already
  // misses one (laps). What the gates do not see is a wall on the road itself: a fence the master
  // flies over, a platform's face, the kerb between two roads side by side
  it.each([
    ['wharf', 3],
    ['breakwater', 3],
  ] as const)(
    '%s: the master’s flights over a fence or onto a platform, driven on the ground instead, are refused',
    async (id, seed) => {
      const track = raceTrack(id)!
      const replay = driveBoardRun(track, 'ray', 'spade', undefined, 'master', seed)!
      expect(await check(replay, track), id).toMatchObject({ ok: true })
      const grounded = retape(replay, (sample) => {
        const { airborne: _, ...rest } = sample
        return rest
      })
      // Without its walls the track takes it (every other check passes); with them it is refused
      expect(await check(grounded, { ...track, allWalls: [] }), id).toMatchObject({ ok: true })
      const verdict = await check(grounded, track)
      expect(verdict, id).toMatchObject({ ok: false, why: 'wall' })
      // The wall it went through is one a flying kart clears: a fence's or a platform face's top
      const samples = decodeTape(grounded.karts[0]!.bytes)
      const at = verdict.ok ? 0 : verdict.at!
      const through = wallCrossed(
        courseOf(track).walls,
        { x: samples[at - 1]!.x, z: samples[at - 1]!.z, airborne: false, height: () => 0 },
        { x: samples[at]!.x, z: samples[at]!.z, airborne: false, height: () => 0 },
      )
      expect(courseOf(track).walls[through]?.top, id).toBeDefined()
    },
    60_000,
  )

  it('a step through a kerb and back, beside the road for a tenth of a second, is refused', async () => {
    const track = raceTrack('riverside')!
    const replay = driveBoardRun(track, 'tide', 'spade')!
    const samples = decodeTape(replay.karts[0]!.bytes)
    const walls = courseOf(track).walls
    // The sample nearest a kerb (away from its ends), stepped a metre past that kerb's line
    let best: { index: number; distance: number; x: number; z: number } | null = null
    samples.forEach((sample, index) => {
      if (index < 50 || sample.reset || index > samples.length - 50) return
      for (const wall of walls) {
        const dx = wall.bx - wall.ax
        const dz = wall.bz - wall.az
        const length = Math.hypot(dx, dz)
        if (length < 4) continue
        const t = ((sample.x - wall.ax) * dx + (sample.z - wall.az) * dz) / (length * length)
        if (t < 0.3 || t > 0.7) continue
        const px = wall.ax + dx * t
        const pz = wall.az + dz * t
        const distance = Math.hypot(px - sample.x, pz - sample.z)
        if (best && distance >= best.distance) continue
        best = { index, distance, x: px + ((px - sample.x) / distance) * 1, z: pz + ((pz - sample.z) / distance) * 1 }
      }
    })
    const { index, x, z } = best!
    const stepped = retape(replay, (one, n) => (n === index ? { ...one, x, z } : one))
    expect(await check(stepped, { ...track, allWalls: [] })).toMatchObject({ ok: true })
    expect(await check(stepped, track)).toEqual({ ok: false, why: 'wall', at: index })
    // Claimed as a flight, off no lip: still on the ground, still through the kerb
    const flown = retape(replay, (one, n) => (n === index ? { ...one, x, z, airborne: true } : one))
    expect(await check(flown, track)).toEqual({ ok: false, why: 'wall', at: index })
  })
})

describe('real runs', () => {
  it.each(['wharf', 'breakwater', 'zhuwei', 'works-rev', 'breakwater-rev'] as const)(
    '%s: the master’s technical line (drift jumps, fences, platforms, branches, a crossing) goes through no wall',
    (id) => {
      const track = raceTrack(id)!
      const course = courseOf(track)
      for (const seed of [3, 15]) {
        const replay = driveBoardRun(track, 'ray', 'spade', undefined, 'master', seed)!
        const samples = decodeTape(replay.karts[0]!.bytes)
        expect(samples.some((sample) => sample.airborne), id).toBe(true)
        expect(throughWall(course.walls, course.terrain, samples), `${id} ${seed}`).toBe(-1)
      }
    },
    60_000,
  )
})
