// e10-t07, e10-t08: the track editor's pieces made into a track, its checks, its codes, the loop
// closer, and a room's check on a track it is given (the same functions the Worker runs).
import { describe, expect, it } from 'vitest'
import { STEP_SECONDS } from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, parseTrack, recordKey } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'
import { buildSpec, GRID_PLACES } from '../../shared/kart/editor/build.ts'
import { closeLoop } from '../../shared/kart/editor/close.ts'
import { decodeSpec, encodeSpec, MAX_CODE_CHARS, specHash } from '../../shared/kart/editor/codec.ts'
import { CUSTOM_PREFIX, customTrack, isTrackCode } from '../../shared/kart/editor/custom.ts'
import { along, layout, pieceLength } from '../../shared/kart/editor/layout.ts'
import {
  LIMITS,
  starterSpec,
  straight,
  turn,
  type TrackSpec,
} from '../../shared/kart/editor/spec.ts'
import { autopilot } from '../../src/kart/race/autopilot.ts'

const spec = (pieces: TrackSpec['pieces'], more: Partial<TrackSpec> = {}): TrackSpec => ({
  name: '',
  theme: 'day',
  pieces,
  ...more,
})

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('pieces to a road', () => {
  it('walks straights and bends from the origin, right turns clockwise', () => {
    const start = { x: 0, z: 0, heading: 0 }
    // Heading 0 faces -z
    expect(along(straight(100), start, 100)).toMatchObject({ x: 0, z: -100, heading: 0 })
    const right = along(turn(90, 50), start, pieceLength(turn(90, 50)))
    expect(right.x).toBeCloseTo(50)
    expect(right.z).toBeCloseTo(-50)
    expect(right.heading).toBeCloseTo(Math.PI / 2)
    const left = along(turn(-90, 50), start, pieceLength(turn(-90, 50)))
    expect(left.x).toBeCloseTo(-50)
    expect(left.z).toBeCloseTo(-50)
    expect(left.heading).toBeCloseTo(-Math.PI / 2)
    expect(pieceLength(turn(180, 40))).toBeCloseTo(Math.PI * 40)
  })

  it('samples about every 6 m, each point knowing its piece, widths blending', () => {
    const laid = layout(starterSpec().pieces)
    expect(laid.road.length).toBeGreaterThan(100)
    for (let index = 0; index < laid.road.length; index++) {
      const a = laid.road[index]!
      const b = laid.road[(index + 1) % laid.road.length]!
      const gap = Math.hypot(b.x - a.x, b.z - a.z)
      expect(gap).toBeGreaterThan(1)
      expect(gap).toBeLessThan(8)
    }
    expect(laid.pieceOf[0]).toBe(0)
    expect(laid.pieceOf[laid.pieceOf.length - 1]).toBe(starterSpec().pieces.length - 1)
    // 36 m, then 50 m: the next piece starts at 36 and widens over 40 m
    const wide = layout([
      straight(100, 36),
      straight(100, 50),
      turn(180, 60, 50),
      straight(200, 50),
      turn(180, 60, 36),
    ])
    const second = wide.pieceOf.indexOf(1)
    expect(wide.road[second]!.width).toBe(36)
    expect(wide.road[second + 4]!.width).toBeGreaterThan(36)
    expect(wide.road[second + 10]!.width).toBe(50)
  })
})

describe('building and checking a track', () => {
  it('makes the starter track legal, with gates, respawns and a grid of eight on the road', () => {
    const built = buildSpec(starterSpec())
    expect(built.problems).toEqual([])
    const parsed = parseTrack(built.track)
    if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
    const track = parsed.track
    expect(track.id).toMatch(/^custom-[a-z0-9]+$/)
    expect(track.theme).toBe('day')
    expect(track.gates.length).toBeGreaterThan(10)
    expect(track.respawns.length).toBe(track.gates.length)
    expect(track.grid).toHaveLength(GRID_PLACES)
    for (const spot of track.grid) {
      expect(roadClearance(track.road, spot.x, spot.z)).toBeLessThan(-KART_RADIUS - 1)
      // Behind the line (at the origin, facing -z): z > 0
      expect(spot.z).toBeGreaterThan(0)
    }
    expect(Math.min(...track.road.map((point) => point.width))).toBeGreaterThanOrEqual(28)
    expect(track.boostPads).toHaveLength(1)
    expect(track.itemBoxes).toHaveLength(5)
    for (const box of track.itemBoxes) {
      expect(roadClearance(track.road, box.x, box.z)).toBeLessThan(-KART_RADIUS)
    }
  })

  it('says an open loop is open, on the last piece, and by how much', () => {
    const pieces = starterSpec().pieces.slice(0, -1)
    const built = buildSpec(spec(pieces))
    const open = built.problems.find((problem) => problem.code === 'open')
    expect(open?.pieces).toEqual([pieces.length - 1])
    expect(open?.params?.gap).toBe(120)
  })

  it('finds a road that runs into itself, and names both pieces', () => {
    // A figure of eight, flat: the two straights cross in the middle
    const eight = spec([
      straight(150),
      turn(270, 60),
      straight(150),
      straight(150),
      turn(-270, 60),
      straight(150),
    ])
    const built = buildSpec(eight)
    const crosses = built.problems.filter((problem) => problem.code === 'crosses')
    expect(crosses.length).toBeGreaterThan(0)
    expect(crosses.flatMap((problem) => problem.pieces)).toEqual(expect.arrayContaining([0, 5]))
  })

  it('finds two straights laid too close side by side', () => {
    // Out and back 20 m apart: the 36 m roads overlap
    const hairpin = spec([straight(300), turn(180, 10), straight(300), turn(180, 10)])
    const built = buildSpec(hairpin)
    expect(built.problems.map((problem) => problem.code)).toContain('tight')
    expect(built.problems.map((problem) => problem.code)).toContain('crosses')
  })

  it('refuses a bend tighter than half the road, naming its piece and the least radius', () => {
    const pieces = [...starterSpec().pieces]
    pieces[1] = turn(90, 20)
    const tight = buildSpec(spec(pieces)).problems.find((problem) => problem.code === 'tight')
    expect(tight?.pieces).toEqual([1])
    expect(tight?.params?.radius).toBe(24)
  })

  it('refuses a track too short or too long', () => {
    const tiny = spec([turn(90, 20, 28), turn(90, 20, 28), turn(90, 20, 28), turn(90, 20, 28)])
    expect(buildSpec(tiny).problems.map((problem) => problem.code)).toContain('short')
    const huge = spec([
      ...Array.from({ length: 8 }, () => straight(400)),
      turn(180, 100),
      ...Array.from({ length: 8 }, () => straight(400)),
      turn(180, 100),
    ])
    expect(buildSpec(huge).problems.map((problem) => problem.code)).toContain('long')
  })

  it('keeps the grid on the road even when the line is just out of a bend', () => {
    const pieces = [straight(10), ...starterSpec().pieces.slice(1, -1), turn(0.1, 60)]
    // Ends a bend right behind the line: closed, grid still checked
    const closed = closeLoop(spec(pieces.slice(0, -1)))
    expect(closed).not.toBeNull()
    const built = buildSpec(spec([...pieces.slice(0, -1), ...closed!]))
    expect(built.problems).toEqual([])
    for (const spot of built.track.grid) {
      expect(roadClearance(built.track.road, spot.x, spot.z)).toBeLessThan(-KART_RADIUS - 1)
    }
  })

  it('can be driven round three times by the autopilot, never the wrong way', () => {
    const parsed = parseTrack(buildSpec(starterSpec()).track)
    if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
    const track = parsed.track
    const course: TrialCourse = {
      ...courseOf(track),
      checkpoints: courseOf(track).checkpoints!,
      road: track.road,
    }
    let trial = startTrial(course)
    let steps = 0
    let wrong = 0
    while (trial.phase !== 'finished' && steps < 300 / STEP_SECONDS) {
      const before = trial
      trial = stepTrial(trial, autopilot(trial, track.road), course)
      if (trial.wrongWay && !before.wrongWay) wrong++
      steps++
    }
    expect(trial.phase).toBe('finished')
    expect(wrong).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(200)
  })
})

describe('closing the loop', () => {
  it('joins the end back to the start with a legal bend, straight and bend', () => {
    for (const cut of [1, 2, 3, 4]) {
      const pieces = starterSpec().pieces.slice(0, -cut)
      const added = closeLoop(spec(pieces))
      expect(added, `cut ${cut}`).not.toBeNull()
      expect(added!.length).toBeLessThanOrEqual(5)
      expect(buildSpec(spec([...pieces, ...added!])).problems).toEqual([])
    }
  })

  it('closes a track that wanders off at an odd angle', () => {
    const pieces = [straight(200), turn(37.5, 80), straight(120), turn(-64, 70), straight(90)]
    const added = closeLoop(spec(pieces))
    expect(added).not.toBeNull()
    expect(buildSpec(spec([...pieces, ...added!])).problems).toEqual([])
  })
})

describe('codes', () => {
  const sample = spec(
    [
      straight(120.5, 40, { pad: 'right', boxes: true }),
      turn(-87.5, 60.2, 32),
      ...starterSpec().pieces.slice(1),
    ],
    { name: '  淡水 夜跑  ', theme: 'night' },
  )

  it('go there and back, names cleaned, numbers to a tenth', () => {
    const code = encodeSpec(sample)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThan(MAX_CODE_CHARS)
    const back = decodeSpec(code)
    expect(back).toEqual({ ...sample, name: '淡水 夜跑' })
    expect(encodeSpec(back!)).toBe(code)
  })

  it('fit sixty pieces with everything on them well within the cap', () => {
    const full = spec(
      Array.from({ length: LIMITS.maxPieces }, (_, index) =>
        index % 2
          ? turn(-123.4, 234.5, 45.5, { pad: 'middle', boxes: true })
          : straight(345.6, 55.5, { pad: 'left', boxes: true }),
      ),
      { name: '一二三四五六七八九十一二三四五六七八九十一二三四' },
    )
    const code = encodeSpec(full)
    expect(code.length).toBeLessThan(MAX_CODE_CHARS * 0.8)
    expect(decodeSpec(code)?.pieces).toHaveLength(LIMITS.maxPieces)
  })

  it('refuse anything that is not one: junk, too long, NaN, out of range, extra fields', () => {
    const wrap = (value: unknown) => toBase64Url(JSON.stringify(value))
    const good = {
      v: 1,
      n: 'x',
      t: 'day',
      p: [
        ['s', 100, 36, 0, 0],
        ['t', 90, 50, 36, 0, 0],
        ['s', 50, 36, 0, 0],
      ],
    }
    expect(decodeSpec(wrap(good))).not.toBeNull()
    const bad: unknown[] = [
      { ...good, v: 2 },
      { ...good, t: 'moon' },
      { ...good, n: 7 },
      { ...good, p: [] },
      { ...good, p: Array.from({ length: LIMITS.maxPieces + 1 }, () => ['s', 10, 36, 0, 0]) },
      { ...good, p: [['s', 100, 27, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', 100, 61, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', 401, 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', 100.25, 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', '100', 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', 100, 36, 4, 0], ...good.p.slice(1)] },
      { ...good, p: [['s', 100, 36, 0, 2], ...good.p.slice(1)] },
      { ...good, p: [['s', 100, 36, 0, 0, 9], ...good.p.slice(1)] },
      { ...good, p: [['t', 0, 50, 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['t', 361, 50, 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['t', 90, 14, 36, 0, 0], ...good.p.slice(1)] },
      { ...good, p: [['x', 90, 50, 36, 0, 0], ...good.p.slice(1)] },
      [1, 2, 3],
      null,
      'text',
    ]
    for (const value of bad) expect(decodeSpec(wrap(value)), JSON.stringify(value)).toBeNull()
    // NaN and Infinity are not JSON; written in by hand they do not parse either
    expect(decodeSpec(toBase64Url('{"v":1,"n":"","t":"day","p":[["s",NaN,36,0,0]]}'))).toBeNull()
    expect(decodeSpec('not a code!')).toBeNull()
    expect(decodeSpec('')).toBeNull()
    expect(decodeSpec('A'.repeat(MAX_CODE_CHARS + 1))).toBeNull()
    expect(decodeSpec(toBase64Url('￿'))).toBeNull()
  })

  it('hash the layout alone: the same pieces, the same records, whatever the name and light', () => {
    const a = buildSpec(starterSpec()).track
    const b = buildSpec({ ...starterSpec(), name: 'Mine', theme: 'night' }).track
    expect(recordKey(a)).toBe(recordKey(b))
    const pieces = [...starterSpec().pieces]
    pieces[0] = straight(121)
    expect(specHash(pieces)).not.toBe(specHash(starterSpec().pieces))
  })
})

describe('a room given a custom track', () => {
  it('builds the same track from the code, as the race reads it', () => {
    const code = encodeSpec(starterSpec())
    expect(isTrackCode(code)).toBe(true)
    const result = customTrack(code)
    expect(result.ok).toBe(true)
    const track = raceTrack(`${CUSTOM_PREFIX}${code}`)
    expect(track?.road).toEqual(buildSpec(starterSpec()).track.road)
    expect(track?.gates).toEqual(buildSpec(starterSpec()).track.gates)
  })

  it('refuses a code that decodes but makes no legal track: open, crossing, too tight', () => {
    const open = encodeSpec(spec(starterSpec().pieces.slice(0, -1)))
    const crossing = encodeSpec(
      spec([
        straight(150),
        turn(270, 60),
        straight(150),
        straight(150),
        turn(-270, 60),
        straight(150),
      ]),
    )
    for (const code of [open, crossing]) {
      expect(isTrackCode(code)).toBe(false)
      expect(raceTrack(`${CUSTOM_PREFIX}${code}`)).toBeNull()
    }
    const result = customTrack(open)
    expect(!result.ok && result.reason).toBe('track')
  })

  it('refuses junk and oversized codes without reading them', () => {
    expect(isTrackCode('')).toBe(false)
    expect(isTrackCode('%%%')).toBe(false)
    expect(isTrackCode('A'.repeat(100_000))).toBe(false)
    expect(raceTrack(`${CUSTOM_PREFIX}${'A'.repeat(100_000)}`)).toBeNull()
    expect(raceTrack('custom:')).toBeNull()
  })
})
