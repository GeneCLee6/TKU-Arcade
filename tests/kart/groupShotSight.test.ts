import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Spot } from '../../shared/kart/course.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import { groundAt, terrainOf } from '../../shared/kart/terrain.ts'
import { ALL_RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import { buildTrackArt } from '../../src/kart/art/trackArt.ts'
import { loadTrackFeatures } from '../../src/kart/art/trackFeatures.ts'
import { loadTrackScenery } from '../../src/kart/art/trackScenery.ts'
import { createSightTest } from '../../src/kart/art/sightLine.ts'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import {
  GROUP_ANGLES,
  groupHalfAngle,
  groupShot,
  groupShotHidden,
  pickGroupAngle,
  type GroupAngle,
} from '../../src/kart/director.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.97; #176's known limit): the group shot before the start must
// see every driver. Every track (reversed ones too) is built as it is drawn, in Node, and the line
// from the camera to each kart's head and body tested against it, all through the push-in, on a wide
// screen, a phone on its side and one held upright. Where the shot from in front is blocked the
// opening takes another angle (director.ts's pickGroupAngle), and that one must see every kart.

const SCREENS = [16 / 9, 844 / 390, 390 / 844]
const FULL_GRID = 8

beforeAll(() => {
  // jsdom draws no canvas: the textures come out blank, which is all this needs
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterAll(() => vi.restoreAllMocks())

describe('the sight test', () => {
  it('sees through open air and see-through things, not through a wall, either way along', () => {
    const root = new Group()
    const wall = new Mesh(new BoxGeometry(1, 4, 10), new MeshBasicMaterial())
    wall.position.set(5, 2, 0)
    const glass = new Mesh(new BoxGeometry(1, 4, 10), new MeshBasicMaterial({ transparent: true, opacity: 0.3 }))
    glass.position.set(-5, 2, 0)
    root.add(wall, glass)
    const blocked = createSightTest(root)
    expect(blocked({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 })).toBe(true)
    expect(blocked({ x: 10, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(true)
    // Over the wall
    expect(blocked({ x: 0, y: 9, z: 0 }, { x: 10, y: 9, z: 0 })).toBe(false)
    // Through the glass
    expect(blocked({ x: 0, y: 1, z: 0 }, { x: -10, y: 1, z: 0 })).toBe(false)
    // A wall right under the far end (the road under a kart) does not count
    expect(blocked({ x: 0, y: 1, z: 0 }, { x: 5.4, y: 1, z: 0 })).toBe(false)
  })

  it('takes the next angle when the front one is blocked, and the fewest hidden when all are', () => {
    const spots: Spot[] = [
      { x: -2, z: 0, heading: 0 },
      { x: 2, z: 0, heading: 0 },
    ]
    // Something in front of the grid (heading 0 faces -z): the camera there sees nothing
    const front = groupShot(spots, 0, 0, false, undefined, 'front')!
    expect(front.eye.z).toBeLessThan(-5)
    const blockedFront = (from: { z: number }) => from.z < -3
    expect(groupShotHidden(spots, 'front', blockedFront)).toBe(2)
    const picked = pickGroupAngle(spots, blockedFront)
    expect(picked).not.toBe('front')
    expect(groupShotHidden(spots, picked, blockedFront)).toBe(0)
    // Nothing clear anywhere: the first with the fewest hidden; nothing to test against: in front
    expect(pickGroupAngle(spots, () => true)).toBe(GROUP_ANGLES[0])
    expect(pickGroupAngle(spots, null)).toBe('front')
    expect(pickGroupAngle(spots, () => false)).toBe('front')
  })
})

/** The grid of `count` and its road's height at the pole, as the race has them */
function gridOf(track: Track, count: number): { spots: Spot[]; y: number } {
  const spots = Array.from({ length: count }, (_, slot) => gridSpot(track, slot))
  const terrain = terrainOf(track)
  const y = terrain ? groundAt(terrain, spots[0]!.x, spots[0]!.z).y : 0
  return { spots, y }
}

describe('the group shot on every track', () => {
  const chosen = new Map<string, GroupAngle[]>()
  afterAll(() => {
    // For the record (docs/ARCHITECTURE.md §4.97): where the opening stands on each track
    const moved = [...chosen].filter(([, angles]) => angles.some((angle) => angle !== 'front'))
    console.info(`group shot: ${moved.length} of ${chosen.size} tracks moved`, Object.fromEntries(moved))
  })

  for (const id of ALL_RACE_TRACK_IDS) {
    it(`sees every driver on ${id}`, async () => {
      const track = raceTrack(id) as Track
      const [scenery, features] = await Promise.all([loadTrackScenery(track), loadTrackFeatures(track)])
      const art = buildTrackArt(track, { density: 1, shadows: false, anisotropy: 1 }, scenery, features)
      try {
        const blocked = createSightTest(art.group)
        const angles: GroupAngle[] = []
        for (const count of [2, FULL_GRID]) {
          const { spots, y } = gridOf(track, count)
          for (const aspect of SCREENS) {
            const half = groupHalfAngle(aspect)
            const angle = pickGroupAngle(spots, blocked, y, half)
            angles.push(angle)
            expect({ id, count, aspect, angle, hidden: groupShotHidden(spots, angle, blocked, y, half) }).toEqual({
              id,
              count,
              aspect,
              angle,
              hidden: 0,
            })
            // Less motion asked for: one still shot, also clear
            const still = pickGroupAngle(spots, blocked, y, half, true)
            expect(groupShotHidden(spots, still, blocked, y, half, true)).toBe(0)
          }
        }
        chosen.set(id, angles)
      } finally {
        art.dispose()
      }
    }, 120_000)
  }
})
