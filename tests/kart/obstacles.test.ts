import { describe, expect, it } from 'vitest'
import { startRun, stepRun } from '../../shared/kart/course.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  blockedAcross,
  boomState,
  obstaclesOf,
  obstacleWalls,
  parseObstacles,
  sliderCorners,
  sliderState,
  SLIDER_KERB_GAP,
  throughObstacle,
  type BoomJson,
  type Obstacle,
  type SliderJson,
} from '../../shared/kart/obstacles.ts'
import { INITIAL_KART, KART_TUNING, NO_INPUT, type KartInput } from '../../shared/kart/physics.ts'
import { judgeFrame, startTracking, type Tracked } from '../../shared/kart/race.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, type Track } from '../../shared/kart/track.ts'
import { challengeTrack } from '../../shared/kart/tracks/challenge.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'
import { armsOf } from '../../src/kart/art/obstacleArt.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES } from '../../src/kart/bots/skill.ts'
import { freeAcross, relativeTo } from '../../src/kart/bots/obstacleSense.ts'
import { createAutopilot } from '../../src/kart/race/autopilot.ts'
import { obstacleCues } from '../../src/kart/obstacleCues.ts'

// 2026-11-22 (#103, docs/ARCHITECTURE.md §4.64): moving obstacles, by the race clock

const BOOM: BoomJson = {
  kind: 'boom',
  at: 0,
  from: -10,
  to: 10,
  period: 300,
  shift: 100,
  closed: 120,
  warn: 60,
}
const SLIDER: SliderJson = {
  kind: 'slider',
  at: 0,
  length: 5.2,
  size: 10,
  a: -5,
  b: 5,
  period: 360,
  shift: 0,
  move: 72,
  warn: 48,
}

const lock = challengeTrack('ch-lock')
const harbour = raceTrack('harbour')!

const trialCourse = (track: Track): TrialCourse => {
  const plain = courseOf(track)
  return { ...plain, checkpoints: plain.checkpoints!, road: track.road }
}

describe('an obstacle is a pure function of the race clock', () => {
  it('a boom: down from its shift for its closing, warned before it, the same every period', () => {
    expect(boomState(BOOM, 100).closed).toBe(true)
    expect(boomState(BOOM, 219).closed).toBe(true)
    expect(boomState(BOOM, 220).closed).toBe(false)
    expect(boomState(BOOM, 99).closed).toBe(false)
    expect(boomState(BOOM, 99).warn).toBe(true)
    expect(boomState(BOOM, 40).warn).toBe(true)
    expect(boomState(BOOM, 39).warn).toBe(false)
    // The arm is drawn coming down at the end of the warning, up again after it opens
    expect(boomState(BOOM, 90).shut).toBeGreaterThan(0)
    expect(boomState(BOOM, 60).shut).toBe(0)
    expect(boomState(BOOM, 230).shut).toBeGreaterThan(0)
    expect(boomState(BOOM, 260).shut).toBe(0)
    for (const tick of [0, 57, 100, 219, 299, -5]) {
      expect(boomState(BOOM, tick + 300 * 7)).toEqual(boomState(BOOM, tick))
      expect(boomState(BOOM, tick)).toEqual(boomState(BOOM, tick))
    }
  })

  it('a slider: holds at one end, slides, holds at the other, slides back; warned before each slide', () => {
    expect(sliderState(SLIDER, 0).across).toBe(-5)
    expect(sliderState(SLIDER, 107).across).toBe(-5)
    expect(sliderState(SLIDER, 144).across).toBeCloseTo(0, 5)
    expect(sliderState(SLIDER, 180).across).toBe(5)
    expect(sliderState(SLIDER, 324).across).toBeCloseTo(0, 5)
    expect(sliderState(SLIDER, 60).warn).toBe(true)
    expect(sliderState(SLIDER, 59).warn).toBe(false)
    expect(sliderState(SLIDER, 240).warn).toBe(true)
    expect(sliderState(SLIDER, 144).shut).toBe(1)
    expect(sliderState(SLIDER, 360 * 3 + 144)).toEqual(sliderState(SLIDER, 144))
  })

  it('makes walls only where something is in the way at that step', () => {
    const [boom] = obstaclesOf(lock)
    expect(boom!.json.kind).toBe('boom')
    const json = boom!.json as BoomJson
    expect(obstacleWalls([boom!], json.shift)).toHaveLength(1)
    expect(obstacleWalls([boom!], json.shift + json.closed)).toHaveLength(0)
    const slider = obstaclesOf(lock).find((one) => one.json.kind === 'slider')!
    const walls = obstacleWalls([slider], 0)
    expect(walls).toHaveLength(4)
    for (const wall of walls) expect(wall.top).toBeGreaterThan(slider.y)
  })
})

describe('the track format', () => {
  it('Lock Gate Lane and the harbour have theirs; no other race track has any', () => {
    expect(lock.obstacles).toHaveLength(4)
    expect(harbour.obstacles).toHaveLength(4)
    // 14 since the wall slide and the timed landing (2026-11-22, #145)
    expect(harbour.revision).toBe(14)
    for (const id of RACE_TRACK_IDS) {
      if (id === 'harbour') continue
      expect(raceTrack(id)!.obstacles).toBeUndefined()
      expect(courseOf(raceTrack(id)!).obstacles).toBeUndefined()
    }
  })

  it('checks each one and lists every problem', () => {
    const road = harbour.road
    const problems: string[] = []
    const out = parseObstacles(
      [
        { ...BOOM, at: 44 },
        { ...BOOM, at: 44, kind: 'gate' },
        { ...BOOM, at: -1 },
        { ...BOOM, at: 44, from: 0, to: 2 },
        { ...BOOM, at: 44, from: -30 },
        { ...BOOM, at: 44, warn: 10 },
        { ...BOOM, at: 44, closed: 290 },
        { ...SLIDER, at: 44, a: -12 },
        { ...SLIDER, at: 44, period: 361 },
        { ...SLIDER, at: 44, size: 30 },
        { ...SLIDER, at: 44 },
      ],
      road,
      problems,
    )
    expect(out).toHaveLength(2)
    expect(problems).toHaveLength(9)
    expect(problems.join('\n')).toContain(`${SLIDER_KERB_GAP} m off the kerbs`)
    const bad = parseTrack({ ...harbour, allWalls: undefined, obstacles: 'no' })
    expect('problems' in bad && bad.problems).toEqual(['obstacles: not a list'])
  })

  it('keeps every box off the kerbs, every boom inside them, and none near a respawn point or the grid', () => {
    for (const track of [harbour, lock]) {
      for (const obstacle of obstaclesOf(track)) {
        if (obstacle.json.kind === 'slider') {
          const { a, b, size } = obstacle.json
          expect(Math.max(Math.abs(a), Math.abs(b)) + size / 2).toBeLessThanOrEqual(
            obstacle.half - SLIDER_KERB_GAP + 1e-9,
          )
        }
        for (const spot of [...track.respawns, ...track.grid]) {
          expect(Math.hypot(spot.x - obstacle.x, spot.z - obstacle.z)).toBeGreaterThan(8)
        }
      }
    }
  })
})

/** A kart put `back` metres before an obstacle on its line, `across` right, facing along the road */
function before(obstacle: Obstacle, back: number, across: number, speed: number) {
  const x = obstacle.x - obstacle.dx * back - obstacle.dz * across
  const z = obstacle.z - obstacle.dz * back + obstacle.dx * across
  return {
    ...INITIAL_KART,
    x,
    z,
    heading: Math.atan2(obstacle.dx, -obstacle.dz),
    vx: obstacle.dx * speed,
    vz: obstacle.dz * speed,
  }
}

const FLOOR: KartInput = { ...NO_INPUT, throttle: true }

describe('the physics', () => {
  const course = courseOf(lock)
  const boom = obstaclesOf(lock)[0]!
  const json = boom.json as BoomJson

  /** Drives straight at the lock gate from 30 m at 30 m/s for 2 s, from race step `tick` */
  const run = (tick: number | undefined) => {
    let state = { ...startRun(course), kart: before(boom, 30, 0, 30) }
    let crossed = false
    for (let step = 0; step < 120; step++) {
      state = stepRun(state, FLOOR, course, KART_TUNING, undefined, tick === undefined ? undefined : tick + step)
      if (relativeTo(boom, state.kart.x, state.kart.z).along > 0) crossed = true
    }
    return { crossed, state }
  }

  it('a boom that is down is a wall; up, or without the clock, it is nothing', () => {
    // Down for the whole two seconds: the kart stops at it
    const blocked = run(json.shift)
    expect(blocked.crossed).toBe(false)
    expect(relativeTo(boom, blocked.state.kart.x, blocked.state.kart.z).along).toBeLessThan(-KART_RADIUS + 0.01)
    // Up all the way
    expect(run(json.shift + json.closed + 1).crossed).toBe(true)
    // No clock (the editor's test drive, a run without a race): no obstacles
    expect(run(undefined).crossed).toBe(true)
  })

  it('a flat track without obstacles steps exactly as it did, clock or none', () => {
    const plain = courseOf(raceTrack('riverside')!)
    let a = startRun(plain)
    let b = startRun(plain)
    for (let step = 0; step < 600; step++) {
      a = stepRun(a, FLOOR, plain)
      b = stepRun(b, FLOOR, plain, KART_TUNING, undefined, step)
    }
    expect(b).toEqual(a)
  })

  it('a sliding box pushes a kart standing in its way, never through it', () => {
    const slider = obstaclesOf(lock).find((one) => one.json.kind === 'slider')!
    const box = slider.json as SliderJson
    // Just clear of the box as it holds at `a`, in the way of its slide to `b`
    let state = { ...startRun(course), kart: before(slider, 0, box.a + box.size / 2 + 2, 0) }
    state = { ...state, kart: { ...state.kart, vx: 0, vz: 0 } }
    for (let step = 0; step < box.period; step++) {
      state = stepRun(state, NO_INPUT, course, KART_TUNING, undefined, box.shift + step)
      const corners = sliderCorners(slider, box, sliderState(box, box.shift + step).across)
      // Never inside the box
      const { across } = sliderState(box, box.shift + step)
      const rel = relativeTo(slider, state.kart.x, state.kart.z)
      const inside = Math.abs(rel.along) < box.length / 2 - 0.3 && Math.abs(rel.right - across) < box.size / 2 - 0.3
      expect(inside, `step ${step} ${JSON.stringify(corners)}`).toBe(false)
    }
  })
})

/** Frames as a browser sends them: every third step of a trial driven by `drive` */
function framesOf(track: Track, drive: (trial: ReturnType<typeof startTrial>) => KartInput, laps = 1) {
  const course = { ...trialCourse(track), checkpoints: { ...trialCourse(track).checkpoints, laps } }
  let trial = startTrial(course)
  const frames: KartFrame[] = []
  let seq = 0
  for (let step = 0; trial.phase !== 'finished' && step < 200 * 60; step++) {
    trial = stepTrial(trial, drive(trial), course)
    if (trial.phase !== 'countdown' && trial.steps % 3 === 0) {
      const { kart } = trial.run
      frames.push({
        tick: trial.steps,
        x: kart.x,
        z: kart.z,
        heading: kart.heading,
        vx: kart.vx,
        vz: kart.vz,
        reset: false,
        drifting: kart.drifting,
        boosting: false,
        skidding: false,
        finished: trial.phase === 'finished',
        driftDirection: 0,
        steer: 0,
        body: 0,
        crossings: trial.run.crossings,
        nextGate: trial.run.nextGate,
        seq: seq++,
        ...((kart.air ?? 0) > 0 ? { airborne: true } : {}),
      })
    }
  }
  return { frames, trial }
}

describe("the Worker's judge", () => {
  const boom = obstaclesOf(lock)[0]!
  const json = boom.json as BoomJson
  const at = (back: number, tick: number): KartFrame => {
    const kart = before(boom, back, 0, 20)
    return {
      tick,
      x: kart.x,
      z: kart.z,
      heading: kart.heading,
      vx: kart.vx,
      vz: kart.vz,
      reset: false,
      drifting: false,
      boosting: false,
      skidding: false,
      finished: false,
      driftDirection: 0,
      steer: 0,
      body: 0,
      crossings: 1,
      nextGate: 3,
      seq: 0,
    }
  }
  const judge = (from: KartFrame, to: KartFrame) => {
    const tracked: Tracked = {
      ...startTracking(lock, 0),
      last: from,
      lastAt: 100_000 + (from.tick / 60) * 1000,
      crossings: 1,
      nextGate: 3,
    }
    return judgeFrame(tracked, to, {
      track: lock,
      slot: 0,
      now: 100_000 + (to.tick / 60) * 1000,
      goAt: 100_000,
      laps: 0,
    })
  }

  it('refuses a move through a boom that was down the whole time', () => {
    const tick = json.shift + json.period * 2 + 10
    const verdict = judge(at(1, tick), at(-1, tick + 3))
    expect(verdict.kind).toBe('refused')
    expect(verdict.kind === 'refused' && verdict.why).toBe('obstacle')
  })

  it('takes it while the boom is up, or just went up or down during the move', () => {
    const open = json.shift + json.closed + 40
    expect(judge(at(1, open), at(-1, open + 3)).kind).toBe('taken')
    const opening = json.shift + json.closed - 1
    expect(judge(at(1, opening), at(-1, opening + 3)).kind).toBe('taken')
    const closing = json.shift - 2
    expect(judge(at(1, closing), at(-1, closing + 3)).kind).toBe('taken')
  })

  it('refuses a kart inside a sliding box, but not one in the air over it', () => {
    const slider = obstaclesOf(lock).find((one) => one.json.kind === 'slider')!
    const box = slider.json as SliderJson
    const tick = box.shift + 10
    const { across } = sliderState(box, tick)
    const inside = { x: slider.x - slider.dz * across, z: slider.z + slider.dx * across }
    const outside = { x: inside.x - slider.dx * 6, z: inside.z - slider.dz * 6 }
    expect(throughObstacle([slider], outside, tick - 3, inside, tick)).toBe(true)
    expect(throughObstacle([slider], outside, tick - 3, inside, tick, true)).toBe(false)
    expect(throughObstacle([slider], outside, tick - 3, outside, tick)).toBe(false)
  })

  it('takes every frame of computer karts racing the obstacles: the browsers and the Worker agree', () => {
    for (const track of [lock, harbour]) {
      for (const difficulty of ['normal', 'expert'] as const) {
        const brain = createTrackBrain(BOT_SKILLS[difficulty], track, KART_TUNING, 3)
        const { frames, trial } = framesOf(
          track,
          (one) => brain(one, { speedShare: BOT_SKILLS[difficulty].topSpeedShare }),
          track === lock ? 2 : 1,
        )
        expect(trial.phase).toBe('finished')
        let tracked = startTracking(track, 0)
        tracked = { ...tracked, safe: courseOf(track).start }
        let refused = 0
        for (const frame of frames) {
          const verdict = judgeFrame(tracked, frame, {
            track,
            slot: 0,
            now: 100_000 + (frame.tick / 60) * 1000,
            goAt: 100_000,
            laps: 0,
          })
          if (verdict.kind === 'refused' && verdict.why === 'obstacle') refused++
          tracked = verdict.tracked
        }
        expect(refused, `${track.id} ${difficulty}`).toBe(0)
      }
    }
  }, 60_000)
})

describe('the computer karts', () => {
  it.each(DIFFICULTIES)('%s: three laps of Lock Gate Lane, never the wrong way, never through anything', (difficulty) => {
    const course = trialCourse(lock)
    const obstacles = obstaclesOf(lock)
    for (const seed of [1, 2, 3]) {
      const brain = createTrackBrain(BOT_SKILLS[difficulty], lock, KART_TUNING, seed)
      let trial = startTrial(course)
      let wrongWays = 0
      let through = 0
      for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
        const was = trial
        trial = stepTrial(trial, brain(trial, { speedShare: BOT_SKILLS[difficulty].topSpeedShare }), course)
        if (trial.wrongWay && !was.wrongWay) wrongWays++
        if (
          was.phase === 'racing' &&
          throughObstacle(obstacles, was.run.kart, was.steps, trial.run.kart, trial.steps)
        ) {
          through++
        }
      }
      expect(trial.phase).toBe('finished')
      expect(trial.laps).toHaveLength(3)
      expect(wrongWays).toBe(0)
      expect(through).toBe(0)
      expect(trial.run.resets).toBeLessThanOrEqual(1)
    }
  }, 60_000)

  it('wait in front of the lock gate when it is down as they come, and go once it is up', () => {
    const course = trialCourse(lock)
    const boom = obstaclesOf(lock)[0]!
    const json = boom.json as BoomJson
    const brain = createTrackBrain(BOT_SKILLS.expert, lock, KART_TUNING, 1)
    let trial = startTrial(course)
    let slowest = Infinity
    let crossedAt: number | null = null
    for (let step = 0; crossedAt === null && step < 60 * 60; step++) {
      trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course)
      const { along } = relativeTo(boom, trial.run.kart.x, trial.run.kart.z)
      if (trial.phase === 'racing' && along > -40 && along < 0) {
        slowest = Math.min(slowest, Math.hypot(trial.run.kart.vx, trial.run.kart.vz))
      }
      if (trial.phase === 'racing' && along > 0) crossedAt = trial.steps
    }
    // On lap 1 everyone reaches it while it is down (2.5 s to 4.5 s after GO)
    expect(slowest).toBeLessThan(5)
    expect(crossedAt).not.toBeNull()
    expect(boomState(json, crossedAt!).closed).toBe(false)
  })

  it('take the free lane at the level crossing and round the containers on the harbour', () => {
    const course = trialCourse(harbour)
    const obstacles = obstaclesOf(harbour)
    const brain = createTrackBrain(BOT_SKILLS.hard, harbour, KART_TUNING, 2)
    let trial = startTrial(course)
    let touches = 0
    for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
      const tick = trial.steps
      trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course)
      if (trial.phase !== 'racing') continue
      for (const obstacle of obstacles) {
        const span = blockedAcross(obstacle, tick)
        const rel = relativeTo(obstacle, trial.run.kart.x, trial.run.kart.z)
        const reach = obstacle.json.kind === 'slider' ? obstacle.json.length / 2 + KART_RADIUS : KART_RADIUS
        if (span && Math.abs(rel.along) < reach && rel.right > span[0] - KART_RADIUS + 0.05 && rel.right < span[1] + KART_RADIUS - 0.05) {
          touches++
        }
      }
    }
    expect(trial.phase).toBe('finished')
    expect(touches).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(140)
  }, 60_000)

  it('see a free stretch only where nothing will be in the way while they pass', () => {
    const crossing = obstaclesOf(lock).filter((one) => one.json.kind === 'boom').slice(1)
    const left = crossing[0]!.json as BoomJson
    // The left half down: only the right half is free
    const free = freeAcross(crossing, left.shift + 10, left.shift + 40)
    expect(free).toHaveLength(1)
    expect(free[0]![0]).toBeGreaterThan(0)
    // The lock gate down over the whole road: nothing is
    const gate = obstaclesOf(lock)[0]!
    expect(freeAcross([gate], (gate.json as BoomJson).shift, (gate.json as BoomJson).shift + 30)).toEqual([])
  })

  it('the autopilot of the browser tests and the load test minds them too', () => {
    const course = trialCourse(lock)
    const pilot = createAutopilot(lock, KART_TUNING)
    let trial = startTrial(course)
    for (let step = 0; trial.phase !== 'finished' && step < 200 * 60; step++) {
      trial = stepTrial(trial, pilot(trial), course)
    }
    expect(trial.phase).toBe('finished')
    expect(trial.run.resets).toBe(0)
  }, 30_000)
})

describe('what is drawn and heard', () => {
  it('a boom over the whole road has an arm from each side; over a half, one from its kerb', () => {
    const [gate, , left, right] = obstaclesOf(lock)
    expect(armsOf(gate!, gate!.json as BoomJson)).toHaveLength(2)
    const one = armsOf(left!, left!.json as BoomJson)
    expect(one).toHaveLength(1)
    expect(one[0]!.at).toBeLessThan(0)
    expect(one[0]!.way).toBe(1)
    expect(armsOf(right!, right!.json as BoomJson)[0]!.way).toBe(-1)
  })

  it('rings the bell as a boom ahead is warned of, and on the beat while it is down; not for one behind', () => {
    const gate = obstaclesOf(lock)[0]!
    const json = gate.json as BoomJson
    const start = json.shift - json.warn
    const ahead = before(gate, 40, 0, 0)
    expect(obstacleCues([gate], start - 1, start, ahead.x, ahead.z)).toEqual(['bell'])
    expect(obstacleCues([gate], start + 1, start + 2, ahead.x, ahead.z)).toEqual([])
    const behind = before(gate, -20, 0, 0)
    expect(obstacleCues([gate], start - 1, start, behind.x, behind.z)).toEqual([])
    const far = before(gate, 300, 0, 0)
    expect(obstacleCues([gate], start - 1, start, far.x, far.z)).toEqual([])
    const slider = obstaclesOf(lock).find((one) => one.json.kind === 'slider')!
    const box = slider.json as SliderJson
    const warned = box.shift + box.period / 2 - box.move - box.warn
    const near = before(slider, 30, 0, 0)
    expect(obstacleCues([slider], warned - 1, warned, near.x, near.z)).toEqual(['horn'])
  })
})
