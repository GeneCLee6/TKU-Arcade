// 2026-11-23 (docs/ARCHITECTURE.md §4.80): the leaderboard's judgement of an uploaded run
// (shared/kart/boardCheck.ts). Real runs, driven without a screen and recorded as /kart records them,
// pass on every board track; a run changed after the fact (too fast, a jump, a time that is not the
// samples', another layout, another shape) or a file that is not one is refused, with the reason.
import { beforeAll, describe, expect, it } from 'vitest'
import { BOARD_TRACKS, boardTime, weeklyTrack } from '../../shared/kart/board.ts'
import { checkBoardRun } from '../../shared/kart/boardCheck.ts'
import { ghostFromReplay, replayLoadout } from '../../shared/kart/boardRun.ts'
import { physicsStamp } from '../../shared/kart/boardStamp.ts'
import { ghostAt } from '../../shared/kart/ghost.ts'
import { speedCapFor } from '../../shared/kart/race.ts'
import { decodeTape, type Replay } from '../../shared/kart/replay.ts'
import { readReplayFile, type ReplayFile } from '../../shared/kart/replayFile.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import type { Track } from '../../shared/kart/track.ts'
import { boardFile, driveBoardRun, retape } from './boardDrive.ts'

const asFile = async (replay: Replay, track: Track): Promise<ReplayFile> => {
  const read = await readReplayFile(await boardFile(replay, track))
  if (!read.ok) throw new Error(read.problem)
  return read.file
}

const check = async (replay: Replay, track: Track, revision = track.revision ?? 1) =>
  checkBoardRun(await asFile(replay, track), track, revision)

describe('a real run', () => {
  it('passes on every board track, the careful driver and a master’s hands alike', async () => {
    expect(BOARD_TRACKS).toContain('zhuwei')
    expect(BOARD_TRACKS).toContain('breakwater')
    for (const [index, id] of BOARD_TRACKS.entries()) {
      const track = raceTrack(id)!
      const hands = index % 2 ? 'master' : undefined
      const replay = driveBoardRun(track, 'tide', 'heart', undefined, hands, index)
      expect(replay, id).not.toBeNull()
      const verdict = await check(replay!, track)
      expect(verdict, id).toMatchObject({ ok: true, run: { kart: 'tide', driver: 'heart' } })
      if (!verdict.ok) continue
      expect(verdict.run.totalMs).toBe(replay!.racers[0]!.finishMs)
      expect(verdict.run.lapMs).toHaveLength(track.laps)
      expect(verdict.run.bestLapMs).toBe(Math.min(...verdict.run.lapMs))
    }
  }, 120_000)

  it('passes with the reset key pressed now and then, between gates and right after one', async () => {
    for (const id of ['riverside', 'works', 'zhuwei'] as const) {
      const track = raceTrack(id)!
      const presses = Array.from({ length: 40 }, (_, n) => 400 + n * 173)
      const replay = driveBoardRun(track, 'kite', 'spade', undefined, 'expert', 3, presses)!
      const resets = decodeTape(replay.karts[0]!.bytes).filter((sample) => sample.reset).length
      expect(resets, id).toBeGreaterThan(10)
      expect(await check(replay, track), id).toMatchObject({ ok: true })
    }
  }, 60_000)

  it('is a ghost to chase, the very run, in its own kart', () => {
    const track = raceTrack('riverside')!
    const replay = driveBoardRun(track, 'eel', 'club')!
    expect(replayLoadout(replay)).toEqual({ kart: 'eel', driver: 'club' })
    const ghost = ghostFromReplay(replay, 'riverside')!
    expect(ghost.kart).toBe('eel')
    expect(ghost.total).toBe(Math.round((replay.racers[0]!.finishMs! * 60) / 1000))
    expect(Math.abs(ghost.laps.reduce((sum, lap) => sum + lap, 0) - ghost.total)).toBeLessThanOrEqual(3)
    const samples = decodeTape(replay.karts[0]!.bytes)
    const middle = samples.find((sample) => sample.tick % 3 === 0 && sample.tick > 3000)!
    const there = ghostAt(ghost, middle.tick)!
    expect(Math.hypot(there.x - middle.x, there.z - middle.z)).toBeLessThan(0.05)
  })
})

describe('a run changed after the fact, or not a run', () => {
  let track: Track
  let replay: Replay
  beforeAll(() => {
    track = raceTrack('riverside')!
    replay = driveBoardRun(track)!
  })

  it('too fast for its kart: speed', async () => {
    const cap = speedCapFor('tide')
    const fast = retape(replay, (sample, index) =>
      index === 200 ? { ...sample, vx: cap + 5, vz: 0 } : sample,
    )
    expect(await check(fast, track)).toEqual({ ok: false, why: 'speed', at: 200 })
  })

  it('a jump along the road: jump', async () => {
    const jumped = retape(replay, (sample, index) =>
      index >= 300 ? { ...sample, x: sample.x + 40 } : sample,
    )
    expect(await check(jumped, track)).toMatchObject({ ok: false, why: 'jump', at: 300 })
  })

  it('a reset to nowhere a reset goes: reset', async () => {
    const reset = retape(replay, (sample, index) =>
      index >= 300 ? { ...sample, x: sample.x + 400, reset: index === 300 } : sample,
    )
    expect(await check(reset, track)).toMatchObject({ ok: false, why: 'reset', at: 300 })
  })

  it('off the road, beside it, past the gates: laps', async () => {
    // Moved off the road through a reset that lands near a respawn point, and driven on beside the
    // road from there: the gates are the server's to count, and none of them is crossed
    const beside = retape(replay, (sample, index) =>
      index >= 300 ? { ...sample, x: sample.x + 25, reset: index === 300 } : sample,
    )
    const verdict = await check(beside, track)
    expect(verdict.ok).toBe(false)
  })

  it('the whole run squeezed into less time: refused', async () => {
    // Every tick two thirds of what it was: the same road in less time
    const squeezed = retape(replay, (sample) => ({ ...sample, tick: Math.round((sample.tick * 2) / 3) }))
    expect((await check(squeezed, track)).ok).toBe(false)
  })

  it('a time that is not the samples’: time', async () => {
    const racer = replay.racers[0]!
    const quicker = {
      ...replay,
      racers: [
        { ...racer, lapMs: racer.lapMs.map((ms) => ms - 1000), finishMs: racer.finishMs! - 3000 },
      ],
    }
    expect(await check(quicker, track)).toEqual({ ok: false, why: 'time' })
    const lastShort = { ...replay, racers: [{ ...racer, finishMs: racer.finishMs! - 200 }] }
    expect(await check(lastShort, track)).toEqual({ ok: false, why: 'time' })
  })

  it('a lap not driven: refused', async () => {
    // The last third of the samples left out, the finish flag moved back
    const samples = decodeTape(replay.karts[0]!.bytes)
    const cut = Math.floor((samples.length * 2) / 3)
    const short = retape(replay, (sample, index) =>
      index > cut ? null : index === cut ? { ...sample, finished: true } : sample,
    )
    const verdict = await check(short, track)
    expect(verdict.ok).toBe(false)
    expect(['laps', 'time']).toContain(verdict.ok ? null : verdict.why)
  })

  it('a gap in the samples, a start off the grid: samples', async () => {
    const gap = retape(replay, (sample, index) => (index === 100 ? null : sample))
    expect(await check(gap, track)).toEqual({ ok: false, why: 'samples', at: 100 })
    const late = retape(replay, (sample, index) => (index < 10 ? null : sample))
    expect(await check(late, track)).toEqual({ ok: false, why: 'samples', at: 0 })
  })

  it('another track, an old layout, another shape', async () => {
    expect(await check(replay, raceTrack('harbour')!)).toEqual({ ok: false, why: 'track' })
    const revision = track.revision ?? 1
    expect(await check(replay, track, revision + 1)).toEqual({ ok: false, why: 'revision' })
    const file = await asFile(replay, track)
    expect(checkBoardRun({ ...file, revision: revision + 1 }, track, revision)).toEqual({
      ok: false,
      why: 'revision',
    })
    expect(await check({ ...replay, mode: 'items' }, track)).toEqual({ ok: false, why: 'shape' })
    expect(await check({ ...replay, laps: 2 }, track)).toEqual({ ok: false, why: 'shape' })
    const two = { ...replay, racers: [...replay.racers, { ...replay.racers[0]!, seat: 1 }] }
    expect(await check(two, track)).toEqual({ ok: false, why: 'shape' })
  })

  it('a file that is not one is never read as one', async () => {
    const good = await boardFile(replay, track)
    expect((await readReplayFile(good.slice(0, 40))).ok).toBe(false)
    const flipped = good.slice()
    flipped[20] = flipped[20]! ^ 0xff
    expect((await readReplayFile(flipped)).ok).toBe(false)
    expect((await readReplayFile(new TextEncoder().encode('hello'))).ok).toBe(false)
  })
})

describe('the board’s small parts', () => {
  it('has a board for every race track, and only those', () => {
    expect([...BOARD_TRACKS]).toEqual([...RACE_TRACK_IDS])
  })

  it('turns the week’s track every Monday in Taipei, through every track', () => {
    const monday = Date.UTC(2026, 10, 22, 16) // Monday 23 November 2026, 00:00 in Taipei
    const week = 7 * 86_400_000
    expect(weeklyTrack(monday - 1)).not.toBe(weeklyTrack(monday))
    expect(weeklyTrack(monday)).toBe(weeklyTrack(monday + week - 1))
    const seen = new Set(BOARD_TRACKS.map((_, n) => weeklyTrack(monday + n * week)))
    expect(seen.size).toBe(BOARD_TRACKS.length)
  })

  it('writes times as a clock and stamps the physics', () => {
    expect(boardTime(83_456)).toBe('1:23.456')
    expect(boardTime(5_007)).toBe('0:05.007')
    expect(physicsStamp()).toMatch(/^\d+-[0-9a-f]{8}$/)
  })
})
