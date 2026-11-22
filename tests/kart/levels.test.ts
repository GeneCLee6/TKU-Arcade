// 2026-11-22 (#94, #113; docs/ARCHITECTURE.md §4.66): a road over a road, banked bends, karts that
// pass over and under each other, the flights kept in replays and ghosts, the editor's new pieces,
// and the technical showcase that has them all (the Zhuwei Flyover). The tracks without any of it
// are exactly what they were: flatGolden.test.ts and branchGolden.test.ts.
import { describe, expect, it } from 'vitest'
import { forkAt } from '../../shared/kart/branches.ts'
import { startRun, stepRun, type Course, type Run } from '../../shared/kart/course.ts'
import { buildSpec } from '../../shared/kart/editor/build.ts'
import { decodeSpec, encodeSpec } from '../../shared/kart/editor/codec.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import {
  overpass,
  straight,
  turn,
  type TrackSpec,
} from '../../shared/kart/editor/spec.ts'
import { finishRecording, ghostAt, parseGhost, recordStep, startRecording } from '../../shared/kart/ghost.ts'
import {
  findCrossings,
  KERB_FOOT,
  LEVEL_CLEARANCE,
  levelPenalty,
} from '../../shared/kart/levels.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
} from '../../shared/kart/physics.ts'
import { bumpKart } from '../../shared/kart/race.ts'
import { createKartTape, decodeTape, type Replay } from '../../shared/kart/replay.ts'
import { decodeReplay, encodeReplay, REPLAY_VERSION } from '../../shared/kart/replayBlob.ts'
import {
  createHeightKeeper,
  groundAt,
  rollOf,
  terrainOf,
} from '../../shared/kart/terrain.ts'
import {
  nearestRoadPoint,
  startTrial,
  stepTrial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type RoadPoint, type TrackJson } from '../../shared/kart/track.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { ZHUWEI, ZHUWEI_MARKS } from '../../shared/kart/tracks/zhuwei.ts'
import { collideWalls, KART_BODY_HEIGHT } from '../../shared/kart/walls.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES } from '../../src/kart/bots/skill.ts'

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }

/** The editor's figure of eight: a viaduct north, a loop, an underpass west under it, a loop back */
const eight = (rise = 4.5, under = -4.5, more: Partial<TrackSpec> = {}): TrackSpec => ({
  name: 'eight',
  theme: 'day',
  pieces: [overpass(240, rise, 36), turn(270, 120, 36), overpass(240, under, 36), turn(-270, 120, 36)],
  ...more,
})

const eightTrack = () => {
  const made = customTrack(encodeSpec(eight()))
  if (!made.ok) throw new Error('the eight is not legal')
  return made.track
}

describe('crossings: where the road runs over itself', () => {
  it('none on any track made before them', () => {
    for (const id of RACE_TRACK_IDS.filter((one) => one !== 'zhuwei')) {
      const problems: string[] = []
      expect(findCrossings(raceTrack(id)!.road, problems), id).toEqual([])
      expect(problems, id).toEqual([])
      expect(raceTrack(id)!.crossings, id).toBeUndefined()
    }
  })

  it('finds the eight’s crossing, the viaduct over the underpass, square and high enough', () => {
    const track = eightTrack()
    expect(track.crossings).toHaveLength(1)
    const [crossing] = track.crossings!
    expect(crossing!.upperY).toBeCloseTo(4.5)
    expect(crossing!.lowerY).toBeCloseTo(-4.5)
    expect(crossing!.degrees).toBeCloseTo(90, 0)
    expect(crossing!.x).toBeCloseTo(0, 0)
    expect(crossing!.z).toBeCloseTo(-120, 0)
  })

  it('refuses one too low, too shallow, or with anything judged on the plan in its zone', () => {
    const low = buildSpec(eight(3.5, 0))
    expect(low.problems.map((problem) => problem.code)).toContain('crossing')
    // The server checks the same (custom.ts): a code with a crossing too low is not a track
    expect(customTrack(encodeSpec(eight(3.5, 0))).ok).toBe(false)
    // By hand: a gate, a pad and a box in the zone, a bank on the road there
    const track = eightTrack()
    const base: TrackJson = {
      format: track.format,
      id: 'by-hand',
      name: track.name,
      laps: 3,
      road: track.road,
      gates: track.gates,
      respawns: track.respawns,
      grid: track.grid,
      walls: [],
      boostPads: [],
      itemBoxes: [],
      decor: [],
    }
    expect('track' in parseTrack(base)).toBe(true)
    const at = { x: 0, z: -120 }
    const problemsOf = (json: TrackJson) => {
      const parsed = parseTrack(json)
      return 'problems' in parsed ? parsed.problems.join('; ') : ''
    }
    expect(problemsOf({ ...base, itemBoxes: [at] })).toMatch(/itemBoxes\[0\]: at a crossing/)
    expect(
      problemsOf({ ...base, boostPads: [{ ...at, heading: 0, length: 14, width: 7 }] }),
    ).toMatch(/boostPads\[0\]: at a crossing/)
    expect(
      problemsOf({
        ...base,
        gates: [...base.gates, { ax: -18, az: -120, bx: 18, bz: -120 }],
        respawns: [...base.respawns, { ...at, heading: 0 }],
      }),
    ).toMatch(/at a crossing/)
    expect(problemsOf({ ...base, walls: [{ ax: -5, az: -125, bx: 5, bz: -125 }] })).toMatch(
      /walls\[0\]: at a crossing/,
    )
    const crossing = track.crossings![0]!
    const banked = base.road.map((point, index) =>
      index === crossing.upper ? { ...point, bank: 3 } : point,
    )
    expect(problemsOf({ ...base, road: banked })).toMatch(/banked road at a crossing/)
    // Shallow: two roads crossing at 20 degrees
    const shallow: RoadPoint[] = []
    for (let k = 0; k < 60; k++) shallow.push({ x: k * 10, z: 0, width: 30, y: 0 })
    const problems: string[] = []
    const lines = findCrossings(
      [
        ...shallow,
        ...shallow.map((point) => ({
          x: 600 - point.x,
          z: -(600 - point.x) * Math.tan((20 * Math.PI) / 180) + 100,
          width: 30,
          y: 8,
        })),
      ],
      problems,
    )
    expect(lines).toEqual([])
    expect(problems.join()).toMatch(/under 30 degrees/)
  })

  it('stands the kerbs in its zone only round their own road', () => {
    const track = eightTrack()
    const level = track.allWalls.filter((wall) => wall.base !== undefined)
    expect(level.length).toBeGreaterThan(8)
    for (const wall of level) {
      // One road's kerbs never reach the other's surface: a body's height and more apart
      expect(wall.top! - wall.base!).toBeLessThan(LEVEL_CLEARANCE)
    }
  })
})

describe('which road a kart is on at a crossing', () => {
  const track = eightTrack()
  const terrain = terrainOf(track)!

  it('the ground under it is the road it was on: the viaduct from above, the underpass from below', () => {
    expect(groundAt(terrain, 0, -120, 4.5).y).toBeCloseTo(4.5)
    expect(groundAt(terrain, 0, -120, -4.5).y).toBeCloseTo(-4.5)
    // In the air over the viaduct: the viaduct; with nothing to go by: the lower
    expect(groundAt(terrain, 0, -120, 9).y).toBeCloseTo(4.5)
    expect(groundAt(terrain, 0, -120).y).toBeCloseTo(-4.5)
    // The road point nearest it, by its height
    const over = nearestRoadPoint(track.road, 0, -120, 4.5)
    const under = nearestRoadPoint(track.road, 0, -120, -4.5)
    expect(track.road[over]!.y).toBeCloseTo(4.5)
    expect(track.road[under]!.y).toBeCloseTo(-4.5)
    expect(levelPenalty(4.5, -4.5)).toBeGreaterThan(1000)
    expect(levelPenalty(4.4, 4.5)).toBe(0)
  })

  /** A kart driven flat out straight through the crossing along one arm, every step */
  function through(from: { x: number; z: number }, heading: number, y: number) {
    const course: Course = courseOf(track)
    let run: Run = {
      ...startRun(course),
      kart: {
        ...INITIAL_KART,
        x: from.x,
        z: from.z,
        heading,
        y,
        vx: Math.sin(heading) * 40,
        vz: -Math.cos(heading) * 40,
        throttleHeld: true,
      },
    }
    const heights: number[] = []
    let hits = 0
    for (let step = 0; step < 150; step++) {
      run = stepRun(run, THROTTLE, course, KART_TUNING)
      heights.push(run.kart.y ?? 0)
      if (run.impact > 0) hits++
    }
    return { heights, hits, run }
  }

  it('on the viaduct it stays on the viaduct, under it in the underpass, and neither hits the other’s kerbs', () => {
    // North along the viaduct, from 60 m short of the crossing to well past it
    const over = through({ x: 0, z: -60 }, 0, groundAt(terrain, 0, -60).y)
    expect(Math.max(...over.heights)).toBeCloseTo(4.5, 1)
    expect(over.hits).toBe(0)
    // Its height never jumps from one step to the next: it is never put on the other road
    for (let k = 1; k < over.heights.length; k++) {
      expect(Math.abs(over.heights[k]! - over.heights[k - 1]!)).toBeLessThan(0.5)
    }
    // West through the underpass
    const under = through({ x: 60, z: -120 }, -Math.PI / 2, groundAt(terrain, 60, -120).y)
    expect(Math.min(...under.heights)).toBeCloseTo(-4.5, 1)
    expect(under.hits).toBe(0)
    for (let k = 1; k < under.heights.length; k++) {
      expect(Math.abs(under.heights[k]! - under.heights[k - 1]!)).toBeLessThan(0.5)
    }
  })

  it('a kerb with a foot stops a kart on its own road only', () => {
    const wall = { ax: -5, az: -10, bx: 5, bz: -10, base: 4.5 - KERB_FOOT, top: 8 }
    const before = { ...INITIAL_KART, x: 0, z: -7, vz: -30, y: 4.5 }
    const into = { ...before, z: -10.5 }
    expect(collideWalls(before, into, [wall], KART_TUNING).touching).toBe(true)
    const under = { ...before, y: -4.5 }
    expect(collideWalls(under, { ...under, z: -10.5 }, [wall], KART_TUNING).touching).toBe(false)
  })

  it('keeps each kart seen only on the plan on its own road (another racer, a ghost, a replay)', () => {
    const heightOf = createHeightKeeper(terrain)
    // Coming along the viaduct, then over the crossing
    for (let z = -60; z >= -120; z -= 5) heightOf('over', 0, z, 40, false)
    expect(heightOf('over', 0, -120, 40, false)).toBeCloseTo(4.5)
    for (let x = 60; x >= 0; x -= 5) heightOf('under', x, -120, 40, false)
    expect(heightOf('under', 0, -120, 40, false)).toBeCloseTo(-4.5)
  })
})

describe('karts over and under each other', () => {
  it('a kart more than a body’s height above or below another passes by', () => {
    const kart = { ...INITIAL_KART, x: 0, z: 0, vz: -20, y: 0 }
    const other = { x: 0, z: -0.5, vx: 0, vz: 0 }
    expect(bumpKart(kart, [other]).hit).toBeGreaterThan(0)
    expect(bumpKart(kart, [{ ...other, y: 0.5 }]).hit).toBeGreaterThan(0)
    expect(bumpKart(kart, [{ ...other, y: KART_BODY_HEIGHT + 0.1 }]).kart).toBe(kart)
    expect(bumpKart(kart, [{ ...other, y: -9 }]).kart).toBe(kart)
    // A flat track knows no heights: as it always was
    expect(bumpKart({ ...kart, y: undefined }, [{ ...other, y: 9 }]).hit).toBeGreaterThan(0)
  })
})

describe('banked bends', () => {
  /** A circle of radius 80 to the right, 30 m wide, leaning `bank` degrees into itself */
  function circle(bank: number) {
    const road: RoadPoint[] = []
    for (let k = 0; k < 84; k++) {
      const angle = (k / 84) * 2 * Math.PI
      // Clockwise seen from above (a right-hand bend all round), starting at the bottom going west
      road.push({
        x: -Math.sin(angle) * 80,
        z: Math.cos(angle) * 80,
        width: 30,
        y: 0,
        ...(bank ? { bank } : {}),
      })
    }
    return road
  }

  /** Steered right at `steer` for four seconds from the bottom of the circle at 40 m/s */
  function drive(bank: number, steer: number) {
    const road = circle(bank)
    const terrain = terrainOf({ road })!
    const course: Course = { walls: [], start: { x: 0, z: 80, heading: -Math.PI / 2 }, terrain }
    let run: Run = {
      ...startRun(course),
      kart: { ...INITIAL_KART, x: 0, z: 80, heading: -Math.PI / 2, vx: -40, vz: 0, y: 0 },
    }
    let turned = 0
    for (let step = 0; step < 240; step++) {
      const heading = run.kart.heading
      run = stepRun(run, { ...THROTTLE, steer }, course, KART_TUNING)
      turned += Math.atan2(Math.sin(run.kart.heading - heading), Math.cos(run.kart.heading - heading))
    }
    return { turned, speed: Math.hypot(run.kart.vx, run.kart.vz), run, terrain }
  }

  it('the outside of a right-hander is higher, and a kart on it leans with it', () => {
    const terrain = terrainOf({ road: circle(12) })!
    // At the bottom of the circle, going west: the inside, its right, is north
    const inside = groundAt(terrain, 0, 80 - 12).y
    const outside = groundAt(terrain, 0, 80 + 12).y
    expect(outside).toBeGreaterThan(inside)
    expect(outside - inside).toBeCloseTo(24 * Math.tan((12 * Math.PI) / 180), 1)
    // Going west there, its right side (towards the centre) is the low one
    expect(rollOf(terrain, 0, 80, -Math.PI / 2, 0)).toBeGreaterThan(0.15)
    expect(rollOf(terrainOf({ road: circle(0) })!, 0, 80, -Math.PI / 2, 0)).toBe(0)
  })

  it('steered into it, it turns a little tighter at the same speed; steered out, nothing changes', () => {
    const level = drive(0, 0.6)
    const banked = drive(12, 0.6)
    expect(banked.turned).toBeGreaterThan(level.turned * 1.03)
    // Gentle: never more than a fifth more turn
    expect(banked.turned).toBeLessThan(level.turned * 1.2)
    // No speed out of it
    expect(banked.speed).toBeLessThan(level.speed + 1)
    // Steered the other way, the bank lends nothing
    const outLevel = drive(0, -0.3)
    const outBanked = drive(12, -0.3)
    expect(outBanked.turned).toBeCloseTo(outLevel.turned, 1)
  })

  it('a track without a bank has no lean at all in its terrain', () => {
    for (const id of RACE_TRACK_IDS.filter((one) => one !== 'zhuwei')) {
      const terrain = courseOf(raceTrack(id)!).terrain
      expect(terrain?.banked, id).toBeUndefined()
    }
  })
})

describe('flights kept in replays and ghosts (#94)', () => {
  const frame = (tick: number, airborne: boolean): KartFrame => ({
    tick,
    x: tick,
    z: 0,
    heading: 0,
    vx: 30,
    vz: 0,
    reset: false,
    drifting: false,
    boosting: false,
    skidding: false,
    finished: false,
    driftDirection: 0,
    steer: 0,
    body: 0,
    crossings: 2,
    nextGate: 5,
    seq: tick,
    ...(airborne ? { airborne: true } : {}),
  })

  it('a replay keeps when each kart was in the air, and still reads one from before', () => {
    const tape = createKartTape()
    for (let tick = 0; tick <= 60; tick += 6) tape.add(frame(tick, tick >= 24 && tick <= 36))
    const samples = decodeTape(tape.bytes())
    expect(samples.filter((one) => one.airborne).map((one) => one.tick)).toEqual([24, 30, 36])
    expect(samples.every((one) => one.crossings === 2)).toBe(true)
    const replay: Replay = {
      track: 'zhuwei',
      laps: 3,
      mode: 'race',
      racers: [{ seat: 0, lapMs: [], finishMs: null, out: false }],
      karts: [{ seat: 0, bytes: tape.bytes() }],
      events: [],
      held: [],
      airborne: true,
    }
    const packed = encodeReplay(replay)
    expect(packed[1]).toBe(REPLAY_VERSION)
    expect(decodeReplay(packed)?.airborne).toBe(true)
    // One from before (version 1): read as it was, its flights to be guessed
    const { airborne: _known, ...old } = replay
    const before = encodeReplay(old)
    expect(before[1]).toBe(1)
    const read = decodeReplay(before)
    expect(read?.airborne).toBeUndefined()
    expect(read?.karts[0]!.bytes).toEqual(tape.bytes())
  })

  it('a ghost keeps its take-offs and landings; one kept before has none and is read as it was', () => {
    const recorder = startRecording('zhuwei')
    for (let step = 0; step <= 90; step += 3) {
      recordStep(recorder, step, { x: step, z: 0, heading: 0, air: step >= 30 && step < 45 ? 0.1 : 0 })
    }
    const ghost = finishRecording(recorder, 90, [90])
    expect(ghost.air).toEqual([10, 15])
    expect(ghostAt(ghost, 33)?.airborne).toBe(true)
    expect(ghostAt(ghost, 60)?.airborne).toBe(false)
    const stored = parseGhost(JSON.parse(JSON.stringify(ghost)), 'zhuwei')
    expect(stored?.air).toEqual([10, 15])
    // From before: no flights; and a hand-edited list is set aside
    const { air: _flights, ...old } = ghost
    expect(parseGhost(old, 'zhuwei')?.air).toBeUndefined()
    expect(ghostAt(parseGhost(old, 'zhuwei')!, 33)?.airborne).toBeUndefined()
    expect(parseGhost({ ...ghost, air: [15, 10] }, 'zhuwei')?.air).toBeUndefined()
    // On a flat track the recorder never hears of the air: no list at all
    const flat = startRecording('riverside')
    recordStep(flat, 0, { x: 0, z: 0, heading: 0 })
    expect(finishRecording(flat, 3, [3]).air).toBeUndefined()
  })
})

describe('the editor: viaducts, underpasses, banked bends and what stands on a bypass', () => {
  it('a figure of eight is legal, and its code comes back as it went', () => {
    const spec = eight()
    expect(buildSpec(spec).problems).toEqual([])
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec)
  })

  it('a banked bend keeps its lean in its code, and the road leans into it', () => {
    const spec: TrackSpec = {
      name: '',
      theme: 'day',
      pieces: [
        straight(120),
        turn(90, 60, 36, { bank: 10 }),
        straight(80),
        turn(90, 60),
        straight(240),
        turn(90, 60),
        straight(80),
        turn(90, 60),
        straight(120),
      ],
    }
    const built = buildSpec(spec)
    expect(built.problems).toEqual([])
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec)
    const banks = built.track.road.flatMap((point) => (point.bank ? [point.bank] : []))
    expect(Math.max(...banks)).toBeCloseTo(10)
    expect('track' in parseTrack(built.track)).toBe(true)
    // Too short a bend for its lean
    const short = { ...spec, pieces: spec.pieces.map((one, i) => (i === 1 ? turn(30, 60, 36, { bank: 15 }) : one)) }
    expect(buildSpec(short).problems.map((one) => one.code)).toContain('bank')
  })

  it.each(['jump', 'wall', 'slot'] as const)('a bypass with a %s is legal, its code read back', (feature) => {
    const spec: TrackSpec = {
      name: '',
      theme: 'day',
      pieces: [
        straight(120),
        turn(90, 60),
        straight(300),
        turn(90, 60),
        straight(240),
        turn(90, 60),
        straight(300),
        turn(90, 60),
        straight(120),
      ],
      bypasses: [{ from: 2, to: 2, side: -1, offset: 50, width: 16, feature }],
    }
    const built = buildSpec(spec)
    expect(built.problems).toEqual([])
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec)
    const made = customTrack(encodeSpec(spec))
    expect(made.ok).toBe(true)
    if (!made.ok) return
    if (feature === 'jump') expect(made.track.branches![0]!.jumps).toHaveLength(1)
    else expect(made.track.walls.length).toBeGreaterThan(0)
  })

  it('refuses a code with what it cannot be: a feature it does not know, too much lean, too low an overpass', () => {
    const toCode = (json: unknown) =>
      btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const base = { v: 1, n: 'x', t: 'day' }
    const pieces = [
      ['s', 100, 36, 0, 0],
      ['t', 90, 60, 36, 0, 0],
      ['s', 100, 36, 0, 0],
    ]
    expect(decodeSpec(toCode({ ...base, p: pieces }))).not.toBeNull()
    expect(decodeSpec(toCode({ ...base, p: [...pieces, ['b', 90, 60, 36, 0, 0, 20]] }))).toBeNull()
    expect(decodeSpec(toCode({ ...base, p: [...pieces, ['o', 220, 2, 36, 0, 0]] }))).toBeNull()
    expect(
      decodeSpec(toCode({ ...base, p: [...pieces, ['s', 100, 36, 0, 0]], b: [[0, 1, -1, 50, 16, 4]] })),
    ).toBeNull()
  })
})

describe('the Zhuwei Flyover, the technical showcase', () => {
  const track = raceTrack('zhuwei')!
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }

  it('is a figure of eight over itself, with banked bends, a jump and a real branch', () => {
    expect(track.crossings).toHaveLength(1)
    expect(track.crossings![0]!.upperY - track.crossings![0]!.lowerY).toBeGreaterThanOrEqual(9)
    expect(track.road.some((point) => (point.bank ?? 0) >= 10)).toBe(true)
    expect(track.jumps).toHaveLength(1)
    expect(track.forks).toHaveLength(1)
    expect(ZHUWEI.walls.length).toBeGreaterThan(0)
    expect(track.road[ZHUWEI_MARKS.over]!.y).toBeCloseTo(4.5)
    expect(track.road[ZHUWEI_MARKS.under]!.y).toBeCloseTo(-4.5)
  })

  it.each(DIFFICULTIES)(
    'a %s computer kart drives three laps over and under, never the wrong way, never stuck',
    (level) => {
      const skill = BOT_SKILLS[level]
      const crossing = track.crossings![0]!
      const brain = createTrackBrain(skill, track, KART_TUNING, 11)
      let trial = startTrial(course)
      let wrong = 0
      let over = 0
      let under = 0
      let side = ''
      let branch = 0
      for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
        const before = trial.wrongWay
        trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
        if (trial.wrongWay && !before) wrong++
        const { x, z, y } = trial.run.kart
        const away = Math.hypot(x - crossing.x, z - crossing.z)
        if (away < 10) {
          const now = (y ?? 0) > 0 ? 'over' : 'under'
          if (now !== side) {
            if (now === 'over') over++
            else under++
            side = now
          }
        } else if (away > 60) side = ''
        if (forkAt(track.road, [track.forks![0]!.path], x, z) >= 0) branch++
      }
      expect(trial.phase).toBe('finished')
      expect(wrong).toBe(0)
      expect(trial.run.resets).toBe(0)
      expect(over).toBe(3)
      expect(under).toBe(3)
      // Down the cut only if it knows how
      if (skill.tricks) expect(branch).toBeGreaterThan(0)
      else expect(branch).toBe(0)
    },
    120_000,
  )
})
