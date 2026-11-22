import { describe, expect, it } from 'vitest'
import { Mesh, MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, Texture } from 'three'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { trackBounds } from '../../shared/kart/track.ts'
import {
  GUANYIN_CLEAR,
  guanyinFits,
  guanyinPlan,
  PAVILION_REACH,
  ridgeHeight,
  TEMPLE_REACH,
} from '../../src/kart/art/guanyinArt.ts'
import { buildWater, waterDepths, type WaterOptions } from '../../src/kart/art/seaWater.ts'
import { QUALITY } from '../../src/kart/quality.ts'

// 2026-11-22 (#94, #115; docs/ARCHITECTURE.md §4.67): Guanyin Hill Road's landmarks and the real water

const guanyin = raceTrack('guanyin')!

describe("Guanyin Hill Road's landmarks", () => {
  const plan = guanyinPlan(guanyin)

  it('stand off every road: the pavilion by the hilltop, the temple by the start straight', () => {
    expect(roadClearance(guanyin.road, plan.pavilion.x, plan.pavilion.z)).toBeGreaterThanOrEqual(GUANYIN_CLEAR + PAVILION_REACH)
    expect(roadClearance(guanyin.road, plan.temple.x, plan.temple.z)).toBeGreaterThanOrEqual(GUANYIN_CLEAR + TEMPLE_REACH)
    // The pavilion near the road's highest point, the temple near the line
    let top = 0
    guanyin.road.forEach((point, index) => {
      if ((point.y ?? 0) > (guanyin.road[top]!.y ?? 0)) top = index
    })
    const hilltop = guanyin.road[top]!
    expect(Math.hypot(plan.pavilion.x - hilltop.x, plan.pavilion.z - hilltop.z)).toBeLessThan(80)
    const line = guanyin.road[0]!
    expect(Math.hypot(plan.temple.x - line.x, plan.temple.z - line.z)).toBeLessThan(120)
  })

  it('the ridge stands beyond the road to the north, highest at one peak; the river and its pier to the east', () => {
    const box = trackBounds(guanyin)
    expect(plan.ridge.z + plan.ridge.depth * 0.4).toBeLessThan(box.minZ - 200)
    const heights = Array.from({ length: 101 }, (_, k) => ridgeHeight(k / 100))
    const peak = heights.indexOf(Math.max(...heights))
    expect(peak).toBeGreaterThan(20)
    expect(peak).toBeLessThan(40)
    expect(Math.max(...heights)).toBeGreaterThan(150)
    expect(plan.riverX).toBeGreaterThan(box.maxX + 100)
    expect(plan.pier.x).toBe(plan.riverX)
  })

  it('keep the shared scenery out of the river and off the pavilion and the temple', () => {
    expect(guanyinFits(plan, plan.riverX + 50, 0)).toBe(false)
    expect(guanyinFits(plan, plan.pavilion.x, plan.pavilion.z)).toBe(false)
    expect(guanyinFits(plan, plan.temple.x + 3, plan.temple.z)).toBe(false)
    expect(guanyinFits(plan, plan.box.minX - 60, plan.box.minZ - 60)).toBe(true)
  })
})

const flat = new Texture()
const kit = {
  keep: <T,>(geometry: T) => geometry,
  own: <T,>(material: T) => material,
  ownTexture: <T,>(texture: T) => texture,
}
const options: WaterOptions = {
  x: 0,
  z: 0,
  width: 400,
  depth: 200,
  y: -1,
  depthAt: (x) => Math.max(0, Math.min(1, (x + 200) / 100)),
  deep: '#103050',
  shallow: '#3a9a90',
  foam: '#f0f4f0',
  sky: '#cfe6f5',
  flatMap: flat,
}

describe('the water', () => {
  it('on the low picture is the flat textured plane, as it always was', () => {
    const water = buildWater(kit, options, 0)
    expect(water.mesh).toBeInstanceOf(Mesh)
    expect(water.mesh.material).toBeInstanceOf(MeshLambertMaterial)
    expect((water.mesh.geometry as PlaneGeometry).parameters.widthSegments).toBe(1)
  })

  it('on medium is lit with moving swells, and on high its surface lifts too', () => {
    const medium = buildWater(kit, options, 1)
    expect(medium.mesh.material).toBeInstanceOf(MeshStandardMaterial)
    expect((medium.mesh.geometry as PlaneGeometry).parameters.widthSegments).toBe(1)
    const high = buildWater(kit, options, 2)
    expect((high.mesh.geometry as PlaneGeometry).parameters.widthSegments).toBeGreaterThan(20)
    medium.update(12)
  })

  it('knows the shallows: 0 at the shore, the full depth out at sea', () => {
    const depths = waterDepths(options, 16)
    // West edge (x = -200) is the shore, east is open water: shallow first, deepening, then deep
    expect(depths[0]).toBeLessThan(40)
    for (let i = 1; i < 16; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]!)
    expect(depths[15]).toBe(255)
  })

  it('each picture quality says how much water it draws', () => {
    expect([QUALITY.low.water, QUALITY.medium.water, QUALITY.high.water]).toEqual([0, 1, 2])
  })
})
