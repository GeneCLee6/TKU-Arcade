import { beforeEach, describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { INITIAL_KART, KART_TUNING, type KartInput, type KartState } from '../../shared/kart/physics.ts'
import { CHALLENGE_TRACK_IDS, challengeTrack } from '../../shared/kart/tracks/challenge.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { missionContext, missionTrack, retimed } from '../../src/kart/challenge/headless.ts'
import {
  eliminations,
  judgeRace,
  judgeStep,
  startJudge,
  type Judge,
  type JudgeContext,
  type RaceSeat,
  type Sample,
} from '../../src/kart/challenge/judge.ts'
import {
  calibrate,
  medalFor,
  medalTimes,
  missionLimit,
  missionStars,
  nextMedal,
  starsFor,
} from '../../src/kart/challenge/medals.ts'
import { MEDAL_TABLE } from '../../src/kart/challenge/medalTable.ts'
import {
  CHAPTER_IDS,
  isRaceMission,
  MISSIONS,
  missionOf,
  missionsOf,
  type Mission,
} from '../../src/kart/challenge/missions.ts'
import {
  CHALLENGE_KEY,
  chapterOpen,
  EMPTY_PROGRESS,
  loadProgress,
  parseProgress,
  saveRun,
  saveStars,
  withRun,
  withStars,
} from '../../src/kart/challenge/store.ts'

// 2026-11-21 (docs/ARCHITECTURE.md §4.59): the challenge mode's pure parts. The missions and their
// chapters, the judge of a mission driven alone (step by step, from made-up steps) and of one
// against the computer (from made-up rooms), the medals, and what is kept in this browser.

const NO_INPUT: KartInput = { throttle: true, brake: false, steer: 0, drift: false, boost: false }
const kart = (over: Partial<KartState> = {}): KartState => ({ ...INITIAL_KART, ...over })

let steps = 0
type Over = Partial<Omit<Sample, 'before' | 'after'>> & { before?: Partial<KartState>; after?: Partial<KartState> }
const step = (over: Over = {}): Sample => {
  steps += 1
  const { before, after, ...rest } = over
  return {
    before: kart(before),
    after: kart(after),
    input: NO_INPUT,
    phase: 'racing',
    start: 'none',
    steps,
    laps: 0,
    hit: 0,
    hitBefore: 0,
    resets: 0,
    fork: -1,
    ...rest,
  }
}

const context: JudgeContext = { tuning: KART_TUNING }
const run = (mission: Mission, samples: readonly Sample[], with_: JudgeContext = context): Judge =>
  samples.reduce((judge, sample) => judgeStep(mission, judge, sample, with_), startJudge())

const mission = (over: Partial<Mission>): Mission => ({
  id: 'test',
  chapter: 'basics',
  track: 'riverside',
  laps: 1,
  kind: 'finish',
  ...over,
})

beforeEach(() => {
  steps = 0
  localStorage.clear()
})

describe('the missions', () => {
  it('are 24, six to a chapter, each with a name, on a track that exists', () => {
    expect(MISSIONS).toHaveLength(24)
    expect(new Set(MISSIONS.map((one) => one.id)).size).toBe(MISSIONS.length)
    for (const chapter of CHAPTER_IDS) expect(missionsOf(chapter)).toHaveLength(6)
    for (const one of MISSIONS) {
      expect(missionTrack(one.track).id).toBe(one.track)
      const key = `kart.challenge.mission.${one.id}` as keyof (typeof KART_MESSAGES)['en']
      expect(KART_MESSAGES.en[key]).toBeTruthy()
      expect(KART_MESSAGES['zh-TW'][key]).toBeTruthy()
      // A race against the computer only on a race track (the room judges it); laps within a room's
      if (isRaceMission(one)) {
        expect(RACE_TRACK_IDS as readonly string[]).toContain(one.track)
        expect(one.bots?.count).toBeGreaterThan(0)
      }
    }
  })

  it('use both challenge tracks, which no room can be set to', () => {
    for (const id of CHALLENGE_TRACK_IDS) {
      expect(RACE_TRACK_IDS as readonly string[]).not.toContain(id)
      expect(MISSIONS.some((one) => one.track === id)).toBe(true)
      const track = challengeTrack(id)
      expect(track.road.length).toBeGreaterThan(100)
      expect(track.gates.length).toBeGreaterThan(5)
    }
    // Hop Yard has its three drops; Needle Lane its two walls with a slot each
    expect(challengeTrack('ch-hop').jumps).toHaveLength(3)
    expect(challengeTrack('ch-needle').walls.length).toBeGreaterThanOrEqual(4)
  })

  it('a slots mission knows its slots; a branches mission its branches', () => {
    const slots = missionOf('slots')
    expect(missionContext(slots, missionTrack(slots.track), KART_TUNING).gates).toHaveLength(3)
    const branches = missionOf('branches')
    expect(missionContext(branches, missionTrack(branches.track), KART_TUNING).forkCount).toBe(3)
  })
})

describe('the judge of a mission driven alone', () => {
  it('a finish: passed at the last lap, with the time', () => {
    const judge = run(mission({ laps: 2 }), [step(), step({ laps: 1 }), step({ laps: 2, phase: 'finished' })])
    expect(judge.done).toBe(true)
    expect(judge.doneAt).toBe(3)
    expect(judge.count).toBe(2)
  })

  it('no crash: the first hard hit fails it; a soft one does not', () => {
    const rule = mission({ rules: { noCrash: true } })
    const soft = run(rule, [step({ hit: KART_TUNING.wallBreakSpeed - 1 })])
    expect(soft.failed).toBe(false)
    const hard = run(rule, [step(), step({ hit: KART_TUNING.wallBreakSpeed + 1 })])
    expect(hard).toMatchObject({ failed: true, why: 'crash' })
    // Without the rule a crash is only counted
    expect(run(mission({}), [step({ hit: 99 })]).crashes).toBe(1)
  })

  it('no N2O: firing a charge fails it', () => {
    const judge = run(mission({ rules: { noN2O: true } }), [
      step({ before: { storedBoosts: 1 }, after: { storedBoosts: 0, boostSeconds: 1 } }),
    ])
    expect(judge).toMatchObject({ failed: true, why: 'n2o' })
  })

  it('no reset: a reset fails it', () => {
    const judge = run(mission({ rules: { noReset: true } }), [step(), step({ resets: 1 })])
    expect(judge).toMatchObject({ failed: true, why: 'reset' })
  })

  it('a start boost: none by the time the start is settled fails it', () => {
    const rule = mission({ rules: { boostStart: true } })
    const samples = Array.from({ length: 120 }, () => step())
    expect(run(rule, samples)).toMatchObject({ failed: true, why: 'noBoostStart' })
    steps = 0
    expect(run(rule, Array.from({ length: 120 }, () => step({ start: 'boost' }))).failed).toBe(false)
  })

  it('the combo: passed the moment it reaches the target', () => {
    const judge = run(mission({ kind: 'combo', target: 3, laps: 3 }), [
      step({ after: { chain: 1 } }),
      step({ after: { chain: 2 } }),
      step({ after: { chain: 0 } }),
      step({ after: { chain: 3 } }),
    ])
    expect(judge).toMatchObject({ done: true, count: 3, doneAt: 4 })
  })

  it('perfect boosts and drift jumps are counted; the race over first fails it', () => {
    const perfect = (grade: number) =>
      step({ before: { dashCount: 0 }, after: { dashCount: 1, dashGrade: grade } })
    const judge = run(mission({ kind: 'perfects', target: 2 }), [perfect(3), perfect(2), perfect(3)])
    expect(judge.done).toBe(true)
    const short = run(mission({ kind: 'driftJumps', target: 2 }), [
      step({ before: { driftJumps: 0 }, after: { driftJumps: 1 } }),
      step({ laps: 1, phase: 'finished' }),
    ])
    expect(short).toMatchObject({ failed: true, why: 'short', count: 1 })
  })

  it('the time limit', () => {
    const judge = run(mission({ laps: 1 }), [step({ steps: 61 })], { ...context, limit: 1 })
    expect(judge).toMatchObject({ failed: true, why: 'timeUp' })
  })

  it('branches: every one on every lap', () => {
    const all = mission({ kind: 'branches', laps: 2 })
    const withForks = { ...context, forkCount: 2 }
    const good = run(
      all,
      [step({ fork: 0 }), step({ fork: 1 }), step({ laps: 1 }), step({ fork: 1 }), step({ fork: 0 }), step({ laps: 2 })],
      withForks,
    )
    expect(good.done).toBe(true)
    const missed = run(all, [step({ fork: 0 }), step({ laps: 1 })], withForks)
    expect(missed).toMatchObject({ failed: true, why: 'branchMissed' })
  })

  it('the boost cover, judged at the finish', () => {
    const cover = mission({ kind: 'cover', target: 50 })
    const boosting = (on: boolean) => step({ after: { boostSeconds: on ? 1 : 0 } })
    const enough = run(cover, [boosting(true), boosting(true), boosting(false), step({ laps: 1, phase: 'finished' })])
    expect(enough.done).toBe(true)
    steps = 0
    const little = run(cover, [boosting(false), boosting(false), boosting(true), step({ laps: 1, phase: 'finished' })])
    expect(little).toMatchObject({ failed: true, why: 'lowCover' })
  })

  it('a slot: through it counts, round its wall fails', () => {
    const gate = { x: 0, z: -3, dx: 0, dz: -1, across: 3, mx: 0, mz: 0 }
    const slots = mission({ kind: 'slots', laps: 1 })
    const at = (x: number, z: number) => step({ after: { x, z } })
    const through = run(slots, [at(3, 5), at(3, -1)], { ...context, gates: [gate] })
    expect(through.done).toBe(true)
    steps = 0
    const round = run(slots, [at(12, 5), at(12, -1)], { ...context, gates: [gate] })
    expect(round).toMatchObject({ failed: true, why: 'slotAround' })
  })
})

describe('against the computer', () => {
  const seat = (id: number, lapMs: number[], finishMs: number | null = null): RaceSeat => ({
    seat: id,
    lapMs,
    finishMs,
  })

  it('eliminations: the last over the line each lap, as soon as it is known', () => {
    // Four karts, three laps: two go out
    expect(eliminations([seat(0, [30]), seat(1, [31]), seat(2, []), seat(3, [])], 3)).toEqual([])
    expect(eliminations([seat(0, [30]), seat(1, [31]), seat(2, [29]), seat(3, [])], 3)).toEqual([3])
    expect(
      eliminations([seat(0, [30, 30]), seat(1, [31, 28]), seat(2, [29, 40]), seat(3, [50])], 3),
    ).toEqual([3, 2])
    // Never the last one in
    expect(eliminations([seat(0, [30, 30]), seat(1, [31, 31])], 5)).toEqual([1])
  })

  it('a place: decided at the player’s finish, or once too many are in', () => {
    const top3 = mission({ kind: 'place', target: 3, laps: 1, bots: { count: 5, difficulty: 'hard' } })
    const finished = [seat(0, [10], 10_000), seat(1, [11], 11_000), seat(5, [12], 12_000)]
    expect(judgeRace(top3, finished, 5)).toMatchObject({ done: true, place: 3, seconds: 12 })
    const beaten = [seat(0, [1], 1), seat(1, [1], 2), seat(2, [1], 3), seat(5, [], null)]
    expect(judgeRace(top3, beaten, 5)).toMatchObject({ failed: true, why: 'place' })
  })

  it('a chase: any kart over the line first is a loss', () => {
    const chase = mission({ kind: 'chase', laps: 1 })
    expect(judgeRace(chase, [seat(0, [9], 9_000), seat(1, [], null)], 1)).toMatchObject({
      failed: true,
      why: 'beaten',
    })
    expect(judgeRace(chase, [seat(0, [], null), seat(1, [8], 8_000)], 1).done).toBe(true)
  })

  it('an elimination race: out is a loss; the win counts only those still in', () => {
    const knockout = mission({ kind: 'elimination', laps: 2 })
    expect(judgeRace(knockout, [seat(0, [10]), seat(1, [11]), seat(2, [])], 2)).toMatchObject({
      failed: true,
      why: 'eliminated',
    })
    // Seat 2 went out after lap 1: its finish ahead of the player's does not count
    const won = [seat(0, [10, 10], 20_000), seat(1, [11, 10], 21_000), seat(2, [30, 1], 31_000)]
    expect(judgeRace(knockout, won, 1)).toMatchObject({ failed: true, why: 'beaten' })
    const first = [seat(0, [10, 12], 22_000), seat(1, [11, 10], 21_000), seat(2, [30, 1], 19_000)]
    expect(judgeRace(knockout, first, 1)).toMatchObject({ done: true, place: 1, out: [2] })
  })
})

describe('the medals', () => {
  it('are measured: the top driver within gold, the expert silver, the average driver bronze', () => {
    const times = calibrate({ average: [120, 125], expert: [90, 92], master: [80, 81] }, 3)
    expect(times.gold).toBe(81)
    expect(times.silver).toBeGreaterThanOrEqual(92)
    expect(times.bronze).toBeGreaterThanOrEqual(125)
    expect(times.platinum).toBe(78.4)
    expect(medalFor(times, 80)).toBe('gold')
    expect(medalFor(times, 78)).toBe('platinum')
    expect(medalFor(times, 200)).toBeNull()
  })

  it('every track and challenge track has its medals, in order', () => {
    for (const id of [...RACE_TRACK_IDS, ...CHALLENGE_TRACK_IDS]) {
      const times = MEDAL_TABLE[id]!
      expect(times, id).toBeDefined()
      expect(times.platinum).toBeLessThan(times.gold)
      expect(times.gold).toBeLessThan(times.silver)
      expect(times.silver).toBeLessThan(times.bronze)
    }
  })

  it('the next medal, then platinum, then none', () => {
    expect(nextMedal(undefined)).toBe('bronze')
    expect(nextMedal('gold')).toBe('platinum')
    expect(nextMedal('platinum')).toBeNull()
  })

  it('a mission’s limit follows its track’s medal, and its stars stay under it', () => {
    for (const one of MISSIONS) {
      const stars = missionStars(one)
      expect(stars.three).toBeLessThanOrEqual(stars.two)
      const limit = missionLimit(one)
      if (one.limit) {
        expect(limit).toBeGreaterThan(0)
        expect(stars.two).toBeLessThan(limit!)
      }
    }
    const fog = missionOf('fog')
    const harbour = medalTimes('harbour')!
    expect(missionLimit(fog)).toBeCloseTo((harbour.silver * 2 * 1.04) / 3, 0)
    expect(starsFor({ three: 10, two: 20 }, 10)).toBe(3)
    expect(starsFor({ three: 10, two: 20 }, 15)).toBe(2)
    expect(starsFor({ three: 10, two: 20 }, 25)).toBe(1)
  })

  it('a target ghost retimed to finish in the medal’s time', () => {
    const ghost = {
      track: 't',
      format: 1 as const,
      total: 60,
      laps: [60],
      samples: Array.from({ length: 21 }, (_, at) => [at, 0, 0]).flat(),
    }
    const slower = retimed(ghost, 120)
    expect(slower.total).toBe(120)
    expect(slower.laps).toEqual([120])
    // Half the pace: at step 60 it is where the driver was at step 30
    expect(slower.samples[(60 / 3) * 3]).toBeCloseTo(10)
  })
})

describe('what is kept in this browser', () => {
  it('the best medal and time, and the best stars', () => {
    let progress = withRun(EMPTY_PROGRESS, 'riverside', 100, 'silver')
    progress = withRun(progress, 'riverside', 110, 'bronze')
    expect(progress.medals.riverside).toBe('silver')
    expect(progress.best.riverside).toBe(100)
    progress = withStars(withStars(progress, 'clean', 3), 'clean', 1)
    expect(progress.stars.clean).toBe(3)
  })

  it('saved and read back; anything wrong in storage is left out', () => {
    saveRun('harbour', 120.5, 'gold')
    saveStars('combo5', 2)
    expect(loadProgress()).toEqual({ medals: { harbour: 'gold' }, best: { harbour: 120.5 }, stars: { combo5: 2 } })
    expect(parseProgress('{"medals":{"x":"tin"},"stars":{"nope":3,"clean":7},"best":{"a":-1}}')).toEqual(
      EMPTY_PROGRESS,
    )
    expect(parseProgress('not json')).toEqual(EMPTY_PROGRESS)
    localStorage.setItem(CHALLENGE_KEY, '[]')
    expect(loadProgress()).toEqual(EMPTY_PROGRESS)
  })

  it('a chapter opens once four of the one before are passed', () => {
    expect(chapterOpen(EMPTY_PROGRESS, 'basics')).toBe(true)
    expect(chapterOpen(EMPTY_PROGRESS, 'technique')).toBe(false)
    let progress = EMPTY_PROGRESS
    for (const one of missionsOf('basics').slice(0, 4)) progress = withStars(progress, one.id, 1)
    expect(chapterOpen(progress, 'technique')).toBe(true)
    expect(chapterOpen(progress, 'master')).toBe(false)
    // Passes in a later chapter do not open it while the one before is shut
    for (const one of missionsOf('master').slice(0, 4)) progress = withStars(progress, one.id, 1)
    expect(chapterOpen(progress, 'boss')).toBe(false)
  })
})
