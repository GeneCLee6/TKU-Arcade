import { describe, expect, it } from 'vitest'
import { STEP_SECONDS, type KartInput } from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import {
  seconds,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import {
  courseOf,
  parseTrack,
  recordKey,
  type Track,
  type TrackJson,
} from '../../shared/kart/track.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TAMKANG } from '../../shared/kart/tracks/tamkang.ts'
import {
  CAMPUS_SOUTH,
  CAMPUS_WEST,
  TAMKANG_LANDMARKS,
  inTamkangRiver,
  tamkangGround,
  tamkangTreeFits,
} from '../../src/kart/art/tamkangArt.ts'

// 2026-11-14 (owner: wide tracks, and a Tamkang University map): the widened tracks, and the
// campus track, its ground and its landmarks

const load = (json: TrackJson): Track => {
  const parsed = parseTrack(json)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  return parsed.track
}

const length = (json: TrackJson) =>
  json.road.reduce((sum, point, index) => {
    const next = json.road[(index + 1) % json.road.length]!
    return sum + Math.hypot(next.x - point.x, next.z - point.z)
  }, 0)

/** Steers at the road a few points ahead, slowing for bends: enough to go round, not to race */
function autopilot(trial: Trial, road: readonly { x: number; z: number }[]): KartInput {
  const { kart } = trial.run
  let nearest = 0
  let best = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - kart.x) ** 2 + (point.z - kart.z) ** 2
    if (distance < best) {
      best = distance
      nearest = index
    }
  })
  const target = road[(nearest + 4) % road.length]!
  let turn = Math.atan2(target.x - kart.x, -(target.z - kart.z)) - kart.heading
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const speed = Math.hypot(kart.vx, kart.vz)
  const sharp = Math.abs(turn) > 0.35
  return {
    throttle: !(sharp && speed > 14),
    brake: sharp && speed > 20,
    steer: Math.max(-1, Math.min(1, turn * 3)),
    drift: false,
    boost: false,
  }
}

describe('the wide tracks', () => {
  it('makes Riverside and the harbour wide: at least 15 m everywhere, about ten kart widths', () => {
    for (const json of [RIVERSIDE, HARBOUR, TAMKANG]) {
      expect(Math.min(...json.road.map((point) => point.width)), json.id).toBeGreaterThanOrEqual(15)
    }
    expect(Math.min(...RIVERSIDE.road.map((point) => point.width))).toBeGreaterThanOrEqual(18)
  })

  it('keeps the widened layouts’ records apart from the old ones', () => {
    expect(recordKey(load(RIVERSIDE))).toBe('riverside@2')
    expect(recordKey(load(HARBOUR))).toBe('harbour@2')
    expect(recordKey(load(TAMKANG))).toBe('tamkang')
  })
})

describe('the Tamkang campus track', () => {
  it('is a valid track whose road never runs into itself, the grid behind the line', () => {
    const track = load(TAMKANG)
    const { road } = track
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        const along = Math.min(j - i, road.length - (j - i))
        if (along * 6 < 40) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        expect(gap, `road ${i} and ${j}`).toBeGreaterThan((road[i]!.width + road[j]!.width) / 2 + 4)
      }
    }
    // The line is on the lantern avenue, driven northwards (-z); the grid is behind it
    expect(track.road[0]).toMatchObject({ x: 0, z: 40 })
    for (const place of track.grid) {
      expect(place.z).toBeGreaterThan(track.road[0]!.z)
      expect(place.heading).toBeCloseTo(0)
    }
    expect(length(TAMKANG)).toBeGreaterThan(1500)
    expect(length(TAMKANG)).toBeLessThan(1900)
  })

  it('can be driven round three times, never the wrong way', () => {
    const track = load(TAMKANG)
    const course: TrialCourse = {
      ...courseOf(track),
      checkpoints: courseOf(track).checkpoints!,
      road: track.road,
    }
    let trial = startTrial(course)
    let steps = 0
    let wrongWarnings = 0
    while (trial.phase !== 'finished' && steps < 360 / STEP_SECONDS) {
      const before = trial
      trial = stepTrial(trial, autopilot(trial, track.road), course)
      if (trial.wrongWay && !before.wrongWay) wrongWarnings++
      steps++
    }
    expect(trial.phase).toBe('finished')
    expect(wrongWarnings).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(300)
  })
})

describe('the campus scenery', () => {
  it('keeps the road and its surroundings flat and on the campus', () => {
    for (const point of TAMKANG.road) {
      expect(tamkangGround(point.x, point.z)).toBe(0)
      expect(point.x - point.width / 2).toBeGreaterThan(CAMPUS_WEST + 10)
      expect(point.z + point.width / 2).toBeLessThan(CAMPUS_SOUTH - 10)
      expect(inTamkangRiver(point.x, point.z, 100)).toBe(false)
    }
  })

  it('falls away beyond the campus to the town and the river, with the water across it', () => {
    expect(tamkangGround(CAMPUS_WEST - 200, 0)).toBeLessThan(-20)
    expect(tamkangGround(0, CAMPUS_SOUTH + 200)).toBeLessThan(-20)
    // Across the river from the campus, in the middle of it
    expect(inTamkangRiver(-600, 900)).toBe(true)
    expect(tamkangGround(-600, 900)).toBeLessThan(-28)
  })

  it('stands every landmark clear of the road, and grows no tree on them', () => {
    for (const box of TAMKANG_LANDMARKS) {
      for (let x = box.minX; x <= box.maxX; x += (box.maxX - box.minX) / 6) {
        for (let z = box.minZ; z <= box.maxZ; z += (box.maxZ - box.minZ) / 6) {
          expect(roadClearance(TAMKANG.road, x, z), `${x}, ${z}`).toBeGreaterThan(3)
          expect(tamkangTreeFits(x, z)).toBe(false)
        }
      }
    }
  })
})
