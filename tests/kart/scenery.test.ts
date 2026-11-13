import { describe, expect, it } from 'vitest'
import { roadClearance, roadDistances, scatter } from '../../shared/kart/scenery.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'

// e8-t05b: scenery goes only where the track leaves room, the same every time

describe('scenery placement', () => {
  const box = { minX: -200, maxX: 400, minZ: -400, maxZ: 400 }

  it('measures how far off the road a place is', () => {
    const start = RIVERSIDE.road[0]!
    expect(roadClearance(RIVERSIDE.road, start.x, start.z)).toBeCloseTo(-start.width / 2, 0)
    expect(roadClearance(RIVERSIDE.road, start.x - start.width / 2 - 5, start.z)).toBeCloseTo(5, 0)
  })

  it('keeps every tree clear of the road and of each other, and seeds the same forest', () => {
    const options = { seed: 7, count: 200, box, clearance: 7, spacing: 4.5 }
    const trees = scatter(RIVERSIDE.road, options)
    expect(trees.length).toBeGreaterThan(150)
    for (const tree of trees)
      expect(roadClearance(RIVERSIDE.road, tree.x, tree.z)).toBeGreaterThanOrEqual(7)
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        expect(
          Math.hypot(trees[i]!.x - trees[j]!.x, trees[i]!.z - trees[j]!.z),
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(scatter(RIVERSIDE.road, options)).toEqual(trees)
  })

  it('gives fewer rather than hanging when there is no room', () => {
    const tiny = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }
    expect(
      scatter(RIVERSIDE.road, { seed: 1, count: 50, box: tiny, clearance: 7, spacing: 4 }),
    ).toEqual([])
  })

  it('measures the loop', () => {
    const { along, length } = roadDistances(RIVERSIDE.road)
    expect(along[0]).toBe(0)
    expect(length).toBeGreaterThan(1000)
  })
})
