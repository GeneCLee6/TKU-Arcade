import { describe, expect, it } from 'vitest'
import { DRIVER_IDS, DRIVER_NUMBERS } from '../../shared/kart/karts.ts'
import { hull, wedge } from '../../src/kart/art/kartParts.ts'

// 2026-11-18 (the esports look): the karts and the drivers are cut from flat faces by `hull`. A
// face wound the wrong way is not drawn at all (the first build showed the karts' insides), which
// no other test would notice: the models need WebGL.
describe('hull', () => {
  const geometry = hull([
    { z: -1, w: 0.1, top: 0.05, bottom: 0.05 },
    { z: 0, w: 0.4, top: 0.3, bottom: 0.1, y: 0.05 },
    { z: 1, w: 0.2, top: 0.15, bottom: 0.08 },
  ])
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')

  it('is flat faces: two sections apart make sixteen triangles, each end six', () => {
    expect(position.count).toBe((2 * 16 + 2 * 6) * 3)
    expect(geometry.index).toBeNull()
    for (let corner = 0; corner < position.count; corner += 3) {
      for (const other of [corner + 1, corner + 2]) {
        expect(normal.getX(other)).toBeCloseTo(normal.getX(corner), 5)
        expect(normal.getY(other)).toBeCloseTo(normal.getY(corner), 5)
        expect(normal.getZ(other)).toBeCloseTo(normal.getZ(corner), 5)
      }
    }
  })

  it('faces outwards: every face looks away from the middle of the hull', () => {
    for (let corner = 0; corner < position.count; corner += 3) {
      let x = 0
      let y = 0
      let z = 0
      for (const at of [corner, corner + 1, corner + 2]) {
        x += position.getX(at) / 3
        y += position.getY(at) / 3
        z += position.getZ(at) / 3
      }
      // From a point on the hull's axis to the face's middle
      const away = x * normal.getX(corner) + (y - 0.05) * normal.getY(corner) + z * 0.2 * normal.getZ(corner)
      expect(away).toBeGreaterThan(0)
    }
  })

  it('has texture coordinates, for the carbon weave', () => {
    expect(geometry.getAttribute('uv').count).toBe(position.count)
  })
})

describe('wedge', () => {
  it('rises from its front to its back, its underside on the floor', () => {
    const geometry = wedge(0.4, 1, 0.02, 0.3)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.min.y).toBeCloseTo(0, 5)
    expect(box.max.y).toBeCloseTo(0.3, 5)
    expect(box.max.x - box.min.x).toBeCloseTo(0.4, 5)
    expect(box.max.z - box.min.z).toBeCloseTo(1, 5)
  })
})

describe('the drivers’ racing numbers', () => {
  it('gives each driver a number of their own, two digits', () => {
    const numbers = DRIVER_IDS.map((id) => DRIVER_NUMBERS[id])
    expect(new Set(numbers).size).toBe(DRIVER_IDS.length)
    for (const number of numbers) expect(number).toMatch(/^\d{2}$/)
  })
})
