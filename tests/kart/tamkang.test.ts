import { describe, expect, it } from 'vitest'
import { STEP_SECONDS, type KartInput } from '../../shared/kart/physics.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'
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
import { alongRoad, sharpCorners } from './trackShape.ts'
import {
  CAMPUS_SOUTH,
  CAMPUS_WEST,
  TAMKANG_LANDMARKS,
  inTamkangRiver,
  tamkangGround,
  tamkangTreeFits,
} from '../../src/kart/art/tamkangArt.ts'

// 2026-11-14 (owner: wide tracks, and a Tamkang University map): the widened tracks, and the
// campus track, its ground and its landmarks. Then (owner: room for eight karts side by side, more
// sharp corners): every road 28 m or more, and corners that want a drift

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
  it('leaves room for eight karts side by side everywhere: 28 m or more', () => {
    // Eight karts' collision circles (walls.ts KART_RADIUS, 1.2 m) side by side take 19.2 m
    const eightKarts = 8 * 2 * KART_RADIUS
    for (const json of [RIVERSIDE, HARBOUR, TAMKANG]) {
      const narrowest = Math.min(...json.road.map((point) => point.width))
      expect(narrowest, json.id).toBeGreaterThanOrEqual(28)
      expect(narrowest - 2 * KART_RADIUS, json.id).toBeGreaterThan(eightKarts + 4)
    }
  })

  it('has corners sharp enough to want a drift at the new speed', () => {
    // At 40 m/s the grip alone turns no tighter than about 30 m: these swing round by more than
    // 75 degrees within 60 m
    for (const json of [RIVERSIDE, HARBOUR, TAMKANG]) {
      expect(sharpCorners(json.road, 60, 75), json.id).toBeGreaterThanOrEqual(5)
    }
  })

  it('keeps the new layouts’ records apart from the old ones', () => {
    expect(recordKey(load(RIVERSIDE))).toBe('riverside@5')
    expect(recordKey(load(HARBOUR))).toBe('harbour@5')
    expect(recordKey(load(TAMKANG))).toBe('tamkang@4')
  })
})

describe('the Tamkang campus track', () => {
  it('is a valid track whose road never runs into itself, the grid behind the line', () => {
    const track = load(TAMKANG)
    const { road } = track
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        // Neighbours along the road (a hairpin's two legs included) are close by nature; any other
        // part keeps clear of the kerbs
        if (alongRoad(road, i, j) < 90) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        expect(gap, `road ${i} and ${j}`).toBeGreaterThan((road[i]!.width + road[j]!.width) / 2 + 4)
      }
    }
    // The line is on the lantern avenue, driven northwards (-z); the grid is behind it
    expect(track.road[0]).toMatchObject({ x: 0, z: 60 })
    for (const place of track.grid) {
      expect(place.z).toBeGreaterThan(track.road[0]!.z)
      expect(place.heading).toBeCloseTo(0)
    }
    expect(length(TAMKANG)).toBeGreaterThan(2400)
    expect(length(TAMKANG)).toBeLessThan(2900)
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
    while (trial.phase !== 'finished' && steps < 480 / STEP_SECONDS) {
      const before = trial
      trial = stepTrial(trial, autopilot(trial, track.road), course)
      if (trial.wrongWay && !before.wrongWay) wrongWarnings++
      steps++
    }
    expect(trial.phase).toBe('finished')
    expect(wrongWarnings).toBe(0)
    expect(seconds(trial.steps)).toBeLessThan(420)
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
