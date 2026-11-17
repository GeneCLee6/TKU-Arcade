import { describe, expect, it } from 'vitest'
import { startRun, stepRun, type Course, type Run } from '../../shared/kart/course.ts'
import { buildSpec } from '../../shared/kart/editor/build.ts'
import { closeLoop } from '../../shared/kart/editor/close.ts'
import { decodeSpec, encodeSpec, piecesKey, specHash } from '../../shared/kart/editor/codec.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import { layout } from '../../shared/kart/editor/layout.ts'
import {
  jump,
  LIMITS,
  slope,
  starterSpec,
  straight,
  turn,
  type TrackSpec,
} from '../../shared/kart/editor/spec.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import {
  groundAt,
  heightGuess,
  TERRAIN_TUNING,
  terrainOf,
  type Terrain,
} from '../../shared/kart/terrain.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type RoadPoint } from '../../shared/kart/track.ts'
import { GUANYIN, GUANYIN_PIECES } from '../../shared/kart/tracks/guanyin.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'

// Slopes and jumps (2026-11-17, shared/kart/terrain.ts, docs/ARCHITECTURE.md §4.26). The flat tracks
// staying bit for bit what they were is tests/kart/flatGolden.test.ts.

/** A long straight road towards -z, its height from `height(z)`, with jump lips at `lips` */
function testTerrain(height: (z: number) => number, lips: number[] = []): Terrain {
  const road: RoadPoint[] = []
  for (let i = 0; i <= 120; i++) road.push({ x: 0, z: -i * 5, width: 30, y: height(-i * 5) })
  return terrainOf({ road, jumps: lips })!
}

const course = (terrain: Terrain): Course => ({
  walls: [],
  start: { x: 0, z: 0, heading: 0 },
  terrain,
})

/** A run already going at `speed` straight along -z, from z = `z` */
function going(c: Course, speed: number, z = 0): Run {
  const run = startRun(c)
  return { ...run, kart: { ...INITIAL_KART, z, vz: -speed } }
}

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }

function drive(c: Course, run: Run, steps: number, input: KartInput = THROTTLE) {
  const runs: Run[] = []
  for (let i = 0; i < steps; i++) {
    run = stepRun(run, input, c)
    runs.push(run)
  }
  return runs
}

const speedOf = (kart: KartState) => Math.hypot(kart.vx, kart.vz)

describe('the ground', () => {
  it('is the centre line height, interpolated, with its slope along the road', () => {
    const terrain = testTerrain((z) => -z * 0.1)
    const ground = groundAt(terrain, 3, -52.5)
    expect(ground.y).toBeCloseTo(5.25, 6)
    // Rising towards -z
    expect(ground.gz).toBeCloseTo(-0.1, 6)
    expect(ground.gx).toBeCloseTo(0, 6)
    expect(ground.distance).toBeCloseTo(3, 6)
  })

  it('a flat track has no terrain, and its course and road are as they were', () => {
    for (const id of RACE_TRACK_IDS.filter((one) => one !== 'guanyin')) {
      const track = raceTrack(id)!
      expect(terrainOf(track)).toBeNull()
      expect('terrain' in courseOf(track)).toBe(false)
      expect('jumps' in track).toBe(false)
      expect(track.road.some((point) => 'y' in point)).toBe(false)
    }
  })
})

describe('slopes', () => {
  const flat = course(testTerrain(() => 0))
  const up = course(testTerrain((z) => -z * 0.1))
  const down = course(testTerrain((z) => z * 0.1))

  it('cars sit on the road and climb with it', () => {
    const runs = drive(up, going(up, 30), 60)
    const last = runs.at(-1)!.kart
    expect(last.y).toBeCloseTo(-last.z * 0.1, 5)
    expect(last.air).toBe(0)
  })

  it('uphill is a little slower, downhill a little faster, both gentle', () => {
    const end = (c: Course) => speedOf(drive(c, going(c, 30), 4 * 60).at(-1)!.kart)
    const level = end(flat)
    const climbing = end(up)
    const falling = end(down)
    expect(climbing).toBeLessThan(level)
    expect(falling).toBeGreaterThan(level)
    // Gentle: a 10% grade changes the speed after 4 s by under a tenth
    expect(climbing / level).toBeGreaterThan(0.9)
    expect(falling / level).toBeLessThan(1.1)
  })

  it('the top speed is a little lower uphill, a little higher downhill', () => {
    const top = (c: Course) => speedOf(drive(c, going(c, 55), 8 * 60).at(-1)!.kart)
    expect(top(up)).toBeLessThan(top(flat) - 1)
    expect(top(down)).toBeGreaterThan(top(flat) + 1)
    // The classic feel eases into its top speed (2026-11-17)
    expect(top(flat)).toBeCloseTo(KART_TUNING.topSpeed, 0)
  })
})

describe('jumps', () => {
  // Flat, but for a ramp up to a 2.5 m lip at z = -150 (road point 30), the road dropping behind it
  const ramp = (z: number) => (z <= -136 && z >= -150 ? (2.5 * (-z - 136)) / 14 : 0)
  const terrain = testTerrain((z) => (z === -150 ? 2.5 : ramp(z)), [30])
  const c = course(terrain)

  /** Drives at `speed` over the jump: when it took off and landed, and the highest it went */
  function flight(speed: number, input: KartInput = THROTTLE) {
    const runs = drive(c, going(c, speed, -140), 4 * 60, input)
    const off = runs.findIndex((run) => run.terrainEvent === 'takeoff')
    const down = runs.findIndex((run) => run.terrainEvent === 'landing')
    const peak = Math.max(...runs.map((run) => run.kart.y ?? 0))
    return { runs, off, down, steps: down - off, peak }
  }

  it('a car crossing the lip takes off, flies a parabola and lands', () => {
    const { runs, off, down, peak } = flight(40)
    expect(off).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(off)
    expect(runs[off]!.kart.y).toBeCloseTo(2.5, 5)
    expect(peak).toBeGreaterThan(2.5)
    // In the air all the way between
    for (const run of runs.slice(off, down)) expect(run.kart.air).toBeGreaterThan(0)
    // On the ground again, on the road
    expect(runs[down]!.kart.y).toBeCloseTo(0, 5)
    expect(runs[down]!.kart.air).toBe(0)
  })

  it('the faster the car, the longer and higher it flies', () => {
    const slow = flight(25)
    const fast = flight(55)
    expect(fast.steps).toBeGreaterThan(slow.steps + 10)
    expect(fast.peak).toBeGreaterThan(slow.peak + 0.5)
    // About as far as the numbers say: 55 m/s for 0.8 s or so
    expect(fast.steps / 60).toBeGreaterThan(0.6)
    expect(fast.steps / 60).toBeLessThan(1.1)
  })

  it('the ground speed holds in the air: no throttle, no drag', () => {
    const { runs, off, down } = flight(45)
    const at = speedOf(runs[off + 1]!.kart)
    expect(speedOf(runs[down - 1]!.kart)).toBeCloseTo(at, 6)
  })

  it('in the air the nose only turns a little, and nothing drifts or fills the gauge', () => {
    const input = { ...THROTTLE, steer: 1, drift: true }
    const runs = drive(c, going(c, 45, -100), 4 * 60, THROTTLE)
    const off = runs.findIndex((run) => run.terrainEvent === 'takeoff')
    let run = runs[off]!
    const heading = run.kart.heading
    const gauge = run.kart.gauge
    let steps = 0
    while ((run.kart.air ?? 0) > 0 && steps < 120) {
      const before = run
      run = stepRun(run, input, c)
      steps++
      if ((run.kart.air ?? 0) > 0) {
        expect(run.kart.drifting).toBe(false)
        expect(run.kart.gauge).toBe(gauge)
        expect(Math.abs(run.kart.heading - before.kart.heading)).toBeLessThan(
          TERRAIN_TUNING.airTurnRate / 60 + 1e-9,
        )
      }
    }
    expect(Math.abs(run.kart.heading - heading)).toBeLessThan(TERRAIN_TUNING.airTurnRate * 1.2)
  })

  it('a drift begun before the lip ends at take-off', () => {
    let run = going(c, 45, -138)
    const drifting = { ...THROTTLE, drift: true, steer: 0.1 }
    for (let i = 0; i < 120 && run.terrainEvent !== 'takeoff'; i++) run = stepRun(run, drifting, c)
    expect(run.terrainEvent).toBe('takeoff')
    expect(stepRun(run, drifting, c).kart.drifting).toBe(false)
    expect(run.kart.drifting).toBe(false)
    expect(run.kart.driftDirection).toBe(0)
  })

  it('a drift held through the landing starts again at once', () => {
    const { runs, down } = flight(45)
    // From the step before landing, hold the drift and steer
    let run = runs[down - 2]!
    const held = { ...THROTTLE, drift: true, steer: 1 }
    for (let i = 0; i < 4; i++) run = stepRun(run, held, c)
    expect(run.kart.air).toBe(0)
    expect(run.kart.drifting).toBe(true)
  })

  it('a clean landing on the throttle earns a small boost; without the throttle, none', () => {
    const on = flight(50)
    expect(on.runs[on.down]!.kart.miniSeconds).toBeCloseTo(TERRAIN_TUNING.landingBoost, 6)
    const off = flight(50, NO_INPUT)
    expect(off.runs[off.down]!.kart.miniSeconds).toBe(0)
    // A hop too short for it earns nothing either
    const hop = flight(12)
    if (hop.down > hop.off && hop.off >= 0 && hop.steps / 60 < TERRAIN_TUNING.landingMinAir) {
      expect(hop.runs[hop.down]!.kart.miniSeconds).toBe(0)
    }
  })

  it('a reset in the air puts the car back on the ground', () => {
    const { runs, off } = flight(45)
    const reset = stepRun(runs[off + 5]!, { ...NO_INPUT, reset: true }, c)
    expect(reset.kart.air ?? 0).toBe(0)
    const next = stepRun(reset, NO_INPUT, c)
    expect(next.kart.air).toBe(0)
    expect(next.kart.y).toBeCloseTo(0, 5)
  })

  it('the height drawn for a car seen only on the ground plane follows its flight', () => {
    const { runs, off, down } = flight(50)
    for (const run of runs.slice(off, down)) {
      const { kart } = run
      expect(heightGuess(terrain, kart.x, kart.z, speedOf(kart))).toBeCloseTo(kart.y!, 0)
    }
  })
})

describe('the track format', () => {
  const base = {
    format: 1,
    id: 'hill-test',
    name: { en: 'Hill', 'zh-TW': '山' },
    laps: 1,
    gates: [
      { ax: -15, az: 0, bx: 15, bz: 0 },
      { ax: -15, az: -100, bx: 15, bz: -100 },
    ],
    respawns: [
      { x: 0, z: 0, heading: 0 },
      { x: 0, z: -100, heading: 0 },
    ],
    grid: [{ x: 0, z: 10, heading: 0 }],
    walls: [],
    boostPads: [],
    itemBoxes: [],
    decor: [],
  }
  const square = (y: (i: number) => number) =>
    [
      [0, 0],
      [0, -100],
      [100, -100],
      [100, 0],
    ].map(([x, z], i) => ({ x, z, width: 20, y: y(i) }))

  it('takes heights and jump lips, and keeps them', () => {
    const parsed = parseTrack({ ...base, road: square((i) => i * 10), jumps: [1] })
    expect('track' in parsed).toBe(true)
    if (!('track' in parsed)) return
    expect(parsed.track.road[2]!.y).toBe(20)
    expect(parsed.track.jumps).toEqual([1])
  })

  it('refuses a road too high, too steep, or jumps that are not road points', () => {
    const problems = (json: unknown) => ('problems' in parseTrack(json) ? 1 : 0)
    expect(problems({ ...base, road: square(() => 81) })).toBe(1)
    expect(problems({ ...base, road: square((i) => (i === 1 ? 45 : 0)) })).toBe(1)
    expect(problems({ ...base, road: square(() => 0), jumps: [4] })).toBe(1)
    expect(problems({ ...base, road: square(() => 0), jumps: [1, 1] })).toBe(1)
    expect(problems({ ...base, road: square(() => 0), jumps: [0.5] })).toBe(1)
  })
})

describe('the editor: slopes and jumps', () => {
  it('an old code reads exactly as before: same pieces, same key, same hash', () => {
    const starter = starterSpec()
    expect(piecesKey(starter.pieces)).toBe(
      '[["s",120,36,0,1],["t",90,60,36,0,0],["s",80,36,0,0],["t",90,60,36,0,0],' +
        '["s",240,36,1,0],["t",90,60,36,0,0],["s",80,36,0,0],["t",90,60,36,0,0],["s",120,36,0,0]]',
    )
    expect(decodeSpec(encodeSpec(starter))).toEqual({ ...starter, name: '' })
    // A flat layout has no heights at all, so its track and its records are what they were
    const laid = layout(starter.pieces)
    expect(laid.road.some((point) => 'y' in point)).toBe(false)
    expect(laid.jumps).toEqual([])
    expect('jumps' in buildSpec(starter).track).toBe(false)
  })

  it('slopes and jumps go through a code and back', () => {
    const spec: TrackSpec = {
      name: 'Hill',
      theme: 'sunset',
      pieces: [slope(100, 8, 30, { pad: 'right' }), jump(80, 3.5, 32), straight(60), turn(-90, 60)],
    }
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec)
    expect(specHash(spec.pieces)).not.toBe(specHash(starterSpec().pieces))
  })

  it('a code with a slope or jump out of range is refused', () => {
    const code = (pieces: unknown[]) =>
      btoa(
        JSON.stringify({
          v: 1,
          n: '',
          t: 'day',
          p: [...pieces, ['s', 100, 36, 0, 0], ['s', 100, 36, 0, 0]],
        }),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    expect(decodeSpec(code([['u', 100, 8, 36, 0, 0]]))).not.toBeNull()
    expect(decodeSpec(code([['u', 100, 0, 36, 0, 0]]))).toBeNull()
    expect(decodeSpec(code([['u', 100, LIMITS.maxRise + 1, 36, 0, 0]]))).toBeNull()
    expect(decodeSpec(code([['u', 10, 1, 36, 0, 0]]))).toBeNull()
    expect(decodeSpec(code([['j', 80, 2.5, 36]]))).not.toBeNull()
    expect(decodeSpec(code([['j', 80, 5, 36]]))).toBeNull()
    expect(decodeSpec(code([['j', 40, 2, 36]]))).toBeNull()
    expect(decodeSpec(code([['j', 80, 2, 36, 0, 0]]))).toBeNull()
  })

  it('the build checks the loop comes back level, never too high, never too steep', () => {
    const codes = (pieces: TrackSpec['pieces']) =>
      buildSpec({ name: '', theme: 'day', pieces }).problems.map((problem) => problem.code)
    const loop = starterSpec().pieces
    expect(codes(loop)).toEqual([])
    // A climb with no fall: not level
    expect(codes([...loop.slice(0, 2), slope(80, 8), ...loop.slice(3)])).toContain('level')
    // Too steep for its length
    expect(
      codes([slope(80, 12), ...loop.slice(1, 4), slope(240, -12), ...loop.slice(5)]),
    ).toContain('steep')
    // Too high: four climbs of 24 m, then back down
    const high = [
      slope(240, 24),
      slope(240, 24),
      turn(180, 60),
      slope(240, -24),
      slope(240, -24),
      turn(180, 60),
    ]
    expect(codes(high)).toContain('high')
  })

  it('close the loop also brings it back level', () => {
    const spec: TrackSpec = {
      name: '',
      theme: 'day',
      pieces: [straight(200), turn(90, 60), slope(160, 10), turn(90, 60), straight(120)],
    }
    const closing = closeLoop(spec)
    expect(closing).not.toBeNull()
    expect(buildSpec({ ...spec, pieces: [...spec.pieces, ...closing!] }).problems).toEqual([])
  })

  it('a jump piece makes a lip at its ramp top, and a track from a code has it', () => {
    const spec: TrackSpec = {
      name: '',
      theme: 'day',
      pieces: [jump(120, 3), ...starterSpec().pieces.slice(1)],
    }
    const built = buildSpec(spec)
    expect(built.problems).toEqual([])
    expect(built.track.jumps).toHaveLength(1)
    const lip = built.track.road[built.track.jumps![0]!]!
    expect(lip.y).toBe(3)
    const custom = customTrack(encodeSpec(spec))
    expect(custom.ok).toBe(true)
    if (custom.ok) expect(custom.track.jumps).toEqual(built.track.jumps)
  })
})

describe('Guanyin Hill Road', () => {
  it('is a legal track, built as a shared track is, with slopes and two jumps', () => {
    const built = buildSpec({ name: '', theme: 'day', pieces: GUANYIN_PIECES })
    expect(built.problems).toEqual([])
    expect(GUANYIN.jumps).toHaveLength(2)
    const heights = GUANYIN.road.map((point) => point.y ?? 0)
    expect(Math.max(...heights)).toBeGreaterThan(15)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0)
    expect(GUANYIN.grid).toHaveLength(8)
    expect(raceTrack('guanyin')!.jumps).toEqual(GUANYIN.jumps)
  })

  it('every bot finishes three laps, flying both jumps every lap, never reset', () => {
    const track = raceTrack('guanyin')!
    const plain = courseOf(track)
    const c: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const brain = createBotBrain(BOT_SKILLS[level], track.road, KART_TUNING, 5, track.jumps)
      let trial = startTrial(c)
      let takeoffs = 0
      for (let step = 0; trial.phase !== 'finished' && step < 200 * 60; step++) {
        trial = stepTrial(trial, brain(trial, { speedShare: BOT_SKILLS[level].topSpeedShare }), c)
        if (trial.run.terrainEvent === 'takeoff') takeoffs++
      }
      expect(trial.phase).toBe('finished')
      expect(trial.laps).toHaveLength(3)
      expect(takeoffs).toBe(6)
      expect(trial.run.resets).toBe(0)
    }
  }, 60_000)
})
