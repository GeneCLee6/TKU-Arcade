// 2026-11-20 (docs/KART-WORLD.md §6): the dressing of the three tracks to learn by heart. Only draws:
// the walls are found where the physics has them, every slot the guides drive through is found
// among them and lit, and nothing of the yards, the quay or the lanes' houses stands on a road.
import { describe, expect, it } from 'vitest'
import { lanesPlan } from '../../src/kart/art/lanesArt.ts'
import { findSlots, skillStyleOf, wallRuns } from '../../src/kart/art/skillWalls.ts'
import { insideFootprint } from '../../src/kart/art/skillKit.ts'
import { wharfPlan } from '../../src/kart/art/wharfArt.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { acrossRoad } from '../../shared/kart/tracks/guide.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'

const flat = () => 0

describe('the walls of the tracks to learn by heart', () => {
  it('are dressed on those three tracks only', () => {
    expect(['wharf', 'lanes', 'works'].map(skillStyleOf)).toEqual(['wharf', 'lanes', 'works'])
    expect(skillStyleOf('oldstreet')).toBeNull()
    expect(skillStyleOf('custom-1')).toBeNull()
  })

  it.each(['wharf', 'lanes'] as const)('%s: every slot of the guide is found between two walls', (id) => {
    const track = raceTrack(id)!
    const guide = trackGuide(id)!
    const runs = wallRuns(track.walls, flat)
    // Every wall with a top is drawn, none twice
    expect(runs).toHaveLength(track.walls.filter((wall) => wall.top !== undefined).length)
    const slots = findSlots(runs)
    expect(slots).toHaveLength(guide.slots.length)
    for (const slot of guide.slots) {
      const middle = acrossRoad(track.road, slot.index, slot.across)
      const found = slots.some((one) => Math.hypot(one.x - middle.x, one.z - middle.z) < 1)
      expect(found, `slot at road ${slot.index}`).toBe(true)
    }
    // The fences a flier clears are told apart from the tall walls
    expect(runs.filter((run) => run.fence).length).toBeGreaterThanOrEqual(1)
  })

  it('the works: the alley’s slot, between its two walls', () => {
    const track = raceTrack('works')!
    const slots = findSlots(wallRuns(track.walls, flat))
    expect(slots).toHaveLength(1)
    expect(slots[0]!.width).toBeGreaterThan(8)
    expect(slots[0]!.width).toBeLessThan(11)
  })
})

describe('the wharf’s yard', () => {
  const track = raceTrack('wharf')!
  const plan = wharfPlan(track, 1)

  it('puts the big shed in the hairpin the lane runs behind, clear of both roads', () => {
    expect(plan.shed).not.toBeNull()
    const shed = plan.shed!
    expect(shed.along).toBeGreaterThan(40)
    for (const [a, b] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
      [0, 0],
    ] as const) {
      const c = Math.cos(shed.turn)
      const s = Math.sin(shed.turn)
      const x = shed.x + c * a * shed.along + s * b * shed.across
      const z = shed.z - s * a * shed.along + c * b * shed.across
      expect(roadClearance(track.road, x, z)).toBeGreaterThan(4)
    }
  })

  it('stands no warehouse or stack on a road, and the sea beyond every road', () => {
    for (const one of plan.warehouses) {
      expect(roadClearance(track.road, one.x, one.z)).toBeGreaterThan(one.along / 2)
    }
    for (const stack of plan.stacks) expect(roadClearance(track.road, stack.x, stack.z)).toBeGreaterThan(6)
    for (const point of track.road) expect(point.x + point.width / 2).toBeLessThan(plan.seaX - 30)
    // No tree in a shed
    if (plan.shed) expect(plan.fits(plan.shed.x, plan.shed.z)).toBe(false)
    expect(insideFootprint(plan.shed!, plan.shed!.x, plan.shed!.z, 0)).toBe(true)
  })
})

describe('the hillside lanes', () => {
  const track = raceTrack('lanes')!
  const plan = lanesPlan(track, 1, wallRuns(track.walls, flat))

  it('finds the well in the hollow of the last hairpin, and builds no house on a road', () => {
    expect(plan.well).not.toBeNull()
    expect(roadClearance(track.road, plan.well!.x, plan.well!.z)).toBeGreaterThan(4)
    expect(plan.houses.length).toBeGreaterThan(10)
    for (const house of plan.houses) {
      expect(roadClearance(track.road, house.x, house.z)).toBeGreaterThan(Math.max(house.along, house.across) / 2)
    }
  })
})
