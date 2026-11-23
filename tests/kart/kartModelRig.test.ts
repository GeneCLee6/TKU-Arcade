import { Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildKartModel } from '../../src/kart/art/kartModel.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.85): the skeleton put on a real kart model: the hands stay on
// the wheel as it turns, a low quality's driver is merged and still, the nose's vanes turn

const LOOK = { speed: 20, steer: 0, drift: 0, boosting: false }

/** The world position of the end of each forearm (the hand joint) */
function hands(model: ReturnType<typeof buildKartModel>): Vector3[] {
  model.group.updateMatrixWorld(true)
  const found: Vector3[] = []
  model.group.traverse((object) => {
    if (object.userData.hand) found.push(object.getWorldPosition(new Vector3()))
  })
  return found
}

describe('a kart model with the skeleton', () => {
  it('keeps both hands on the wheel as it turns, the right one dropping into a right turn', () => {
    const model = buildKartModel(false, false, 'tide', 'spade')
    for (let i = 0; i < 60; i++) model.update(LOOK, 1 / 60)
    const [left0, right0] = hands(model)
    expect(left0).toBeDefined()
    expect(right0!.distanceTo(left0!)).toBeGreaterThan(0.2)
    for (let i = 0; i < 90; i++) model.update({ ...LOOK, steer: 1 }, 1 / 60)
    const [left1, right1] = hands(model)
    expect(right1!.y).toBeLessThan(right0!.y - 0.04)
    expect(left1!.y).toBeGreaterThan(left0!.y + 0.04)
    // Still the wheel's width apart: on it, not left behind
    expect(right1!.distanceTo(left1!)).toBeCloseTo(right0!.distanceTo(left0!), 1)
    model.dispose()
  })

  it('raises the arms off the wheel for a win', () => {
    const model = buildKartModel(false, false, 'comet', 'club')
    for (let i = 0; i < 30; i++) model.update(LOOK, 1 / 60)
    const resting = hands(model)
    for (let i = 0; i < 90; i++) model.update({ ...LOOK, gesture: 'cheer' }, 1 / 60)
    const cheering = hands(model)
    for (const [index, hand] of cheering.entries()) expect(hand.y).toBeGreaterThan(resting[index]!.y + 0.15)
    model.dispose()
  })

  it('merges a low quality driver into a few meshes that never move, with no vanes', () => {
    const full = buildKartModel(false, false, 'tide', 'heart', {}, {})
    const low = buildKartModel(false, false, 'tide', 'heart', { driver: 'low' }, {})
    const count = (model: ReturnType<typeof buildKartModel>) => {
      let meshes = 0
      model.group.traverse((object) => {
        if (object instanceof Mesh) meshes++
      })
      return meshes
    }
    expect(count(low)).toBeLessThan(count(full) - 6)
    expect(hands(low)).toHaveLength(0)
    full.dispose()
    low.dispose()
  })
})
