import { describe, expect, it } from 'vitest'
import { startRun, stepRun, type Course, type Run } from '../../shared/kart/course.ts'
import { applyKart, kartMass } from '../../shared/kart/karts.ts'
import {
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { slopeWeight, TERRAIN_TUNING, terrainOf, type Terrain } from '../../shared/kart/terrain.ts'
import type { RoadPoint } from '../../shared/kart/track.ts'

// A kart's weight on a steep slope (2026-11-21, shared/kart/terrain.ts's slopeWeight,
// docs/KART-META.md §2): a heavy kart slower up a steep climb and faster down a steep descent, a
// light one the other way round; the standard weight and gentle slopes exactly as before.

function testTerrain(grade: number): Terrain {
  const road: RoadPoint[] = []
  for (let i = 0; i <= 160; i++) road.push({ x: 0, z: -i * 5, width: 30, y: i * 5 * grade })
  return terrainOf({ road })!
}

const course = (terrain: Terrain): Course => ({
  walls: [],
  start: { x: 0, z: 0, heading: 0 },
  terrain,
})

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }

/** The speed after `seconds` flat out from 55 m/s along -z */
function speedAfter(c: Course, tuning: KartTuning, seconds = 8): number {
  let run: Run = { ...startRun(c), kart: { ...INITIAL_KART, vz: -55 } }
  for (let i = 0; i < seconds * 60; i++) run = stepRun(run, THROTTLE, c, tuning)
  return Math.hypot(run.kart.vx, run.kart.vz)
}

const standard = applyKart(KART_TUNING, 'tide')
const heavy = applyKart(KART_TUNING, 'whale')
const light = applyKart(KART_TUNING, 'heron')

describe('a kart’s weight on a slope', () => {
  it('only a kart of another weight carries its mass in its tuning', () => {
    expect(standard.mass).toBeUndefined()
    expect(heavy.mass).toBeCloseTo(kartMass('whale'), 9)
    expect(light.mass).toBeCloseTo(kartMass('heron'), 9)
    expect(heavy.mass!).toBeGreaterThan(1)
    expect(light.mass!).toBeLessThan(1)
  })

  it('is nothing for the standard weight, and nothing on a gentle slope', () => {
    expect(slopeWeight(standard, 0.12)).toBe(0)
    expect(slopeWeight(heavy, TERRAIN_TUNING.slopeMassGrade * 0.9)).toBe(0)
    expect(slopeWeight(heavy, -TERRAIN_TUNING.slopeMassGrade * 0.9)).toBe(0)
  })

  it('a heavy kart loses top speed on a steep climb and gains on a steep descent; a light one the other way', () => {
    expect(slopeWeight(heavy, 0.1)).toBeGreaterThan(0)
    expect(slopeWeight(heavy, -0.1)).toBeLessThan(0)
    expect(slopeWeight(light, 0.1)).toBeLessThan(0)
    expect(slopeWeight(light, -0.1)).toBeGreaterThan(0)
    // Held to slopeMassMax, however steep
    expect(Math.abs(slopeWeight({ mass: 0.5 }, 1))).toBeCloseTo(TERRAIN_TUNING.slopeMassMax, 9)
  })

  it('up a steep climb the light kart is quicker than the heavy one; down a steep descent the heavy one is', () => {
    const up = course(testTerrain(0.1))
    const down = course(testTerrain(-0.1))
    // The same engine for both, so that only the weight differs
    const as = (mass: number): KartTuning => ({ ...standard, mass })
    expect(speedAfter(up, as(0.85))).toBeGreaterThan(speedAfter(up, as(1.15)) + 1)
    expect(speedAfter(down, as(1.15))).toBeGreaterThan(speedAfter(down, as(0.85)) + 1)
  })

  it('on flat ground the weight changes nothing', () => {
    const flat = course(testTerrain(0))
    expect(speedAfter(flat, { ...standard, mass: 1.15 })).toBe(speedAfter(flat, standard))
  })
})
