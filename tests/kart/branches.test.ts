// 2026-11-20 (owner: "shortcuts only the skilled get through"; docs/ARCHITECTURE.md §4.40): branches
// in the track format. A road of its own off the main road and back: checked (never across itself
// or the main road, clear of it between its ends, its gates clear, within its limits), its kerbs
// cut open where it meets the main road, its gates standing in for the main road's it goes round,
// counted the same way by the browser (passGates) and the server (judgeFrame), its respawns, its
// heights, the wrong way on it, a route down it for the computer's hands, and the editor's bypasses
// checked as the server checks them. A track without a branch is as it was (branchGolden.test.ts).
import { describe, expect, it } from 'vitest'
import {
  forkAt,
  gateLines,
  MAX_BRANCHES,
  placeOnTrack,
  roadDepth,
  routeRoad,
} from '../../shared/kart/branches.ts'
import { linesOf, passGates, respawnNear, type GateProgress } from '../../shared/kart/course.ts'
import { CODE_VERSION, decodeSpec, encodeSpec } from '../../shared/kart/editor/codec.ts'
import { buildSpec } from '../../shared/kart/editor/build.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import { starterSpec, type TrackSpec } from '../../shared/kart/editor/spec.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import {
  gatesPassed,
  judgeFrame,
  lapsDone,
  raceProgress,
  startTracking,
  type JudgeContext,
  type Tracked,
} from '../../shared/kart/race.ts'
import { groundAt } from '../../shared/kart/terrain.ts'
import {
  goingBackwards,
  startTrial,
  stepTrial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, gateCrossing, parseTrack, type Track } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Wall } from '../../shared/kart/walls.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'
import { FORK_FROM, FORK_MAIN, FORK_TO, forkBranch, forkJson } from './branchTrack.ts'
import { driveFrames } from './raceDriver.ts'

const parsed = (json: unknown): Track => {
  const result = parseTrack(json)
  if ('problems' in result) throw new Error(result.problems.join('; '))
  return result.track
}
const problemsOf = (json: unknown): string[] => {
  const result = parseTrack(json)
  return 'problems' in result ? result.problems : []
}

const track = parsed(forkJson())
const fork = track.forks![0]!

/** Whether segment ab crosses wall w */
function crosses(a: { x: number; z: number }, b: { x: number; z: number }, w: Wall): boolean {
  const cross = (o: { x: number; z: number }, p: { x: number; z: number }, q: { x: number; z: number }) =>
    (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x)
  const c = { x: w.ax, z: w.az }
  const d = { x: w.bx, z: w.bz }
  return cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0
}

/** Places every `step` metres along a closed centre line, `laps` times round */
function along(points: readonly { x: number; z: number }[], step = 1, laps = 1) {
  const out: { x: number; z: number }[] = []
  for (let lap = 0; lap < laps; lap++) {
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length]!
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      for (let s = 0; s < length; s += step) {
        out.push({ x: a.x + ((b.x - a.x) * s) / length, z: a.z + ((b.z - a.z) * s) / length })
      }
    })
  }
  return out
}

describe('the format', () => {
  it('checks a branch and works out what it adds: its whole centre line, the gates it stands in for', () => {
    expect(track.forks).toHaveLength(1)
    expect(fork.from).toBe(FORK_FROM)
    expect(fork.to).toBe(FORK_TO)
    // Its ends are the main road's points, as wide as the branch
    expect(fork.path[0]).toMatchObject({ x: FORK_MAIN.road[FORK_FROM]!.x, width: 10 })
    expect(fork.path.at(-1)).toMatchObject({ x: FORK_MAIN.road[FORK_TO]!.x, width: 10 })
    // Every main gate strictly between its ends has a stand-in on it, in a row
    expect(fork.count).toBeGreaterThanOrEqual(2)
    expect(fork.gates).toHaveLength(fork.count)
    expect(fork.respawns).toHaveLength(fork.count)
    // The JSON keeps the branch as it was given (the round trip is the same track)
    expect(parsed(JSON.parse(JSON.stringify(track))).allWalls).toEqual(track.allWalls)
  })

  it('cuts the kerbs open where the roads meet: down either road, no wall is ever crossed', () => {
    for (const taken of [[], [0]]) {
      const route = routeRoad(track, taken)
      const places = along(route.road, 1)
      for (let index = 0; index + 1 < places.length; index++) {
        for (const wall of track.allWalls) {
          expect(crosses(places[index]!, places[index + 1]!, wall)).toBe(false)
        }
      }
    }
    // ... and the kerbs still close the road round: more walls than the main road's two kerbs
    expect(track.allWalls.length).toBeGreaterThan(FORK_MAIN.road.length * 2)
  }, 60_000)

  it('refuses a branch that is not a road of its own, and says why', () => {
    const base = forkBranch()
    const cases: [unknown, RegExp][] = [
      ['not a list', /branches: not a list/],
      [[{ ...base, from: 30, to: 31 }], /to at least two after from/],
      [[{ ...base, from: -1 }], /main road points/],
      [[{ ...base, road: [] }], /from 1 to 400 points/],
      [[{ ...base, road: [{ x: 'a', z: 0, width: 10 }] }], /must be numbers/],
      [[{ ...base, jumps: [999] }], /jumps: each a point of its road/],
      // Never off the main road: along it, three metres to one side
      [
        [
          {
            from: FORK_FROM,
            to: FORK_TO,
            road: FORK_MAIN.road.slice(FORK_FROM + 1, FORK_TO).map((point) => ({ ...point, x: point.x - 3, width: 10 })),
          },
        ],
        /never runs clear/,
      ],
      // Back across the main road
      [
        [{ from: FORK_FROM, to: FORK_TO, road: base.road.map((point) => ({ ...point, x: point.x + 60 })) }],
        /crosses the main road|runs into the main road|never runs clear/,
      ],
    ]
    for (const [branches, why] of cases) {
      let problems: string[]
      try {
        problems = problemsOf(forkJson(branches as never))
      } catch (error) {
        problems = [String(error)]
      }
      expect(problems.join('\n'), String(why)).toMatch(why)
    }
  })

  it('refuses a branch round the finish line, one that crosses itself, two that touch, and too many', () => {
    // Round the finish line: from late in the lap to early in it is not a branch
    expect(problemsOf(forkJson([{ ...forkBranch(), from: 40, to: 16 }])).join()).toMatch(
      /to at least two after from/,
    )
    // A loop in itself (the main road runs north, -z, from (0, 0); its left is -x)
    const knot = [
      [-12, -100],
      [-30, -110],
      [-40, -140],
      [-40, -180],
      [-25, -160],
      [-55, -160],
      [-40, -200],
      [-30, -225],
      [-12, -235],
    ].map(([x, z]) => ({ x: x!, z: z!, width: 10 }))
    expect(problemsOf(forkJson([{ from: FORK_FROM, to: FORK_TO, road: knot }])).join()).toMatch(
      /crosses itself/,
    )
    // Two at once, overlapping spans
    expect(problemsOf(forkJson([forkBranch(), forkBranch()])).join()).toMatch(/each leaves after/)
    // More than the limit
    expect(
      problemsOf(forkJson(Array.from({ length: MAX_BRANCHES + 1 }, () => forkBranch()))).join(),
    ).toMatch(/more than 6/)
  })

  it('refuses a branch whose mouth lies on a gate of the main road', () => {
    // Leaving right after gate 2 (road point 14) puts that gate in its mouth
    const problems = problemsOf(forkJson([forkBranch(undefined, 14, FORK_TO)]))
    expect(problems.join()).toMatch(/touches gates\[\d+\]/)
  })

  it('caps the size: a branch of too many points, and too many points in all', () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ x: i * 2, z: -500, width: 10 }))
    expect(problemsOf(forkJson([{ from: 16, to: 40, road: many }])).join()).toMatch(/400 points/)
  })
})

describe('the race on a branch', () => {
  const checkpoints = courseOf(track).checkpoints!
  const route = routeRoad(track, [0])

  it('has every gate a line on the main road, and those it goes round a stand-in on the branch', () => {
    const lines = checkpoints.lines!
    expect(lines).toHaveLength(track.gates.length)
    lines.forEach((all, gate) => {
      expect(all[0]!.gate).toBe(track.gates[gate])
      const inside = gate >= fork.first && gate < fork.first + fork.count
      expect(all).toHaveLength(inside ? 2 : 1)
      if (inside) expect(all[1]!.route).toBe(1)
    })
    expect(linesOf(checkpoints, fork.first)).toHaveLength(2)
    expect(gateLines(track.gates, track.respawns, undefined)).toBeNull()
  })

  it('counts every gate in order down the branch, as down the main road: three laps either way', () => {
    for (const road of [track.road, route.road]) {
      const places = [track.grid[0]!, ...along(road, 1, 3), road[0]!, road[1]!]
      let progress: GateProgress = { nextGate: 0, crossings: 0, safe: track.grid[0]! }
      let counted = 0
      for (let index = 0; index + 1 < places.length; index++) {
        const next = passGates(progress, places[index]!, places[index + 1]!, checkpoints, track.grid[0]!)
        if (gatesPassed(next.crossings, next.nextGate, track.gates.length) > gatesPassed(progress.crossings, progress.nextGate, track.gates.length)) counted++
        progress = next
      }
      expect(lapsDone(progress.crossings)).toBe(3)
      expect(counted).toBe(track.gates.length * 3 + 1)
    }
  })

  it('puts a kart reset on the branch back on the branch, and driving back over a gate undoes it', () => {
    const lines = checkpoints.lines!
    const stand = lines[fork.first + 1]![1]!
    const before = lines[fork.first]![1]!
    // Just before the second stand-in, having passed the first: crossing it forwards passes it
    const gate = stand.gate
    const mid = { x: (gate.ax + gate.bx) / 2, z: (gate.az + gate.bz) / 2 }
    const dir = { x: Math.sin(stand.respawn.heading), z: -Math.cos(stand.respawn.heading) }
    const from = { x: mid.x - dir.x * 2, z: mid.z - dir.z * 2 }
    const to = { x: mid.x + dir.x * 2, z: mid.z + dir.z * 2 }
    const progress: GateProgress = { nextGate: fork.first + 1, crossings: 1, safe: before.respawn }
    const passed = passGates(progress, from, to, checkpoints, track.grid[0]!)
    expect(passed.nextGate).toBe(fork.first + 2)
    expect(passed.safe).toEqual(stand.respawn)
    // Back over it: the safe place is the stand-in before, on the branch, not the main road's
    const back = passGates(passed, to, from, checkpoints, track.grid[0]!)
    expect(back.nextGate).toBe(fork.first + 1)
    expect(back.safe).toEqual(before.respawn)
    // The respawn nearest a place on the branch is the branch's own
    expect(respawnNear(checkpoints, fork.first, stand.respawn.x, stand.respawn.z)).toEqual(before.respawn)
    expect(respawnNear(checkpoints, 1, 0, 0)).toEqual(track.respawns[1])
    // Each stand-in is crossed forwards going down the branch from its respawn
    for (const [index, line] of lines.entries()) {
      for (const one of line.slice(1)) {
        const r = one.respawn
        expect(
          gateCrossing(one.gate, r.x - Math.sin(r.heading) * 3, r.z + Math.cos(r.heading) * 3, r.x + Math.sin(r.heading) * 3, r.z - Math.cos(r.heading) * 3),
          `gate ${index}`,
        ).toBe(1)
      }
    }
  })

  it('the server judges laps down the branch as it judges them down the main road', () => {
    const GO = 100_000
    const run = (road: readonly { x: number; z: number }[]) => {
      let tracked: Tracked = startTracking(track, 0)
      const laps: number[] = []
      const source = driveFrames(track, 0, 2.5, 0, road)
      for (let i = 0; i < 3000 && laps.length < 3; i++) {
        const frame = source.next().value!
        const now = GO + (frame.tick / 60) * 1000
        const context: JudgeContext = { track, slot: 0, now, goAt: GO, laps: laps.length }
        const verdict = judgeFrame(tracked, frame, context)
        expect(verdict.kind).toBe('taken')
        tracked = verdict.tracked
        if (verdict.kind === 'taken' && verdict.lapAt !== null) laps.push(verdict.lapAt)
      }
      return laps
    }
    const length = (road: readonly { x: number; z: number }[]) =>
      road.reduce((sum, a, index) => {
        const b = road[(index + 1) % road.length]!
        return sum + Math.hypot(b.x - a.x, b.z - a.z)
      }, 0)
    for (const road of [track.road, route.road]) {
      const laps = run(road)
      expect(laps).toHaveLength(3)
      // Each lap takes as long as the road it went down, at 50 m/s: every gate was counted
      for (let lap = 1; lap < 3; lap++) {
        expect((laps[lap]! - laps[lap - 1]!) / 1000).toBeCloseTo(length(road) / 50, 0)
      }
    }
  })

  it('the server takes a reset onto a stand-in respawn, and a catch-up past a stand-in', () => {
    const GO = 100_000
    const stand = checkpoints.lines![fork.first]![1]!
    const frame = (over: Partial<ReturnType<typeof base>>) => ({ ...base(), ...over })
    const base = () => ({
      tick: 600,
      x: 0,
      z: 0,
      heading: 0,
      vx: 0,
      vz: 0,
      reset: false,
      drifting: false,
      boosting: false,
      skidding: false,
      finished: false,
      driftDirection: 0 as const,
      steer: 0,
      body: 0,
      crossings: 1,
      nextGate: fork.first,
      seq: 1,
    })
    const tracked: Tracked = {
      ...startTracking(track, 0),
      // Just short of the first stand-in, on the branch
      last: frame({
        x: stand.respawn.x - Math.sin(stand.respawn.heading) * 6,
        z: stand.respawn.z + Math.cos(stand.respawn.heading) * 6,
      }),
      lastAt: GO + 10_000,
      nextGate: fork.first,
      crossings: 1,
    }
    const context: JudgeContext = { track, slot: 0, now: GO + 10_100, goAt: GO, laps: 0 }
    // A reset onto the branch's respawn is believed
    const reset = judgeFrame(tracked, frame({ tick: 606, reset: true, x: stand.respawn.x, z: stand.respawn.z }), context)
    expect(reset.kind).toBe('taken')
    // A reset into the middle of nowhere is not
    const far = judgeFrame(tracked, frame({ tick: 606, reset: true, x: stand.respawn.x + 500, z: stand.respawn.z }), context)
    expect(far.kind).toBe('refused')
    // A kart a gate ahead of the server, just past the stand-in, is caught up with
    const ahead = judgeFrame(
      tracked,
      frame({ tick: 606, x: stand.respawn.x, z: stand.respawn.z, nextGate: fork.first + 1 }),
      context,
    )
    expect(ahead.kind).toBe('taken')
    if (ahead.kind === 'taken') {
      expect(ahead.tracked.nextGate).toBe(fork.first + 1)
      expect(ahead.tracked.safe).toEqual(stand.respawn)
    }
  })

  it('places a kart down the branch by its own gates: the race order grows all the way round', () => {
    const checkpointsOf = courseOf(track).checkpoints!
    let progress: GateProgress = { nextGate: 0, crossings: 0, safe: track.grid[0]! }
    let last = -Infinity
    const places = [track.grid[0]!, ...along(route.road, 2, 1), route.road[0]!, route.road[1]!]
    for (let index = 0; index + 1 < places.length; index++) {
      progress = passGates(progress, places[index]!, places[index + 1]!, checkpointsOf, track.grid[0]!)
      if (progress.crossings === 0) continue
      const at = raceProgress(track, progress.crossings, progress.nextGate, places[index + 1]!.x, places[index + 1]!.z)
      // Near a gate the nearer of its lines is measured to: a little back and forth, never a gate
      expect(at).toBeGreaterThanOrEqual(last - 0.15)
      last = Math.max(last, at)
    }
  })

  it('knows which road a kart is on and which way it runs: never the wrong way down the branch', () => {
    const paths = track.forks!.map((one) => one.path)
    for (let index = 2; index < fork.path.length - 2; index++) {
      const a = fork.path[index]!
      const b = fork.path[index + 1]!
      const vx = (b.x - a.x) * 5
      const vz = (b.z - a.z) * 5
      expect(goingBackwards(track.road, a.x, a.z, vx, vz, paths)).toBe(false)
      expect(goingBackwards(track.road, a.x, a.z, -vx, -vz, paths)).toBe(true)
    }
    const middle = fork.path[Math.floor(fork.path.length / 2)]!
    expect(placeOnTrack(track.road, paths, middle.x, middle.z).fork).toBe(0)
    expect(forkAt(track.road, paths, middle.x, middle.z)).toBe(0)
    expect(forkAt(track.road, paths, track.road[0]!.x, track.road[0]!.z)).toBe(-1)
  })

  it('a computer kart down the branch drives three laps without being told it goes the wrong way', () => {
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    const brain = createBotBrain(BOT_SKILLS.hard, route.road, KART_TUNING, 3, route.jumps)
    let trial = startTrial(course)
    let wrong = 0
    let onBranch = 0
    for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
      trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course)
      if (trial.wrongWay) wrong++
      if (forkAt(track.road, [fork.path], trial.run.kart.x, trial.run.kart.z) === 0) onBranch++
    }
    expect(trial.phase).toBe('finished')
    expect(wrong).toBe(0)
    expect(onBranch).toBeGreaterThan(300)
  }, 60_000)
})

describe('a route', () => {
  it('is the main road with the branch spliced in, every point traced back', () => {
    const route = routeRoad(track, [0])
    expect(route.road.length).toBe(track.road.length - (FORK_TO - FORK_FROM - 1) + fork.path.length - 2)
    route.from.forEach((place, index) => {
      const point = place.fork < 0 ? track.road[place.index]! : fork.path[place.index]!
      expect(route.road[index]).toEqual(point)
    })
    // A main road point it goes round maps to where it joins again
    expect(route.road[route.main[FORK_FROM + 3]!]).toEqual(track.road[FORK_TO])
    expect(routeRoad(track, []).road).toEqual(track.road)
  })

  it('the hands on a track without a branch are the brain they always were, step for step', () => {
    const one = raceTrack('riverside')!
    const plain = courseOf(one)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: one.road }
    const a = createTrackBrain(BOT_SKILLS.hard, one, KART_TUNING, 9)
    const b = createBotBrain(BOT_SKILLS.hard, one.road, KART_TUNING, 9, one.jumps, one.walls)
    let trial = startTrial(course)
    for (let step = 0; step < 1200; step++) {
      const input = a(trial, { speedShare: 1 })
      expect(input).toEqual(b(trial, { speedShare: 1 }))
      trial = stepTrial(trial, input, course)
    }
  })
})

describe('heights on a branch', () => {
  it('the ground is the road a place is deepest in: the deck stands above the yard', () => {
    const works = raceTrack('works')!
    const terrain = courseOf(works).terrain!
    const deck = works.forks![0]!
    const high = deck.path.find((point) => (point.y ?? 0) >= 3)!
    expect(groundAt(terrain, high.x, high.z).y).toBeCloseTo(high.y!, 1)
    // A main road point nowhere near a branch has the main road's height
    const plain = works.road[5]!
    expect(groundAt(terrain, plain.x, plain.z).y).toBeCloseTo(plain.y ?? 0, 5)
    expect(roadDepth(deck.path, false, high.x, high.z)).toBeCloseTo(high.width / 2, 1)
  })
})

describe('the editor’s bypasses', () => {
  const bypassed = (over: Partial<NonNullable<TrackSpec['bypasses']>[number]> = {}): TrackSpec => ({
    ...starterSpec(),
    bypasses: [{ from: 4, to: 4, side: -1, offset: 40, width: 14, ...over }],
  })

  it('a bypass is a branch: kept in the code, built and checked as the server checks it', () => {
    const code = encodeSpec(bypassed())
    expect(decodeSpec(code)?.bypasses).toEqual(bypassed().bypasses)
    const result = customTrack(code)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.track.forks).toHaveLength(1)
    // Its own records: a different layout from the same pieces without it
    expect(result.track.id).not.toBe((customTrack(encodeSpec(starterSpec())) as { track: Track }).track.id)
    expect(CODE_VERSION).toBe(1)
  })

  it('a bypass with no room is refused, naming its pieces; a code out of range is no code at all', () => {
    // Too near the road to run clear of it
    const near = buildSpec(bypassed({ offset: 20, width: 30 }))
    expect(near.problems.map((problem) => problem.code)).toContain('bypass')
    expect(customTrack(encodeSpec(bypassed({ offset: 20, width: 30 }))).ok).toBe(false)
    // Inside the short straight's two bends, too far in: across the road, naming its pieces
    const inside = buildSpec(bypassed({ from: 2, to: 2, side: 1, offset: 90 }))
    expect(inside.problems).toContainEqual({ code: 'bypass', pieces: [2, 2] })
    // Out of range, or more than three, or ending on the last piece: not decoded
    const raw = (b: unknown) =>
      btoa(JSON.stringify({ v: 1, n: '', t: 'day', p: JSON.parse(atob(encodeSpec(starterSpec()).replace(/-/g, '+').replace(/_/g, '/'))).p, b }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    expect(decodeSpec(raw([[4, 4, -1, 40, 14]]))?.bypasses).toHaveLength(1)
    expect(decodeSpec(raw([[4, 4, -1, 10, 14]]))).toBeNull()
    expect(decodeSpec(raw([[4, 4, 0, 40, 14]]))).toBeNull()
    expect(decodeSpec(raw([[5, 4, -1, 40, 14]]))).toBeNull()
    expect(decodeSpec(raw([[4, 8, -1, 40, 14]]))).toBeNull()
    expect(decodeSpec(raw(Array.from({ length: 4 }, () => [4, 4, -1, 40, 14])))).toBeNull()
    expect(decodeSpec(raw([]))).toBeNull()
  })
})
