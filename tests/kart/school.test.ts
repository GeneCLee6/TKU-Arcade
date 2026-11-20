import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
  type KartState,
} from '../../shared/kart/physics.ts'
import { parseTrack } from '../../shared/kart/track.ts'
import { SCHOOL_TEST, SCHOOL_YARD, schoolTrack } from '../../shared/kart/tracks/school.ts'
import { coachStep, startCoach } from '../../src/kart/school/coach.ts'
import { lessonContext } from '../../src/kart/school/headless.ts'
import {
  judgeStep,
  liveHint,
  nextTry,
  starsFor,
  startJudge,
  watchDash,
  worstNote,
  IDLE_WATCH,
  type Judge,
  type JudgeContext,
  type Sample,
} from '../../src/kart/school/judge.ts'
import { LESSON_IDS, LESSONS, nextLesson, type LessonId } from '../../src/kart/school/lessons.ts'
import {
  answerInvite,
  firstOpen,
  loadCoachOn,
  loadProgress,
  loadTipsSeen,
  parseProgress,
  saveCoachOn,
  saveResult,
  saveTipSeen,
  shouldInvite,
  totalStars,
  withResult,
} from '../../src/kart/school/store.ts'

// 2026-11-20 (docs/ARCHITECTURE.md §4.49): the driving school. Each lesson's judge is fed made-up
// steps of the physics (a kart state before and after, the input), so that what passes a lesson
// and what each mistake is called are pinned without driving; the progress and the tips' store;
// and (school.master.test.ts) the master driver passing every lesson for real.

const tuning = KART_TUNING
const context: JudgeContext = { tuning }

const kart = (over: Partial<KartState> = {}): KartState => ({
  ...INITIAL_KART,
  vx: 0,
  vz: -60,
  throttleHeld: true,
  ...over,
})

const press = (over: Partial<KartInput> = {}): KartInput => ({ ...NO_INPUT, throttle: true, ...over })

let steps = 100

/** One racing step, from `before` to `after` */
const step = (
  before: KartState,
  after: KartState,
  input: KartInput = press(),
  over: Partial<Sample> = {},
): Sample => ({
  before,
  after,
  input,
  phase: 'racing',
  start: 'none',
  steps: steps++,
  laps: 0,
  wrongWay: false,
  hit: 0,
  hitBefore: 0,
  ...over,
})

const run = (id: LessonId, samples: readonly Sample[], ctx: JudgeContext = context): Judge =>
  samples.reduce((judge, sample) => judgeStep(LESSONS[id], judge, sample, ctx), startJudge())

// A drift under way that has earned the instant boost, and the same let go (sliding out)
const drifting = kart({ drifting: true, driftDirection: 1, driftSeconds: 0.5, driftPeak: 0.4 })
const earned = { ...drifting, burstReady: true }
const slidingOut = kart({
  burstReady: true,
  slideDirection: 1,
  driftHeld: 0.5,
  sinceRelease: 0.02,
})
const straight = kart()

/** An instant boost fired out of the slide, of this grade */
const fired = (grade: number, before: Partial<KartState> = {}, count = 1): Sample =>
  step({ ...slidingOut, ...before }, kart({ dashCount: count, dashGrade: grade, miniSeconds: 0.7 }))

describe('the instant boost, step by step (watchDash)', () => {
  it('tells a drift that has just earned one, and one fired with its grade', () => {
    expect(watchDash(IDLE_WATCH, step(drifting, earned), tuning).events).toEqual([
      { kind: 'earned' },
    ])
    expect(watchDash(IDLE_WATCH, fired(3), tuning).events).toEqual([
      { kind: 'fired', grade: 3, why: null },
    ])
  })

  it('says why a drift let go earned nothing: too short, or not deep', () => {
    const short = { ...drifting, driftSeconds: 0.1, driftPeak: 0.4 }
    const shallow = { ...drifting, driftSeconds: 0.6, driftPeak: 0.1 }
    expect(watchDash(IDLE_WATCH, step(short, straight), tuning).events).toEqual([
      { kind: 'unearned', why: 'driftShort' },
    ])
    expect(watchDash(IDLE_WATCH, step(shallow, straight), tuning).events).toEqual([
      { kind: 'unearned', why: 'driftShallow' },
    ])
  })

  it('says why one that was there never fired', () => {
    const waiting = watchDash(IDLE_WATCH, step(earned, slidingOut), tuning).watch
    expect(waiting.waiting).toBe(true)
    // The throttle held all along, until the window closed
    expect(watchDash(waiting, step(slidingOut, straight), tuning).events).toEqual([
      { kind: 'missed', why: 'heldThrottle' },
    ])
    // Let go of and never pressed again
    const up = watchDash(waiting, step(slidingOut, slidingOut, press({ throttle: false })), tuning)
    expect(watchDash(up.watch, step(slidingOut, straight, NO_INPUT), tuning).events).toEqual([
      { kind: 'missed', why: 'noThrottle' },
    ])
    // A new drift begun before it fired
    expect(watchDash(waiting, step(slidingOut, drifting), tuning).events).toEqual([
      { kind: 'missed', why: 'redrift' },
    ])
  })

  it('says why one came out short of perfect', () => {
    const why = (before: Partial<KartState>, grade = 2) =>
      watchDash(IDLE_WATCH, fired(grade, before), tuning).events[0]
    expect(why({ driftHeld: 0.3 })).toMatchObject({ why: 'perfectShort' })
    expect(why({ tapEarly: 0.1 })).toMatchObject({ why: 'perfectTapEarly' })
    expect(why({})).toMatchObject({ why: 'perfectSlow' })
    expect(why({ drifting: true })).toMatchObject({ why: 'perfectHeld' })
    expect(why({}, 1)).toMatchObject({ grade: 1, why: 'late' })
  })
})

describe('each lesson’s goal (judgeStep)', () => {
  it('drive: one lap; the crashes on the way are counted and told', () => {
    const judge = run('drive', [
      step(straight, straight, press(), { hit: 20, hitBefore: 0 }),
      step(straight, straight, press(), { laps: 1 }),
    ])
    expect(judge.done).toBe(true)
    expect(judge.hits).toBe(1)
    expect(judge.mistakes.wall).toBe(1)
    expect(starsFor(LESSONS.drive, judge)).toBe(2)
  })

  it('drift: three drifts that turn the meter gold; a short one is told', () => {
    const short = { ...drifting, driftSeconds: 0.1 }
    const judge = run('drift', [
      step(short, straight),
      step(drifting, earned),
      step(drifting, earned),
      step(drifting, earned),
    ])
    expect(judge.count).toBe(3)
    expect(judge.done).toBe(true)
    expect(judge.mistakes.driftShort).toBe(1)
  })

  it('dash: three instant boosts, any grade; the throttle held all along is told', () => {
    const judge = run('dash', [
      step(drifting, earned),
      step(earned, slidingOut),
      step(slidingOut, straight),
      fired(2),
      fired(1, { dashCount: 1 }, 2),
      fired(3, { dashCount: 2 }, 3),
    ])
    expect(judge.mistakes.heldThrottle).toBe(1)
    expect(judge.done).toBe(true)
  })

  it('perfect: three in a row; one short of perfect starts the count over and says why', () => {
    let judge = run('perfect', [fired(3), fired(3, { dashCount: 1 }, 2)])
    expect(judge.count).toBe(2)
    judge = judgeStep(LESSONS.perfect, judge, fired(2, { dashCount: 2 }, 3), context)
    expect(judge.count).toBe(0)
    expect(judge.note).toBe('perfectSlow')
    for (let n = 3; n < 6; n++) {
      judge = judgeStep(LESSONS.perfect, judge, fired(3, { dashCount: n }, n + 1), context)
    }
    expect(judge.done).toBe(true)
  })

  it('combo: a combo of three; a combo that runs out of time is told', () => {
    let judge = run('combo', [step(kart({ chain: 2, chainWindow: 0.01 }), kart({ chain: 0 }))])
    expect(judge.note).toBe('comboTimeout')
    judge = judgeStep(LESSONS.combo, judge, fired(3), context)
    judge = judgeStep(
      LESSONS.combo,
      judge,
      step({ ...slidingOut, chain: 2 }, kart({ chain: 3, dashCount: 1, dashGrade: 3 })),
      context,
    )
    expect(judge.done).toBe(true)
    // A late one does not add, and says so
    const late = run('combo', [
      step({ ...slidingOut, chain: 1 }, kart({ chain: 1, dashCount: 1, dashGrade: 1 })),
    ])
    expect(late.note).toBe('comboLate')
  })

  it('n2o: a charge, fired, then filling while it burns; the key pressed while it burns is told', () => {
    const charged = kart({ storedBoosts: 1, gauge: 0 })
    const burning = kart({ storedBoosts: 0, boostSeconds: 2.5, gauge: 0, boostHeld: true })
    let judge = run('n2o', [
      step(straight, straight, press({ boost: true })),
      step(straight, charged),
      step(charged, burning, press({ boost: true })),
      step(burning, burning, press({ boost: true }), {}),
    ])
    expect(judge.mistakes.boostEmpty).toBe(1)
    expect(judge.count).toBe(2)
    judge = judgeStep(
      LESSONS.n2o,
      judge,
      step({ ...burning, boostHeld: false }, burning, press({ boost: true })),
      context,
    )
    expect(judge.note).toBe('boostLocked')
    judge = judgeStep(LESSONS.n2o, judge, step(burning, { ...burning, gauge: 12 }), context)
    expect(judge.done).toBe(true)
  })

  it('start: a perfect start passes; held from too early is told once the start is settled', () => {
    const at = (n: number, start: Sample['start']) =>
      step(straight, straight, press(), { steps: n, start })
    const good = run('start', [at(0, 'boost'), at(1, 'boost')])
    expect(good.done).toBe(true)
    expect(good.attempts).toBe(1)
    expect(starsFor(LESSONS.start, good)).toBe(3)
    let early = run('start', [at(0, 'quick'), at(1, 'quick'), at(10, 'quick')])
    expect(early.tryOver).toBe(false)
    early = judgeStep(LESSONS.start, early, at(80, 'quick'), context)
    expect(early.tryOver).toBe(true)
    expect(early.note).toBe('startEarly')
    // The next try keeps the count of tries and what went wrong
    const again = judgeStep(LESSONS.start, nextTry(early), at(1, 'late'), context)
    expect(again.attempts).toBe(2)
    expect(again.mistakes.startEarly).toBe(1)
  })

  it('jump: a drift landed off the ramp passes; taking off without a drift ends the try', () => {
    const air = (over: Partial<KartState>) => kart({ air: 0.1, ...over })
    const flat = run('jump', [step(straight, air({}))])
    expect(flat.tryOver).toBe(true)
    expect(flat.note).toBe('jumpNoDrift')
    const shallow = run('jump', [step(drifting, air({ drifting: false }))])
    expect(shallow.note).toBe('jumpShallow')
    const letGo = run('jump', [step(air({ airDrift: 1 }), air({ airDrift: 0 }))])
    expect(letGo.note).toBe('jumpLetGo')
    const landed = run('jump', [
      step(drifting, air({ airDrift: 1, drifting: true })),
      step(air({ airDrift: 1 }), kart({ driftJumps: 1, drifting: true })),
    ])
    expect(landed.done).toBe(true)
  })

  it('gap: through the gates in turn; round a wall ends the try', () => {
    // A road straight up -z (heading 0), two gates 5 m right of the middle
    const gates = [
      { x: 5, z: -100, dx: 0, dz: -1, across: 5, mx: 0, mz: -100 },
      { x: 5, z: -200, dx: 0, dz: -1, across: 5, mx: 0, mz: -200 },
    ]
    const ctx = { tuning, gates }
    const at = (x: number, z: number) => kart({ x, z })
    const through = run(
      'gap',
      [
        step(at(5, -98), at(5, -99.5)),
        step(at(5, -99.5), at(5, -100.5)),
        step(at(5, -198), at(5, -199.5)),
        step(at(5, -199.5), at(4, -201)),
      ],
      ctx,
    )
    expect(through.count).toBe(2)
    const round = run(
      'gap',
      [step(at(-20, -98), at(-20, -99.5)), step(at(-20, -99.5), at(-20, -100.5))],
      ctx,
    )
    expect(round.tryOver).toBe(true)
    expect(round.note).toBe('gapAround')
    const crash = run('gap', [step(at(0, -95), at(0, -96), press(), { hit: 30 })], ctx)
    expect(crash.note).toBe('gapWall')
  })

  it('final: two laps within the limit; stars by the time', () => {
    const finish = (seconds: number) =>
      run('final', [
        step(straight, straight, press(), {
          laps: 2,
          phase: 'finished',
          steps: Math.round(seconds * 60),
        }),
      ])
    expect(starsFor(LESSONS.final, finish(25))).toBe(3)
    expect(starsFor(LESSONS.final, finish(33))).toBe(2)
    expect(starsFor(LESSONS.final, finish(45))).toBe(1)
    const slow = finish(70)
    expect(slow.done).toBe(false)
    expect(slow.failed).toBe(true)
  })

  it('a lesson out of time is failed, and the summary names what went wrong most', () => {
    const short = { ...drifting, driftSeconds: 0.1 }
    const judge = run('drift', [
      step(short, straight, press(), { steps: 10 }),
      step(short, straight, press(), { steps: 200 }),
      step({ ...drifting, driftPeak: 0.05 }, straight, press(), { steps: 400 }),
      step(straight, straight, press(), { steps: 60 * 121 }),
    ])
    expect(judge.failed).toBe(true)
    expect(judge.note).toBe('timeUp')
    expect(worstNote(judge)).toBe('driftShort')
  })

  it('the help of the moment follows the kart', () => {
    expect(liveHint(LESSONS.dash, drifting, tuning, null)).toBe('deeper')
    expect(liveHint(LESSONS.dash, earned, tuning, null)).toBe('letGoNow')
    expect(liveHint(LESSONS.dash, { ...earned, driftSeconds: 0.25 }, tuning, null)).toBe('letGo')
    expect(liveHint(LESSONS.dash, slidingOut, tuning, null)).toBe('press')
    expect(liveHint(LESSONS.start, straight, tuning, 2.5)).toBe('wait')
    expect(liveHint(LESSONS.start, straight, tuning, 0.6)).toBe('holdNow')
    expect(liveHint(LESSONS.n2o, kart({ storedBoosts: 1 }), tuning, null)).toBe('fire')
  })
})

describe('the lessons and their tracks', () => {
  it('ten lessons in order, each on a track that checks out', () => {
    expect(LESSON_IDS).toHaveLength(10)
    expect(nextLesson('drive')).toBe('drift')
    expect(nextLesson('final')).toBeNull()
    for (const json of [SCHOOL_YARD, SCHOOL_TEST]) expect(parseTrack(json)).toHaveProperty('track')
    for (const id of LESSON_IDS) expect(schoolTrack(LESSONS[id].track).road.length).toBeGreaterThan(50)
  })

  it('the gates lesson knows the lanes’ three yard gates', () => {
    const track = schoolTrack('lanes')
    expect(lessonContext('gap', track, tuning).gates).toHaveLength(3)
  })
})

describe('the progress kept in this browser (store.ts)', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads only what it wrote', () => {
    expect(parseProgress(null)).toEqual({})
    expect(parseProgress('not json')).toEqual({})
    expect(parseProgress('[1,2]')).toEqual({})
    expect(parseProgress('{"drift":2,"nope":3,"dash":7,"gap":0}')).toEqual({ drift: 2, gap: 0 })
  })

  it('keeps the best stars; a skip never lowers a pass', () => {
    expect(withResult({ drift: 3 }, 'drift', 1)).toEqual({ drift: 3 })
    expect(withResult({ drift: 1 }, 'drift', 2)).toEqual({ drift: 2 })
    expect(withResult({ drift: 2 }, 'drift', 0)).toEqual({ drift: 2 })
    expect(withResult({}, 'dash', 0)).toEqual({ dash: 0 })
  })

  it('saves and loads, suggests the first open lesson and counts the stars', () => {
    expect(shouldInvite()).toBe(true)
    saveResult('drive', 3)
    saveResult('drift', 0)
    expect(loadProgress()).toEqual({ drive: 3, drift: 0 })
    expect(firstOpen(loadProgress())).toBe('dash')
    expect(totalStars(loadProgress())).toBe(3)
    // A lesson done: no more suggesting the school on /kart
    expect(shouldInvite()).toBe(false)
  })

  it('the invite once answered, the tips switch and the tips given', () => {
    answerInvite()
    expect(shouldInvite()).toBe(false)
    expect(loadCoachOn()).toBe(true)
    saveCoachOn(false)
    expect(loadCoachOn()).toBe(false)
    saveTipSeen('repress')
    saveTipSeen('repress')
    expect([...loadTipsSeen()]).toEqual(['repress'])
  })

  it('never throws when the browser keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadProgress()).toEqual({})
    expect(() => saveResult('drive', 2)).not.toThrow()
    expect(() => saveTipSeen('start')).not.toThrow()
    expect(loadCoachOn()).toBe(true)
  })
})

describe('the tips during a race (coach.ts)', () => {
  it('an instant boost earned and lost with the throttle held: the tip to press again', () => {
    let coach = startCoach()
    const tips: string[] = []
    for (const sample of [
      step(drifting, earned, press(), { steps: 100 }),
      step(earned, slidingOut, press(), { steps: 101 }),
      step(slidingOut, straight, press(), { steps: 102 }),
    ]) {
      const result = coachStep(coach, sample, tuning)
      coach = result.coach
      if (result.tip) tips.push(result.tip)
    }
    expect(tips).toContain('repress')
  })

  it('a start with no start boost: the tip; a perfect start: known, no tip', () => {
    const at = (start: Sample['start']) =>
      coachStep(startCoach(), step(straight, straight, press(), { steps: 60, start }), tuning)
    expect(at('none').tip).toBe('start')
    expect(at('boost').tip).toBeNull()
    expect(at('boost').known).toContain('start')
  })

  it('an instant boost fired unprompted: its tip is no longer needed', () => {
    const result = coachStep(startCoach(), fired(2), tuning)
    expect(result.known).toEqual(expect.arrayContaining(['repress', 'deeper']))
  })
})
