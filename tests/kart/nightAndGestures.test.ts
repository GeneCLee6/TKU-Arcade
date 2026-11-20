import { describe, expect, it } from 'vitest'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { beamShade, headlightLevel, lampSpots, LAMP_SPACING } from '../../src/kart/art/nightLights.ts'
import { isNightTrack } from '../../src/kart/art/trackArt.ts'
import {
  blendPose,
  CHEER_SECONDS,
  gestureAt,
  gesturePose,
  PUMP_SECONDS,
  REST,
  WAVE_UNTIL,
} from '../../src/kart/driverGestures.ts'

// 2026-11-20 (§4.47): the night's lights and the drivers' gestures

describe('the night lights', () => {
  it('lights only the night tracks', () => {
    const night = RACE_TRACK_IDS.filter((id) => isNightTrack(raceTrack(id)!))
    expect(night.sort()).toEqual(['danhai', 'oldstreet'])
    expect(isNightTrack({ id: 'mine', theme: 'night' })).toBe(true)
  })

  it('puts a real light on high, pools on medium (and wherever the processor draws), none on low', () => {
    expect(headlightLevel('high', false)).toBe('spot')
    expect(headlightLevel('high', true)).toBe('pool')
    expect(headlightLevel('medium', false)).toBe('pool')
    expect(headlightLevel('low', false)).toBe('off')
  })

  it('shapes the beam: bright just ahead and in the middle, gone at the far end and the sides', () => {
    expect(beamShade(0, 0.3)).toBeGreaterThan(beamShade(0, 0.8))
    expect(beamShade(0, 0.3)).toBeGreaterThan(beamShade(0.6, 0.3))
    expect(beamShade(0, 1)).toBe(0)
    expect(beamShade(1, 0.2)).toBe(0)
    expect(beamShade(0, 0)).toBe(0)
    // Wider further out
    expect(beamShade(0.7, 0.9)).toBeGreaterThan(beamShade(0.7, 0.2))
  })

  it('stands the street lamps along the road, beside it, a side each in turn, pools on the road', () => {
    const track = raceTrack('danhai')!
    const spots = lampSpots(track.road)
    let length = 0
    for (let i = 0; i < track.road.length; i++) {
      const a = track.road[i]!
      const b = track.road[(i + 1) % track.road.length]!
      length += Math.hypot(b.x - a.x, b.z - a.z)
    }
    expect(Math.abs(spots.length - length / LAMP_SPACING)).toBeLessThanOrEqual(1)
    const nearest = (x: number, z: number) => {
      let best = { distance: Infinity, width: 0 }
      for (const point of track.road) {
        const distance = Math.hypot(point.x - x, point.z - z)
        if (distance < best.distance) best = { distance, width: point.width }
      }
      return best
    }
    for (const spot of spots) {
      const pool = nearest(spot.x, spot.z)
      expect(pool.distance).toBeLessThan(pool.width / 2 + 1)
      const post = nearest(spot.postX, spot.postZ)
      expect(post.distance).toBeGreaterThan(post.width / 2 - 1)
      // The lamp head reaches back over the road
      const reach = { x: spot.postX - Math.sin(spot.facing), z: spot.postZ - Math.cos(spot.facing) }
      expect(Math.hypot(reach.x - spot.x, reach.z - spot.z)).toBeLessThan(
        Math.hypot(spot.postX - spot.x, spot.postZ - spot.z),
      )
    }
  })
})

describe('the drivers', () => {
  it('wave in the fly round, look round on the grid, cheer across the line, punch the air for a place', () => {
    expect(gestureAt({ toGo: WAVE_UNTIL + 2, sinceFinish: null })).toBe('wave')
    expect(gestureAt({ toGo: 2, sinceFinish: null })).toBe('idle')
    expect(gestureAt({ toGo: null, sinceFinish: null })).toBeUndefined()
    expect(gestureAt({ toGo: null, sinceFinish: 1 })).toBe('cheer')
    expect(gestureAt({ toGo: null, sinceFinish: CHEER_SECONDS + 1 })).toBe('idle')
    expect(gestureAt({ toGo: null, sinceFinish: null, sincePlaceUp: 0.5 })).toBe('pump')
    expect(gestureAt({ toGo: null, sinceFinish: null, sincePlaceUp: PUMP_SECONDS + 0.1 })).toBeUndefined()
    // The finish comes before a place gained
    expect(gestureAt({ toGo: null, sinceFinish: 0.2, sincePlaceUp: 0.1 })).toBe('cheer')
  })

  it('raise the arms for a cheer and a podium, one arm to wave, the hands back on the yoke idle', () => {
    const cheer = gesturePose('cheer', 1)
    expect(cheer.leftUp).toBeGreaterThan(2)
    expect(cheer.rightUp).toBeGreaterThan(2)
    expect(cheer.leftOut).toBeGreaterThan(0.3)
    const wave = gesturePose('wave', 0.5)
    expect(wave.rightUp).toBeGreaterThan(2)
    expect(wave.leftUp).toBe(0)
    const podium = gesturePose('podium', 2)
    expect(Math.min(podium.leftUp, podium.rightUp)).toBeGreaterThan(2)
    for (let t = 0; t < 6; t += 0.25) {
      const idle = gesturePose('idle', t, 0.3)
      expect(Math.max(idle.leftUp, idle.rightUp)).toBeLessThan(0.3)
      expect(Math.abs(idle.headTurn)).toBeLessThanOrEqual(0.55)
    }
  })

  it('punch up fast and come back down by the end', () => {
    expect(gesturePose('pump', 0.3).rightUp).toBeGreaterThan(2)
    expect(gesturePose('pump', PUMP_SECONDS).rightUp).toBe(0)
  })

  it('ease from one pose to another', () => {
    const cheer = gesturePose('cheer', 1)
    expect(blendPose(REST, cheer, 0)).toEqual(REST)
    expect(blendPose(REST, cheer, 1)).toEqual(cheer)
    expect(blendPose(REST, cheer, 0.5).leftUp).toBeCloseTo(cheer.leftUp / 2)
  })

  it('do not all move as one: each driver is at their own point of a looping gesture', () => {
    expect(gesturePose('idle', 2, 0).headTurn).not.toBeCloseTo(gesturePose('idle', 2, 0.5).headTurn)
  })
})
