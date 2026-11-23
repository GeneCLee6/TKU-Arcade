import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Mesh, Vector3, type Object3D } from 'three'
import { DRIVER_IDS } from '../../shared/kart/karts.ts'
import { buildKartModel } from '../../src/kart/art/kartModel.ts'
import { SHOWPIECE_SECONDS } from '../../src/kart/driverGestures.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.96; #177 measured only where the hands go): each driver's own
// win, played through on the real model, the arms kept out of the helmet. Each arm as three capsules
// (the upper arm, the forearm, the glove), every vertex of the helmet (what hangs from the head and
// does not swing: shell, visor, crest, the thing of their own) tested against them at every 30th of a
// second. Standing, in the race room on Ready: no more than a touch (the kiss at the visor's chin,
// the finger pushing the visor up). Seated, at the finish and on the podium, the hands come off the
// wheel past a helmet that leans over it: a little more, never through (before 2026-11-23 the
// forearms went 4 cm into it, standing or seated).

beforeAll(() => {
  // The gestures start at a random point of their loops: one fixed point, the same every run
  vi.spyOn(Math, 'random').mockReturnValue(0.3)
})
afterAll(() => vi.restoreAllMocks())

/** The arm's radius as drawn (driverModel.ts's sleeve and glove), metres */
const UPPER_RADIUS = 0.055
const FORE_RADIUS = 0.047
const GLOVE_RADIUS = 0.035
/** The glove past the hand's joint, along the forearm */
const GLOVE_LENGTH = 0.09
/** How far into the helmet each may go, metres (a touch) */
const STANDING_MOST = 0.01
const SEATED_MOST = { arm: 0.025, glove: 0.035 }

function distanceToSegment(point: Vector3, a: Vector3, b: Vector3): number {
  const along = b.clone().sub(a)
  const share = Math.max(0, Math.min(1, point.clone().sub(a).dot(along) / along.lengthSq()))
  return point.distanceTo(a.clone().addScaledVector(along, share))
}

/** The deepest any part of either arm goes into the helmet through the win and a second after it */
function deepestInHelmet(driver: (typeof DRIVER_IDS)[number], standing: boolean) {
  const model = buildKartModel(false, false, 'tide', driver, { driver: 'high' }, { standing })
  const hands: Object3D[] = []
  model.group.traverse((object) => {
    if (object.userData.hand) hands.push(object)
  })
  const elbows = hands.map((hand) => hand.parent!)
  const shoulders = elbows.map((elbow) => elbow.parent!)
  const look = { speed: 0, steer: 0, drift: 0, boosting: false }
  for (let i = 0; i < 40; i++) model.update({ ...look, ...(standing ? { gesture: 'stand' as const } : {}) }, 1 / 30)
  model.group.updateMatrixWorld(true)
  // The head: what hangs highest from the torso and is drawn (the arms are bones)
  const torso = shoulders[0]!.parent!
  let head: Object3D | null = null
  let highest = -Infinity
  for (const child of torso.children) {
    if ((child as { isBone?: boolean }).isBone) continue
    let meshes = 0
    child.traverse((object) => {
      if (object instanceof Mesh) meshes++
    })
    const y = child.getWorldPosition(new Vector3()).y
    if (meshes > 0 && y > highest) {
      highest = y
      head = child
    }
  }
  const helmet: Mesh[] = []
  head!.traverse((object) => {
    if (object instanceof Mesh && object.parent === head) helmet.push(object)
  })
  const deepest = { arm: -Infinity, glove: -Infinity, at: 0 }
  const vertex = new Vector3()
  for (let step = 0; step <= (SHOWPIECE_SECONDS + 1) * 30; step++) {
    model.update({ ...look, gesture: 'cheer' }, 1 / 30)
    model.group.updateMatrixWorld(true)
    const capsules = [0, 1].flatMap((side) => {
      const shoulder = shoulders[side]!.getWorldPosition(new Vector3())
      const elbow = elbows[side]!.getWorldPosition(new Vector3())
      const hand = hands[side]!.getWorldPosition(new Vector3())
      const tip = hand.clone().add(hand.clone().sub(elbow).normalize().multiplyScalar(GLOVE_LENGTH))
      // The upper arm from a third of the way down (at the shoulder it is in the torso, not the helmet)
      return [
        { kind: 'arm' as const, a: shoulder.lerp(elbow, 0.3), b: elbow, radius: UPPER_RADIUS },
        { kind: 'arm' as const, a: elbow, b: hand, radius: FORE_RADIUS },
        { kind: 'glove' as const, a: hand, b: tip, radius: GLOVE_RADIUS },
      ]
    })
    for (const mesh of helmet) {
      const position = mesh.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        for (const { kind, a, b, radius } of capsules) {
          const into = radius - distanceToSegment(vertex, a, b)
          if (into > deepest[kind]) {
            deepest[kind] = into
            deepest.at = step / 30
          }
        }
      }
    }
  }
  model.dispose()
  return deepest
}

describe("each driver's win keeps the arms out of the helmet", () => {
  for (const driver of DRIVER_IDS) {
    it(`${driver}, standing in the race room`, () => {
      const { arm, glove, at } = deepestInHelmet(driver, true)
      expect({ driver, at, arm: arm <= STANDING_MOST, glove: glove <= STANDING_MOST }).toEqual({
        driver,
        at,
        arm: true,
        glove: true,
      })
    }, 60_000)

    it(`${driver}, seated at the finish`, () => {
      const { arm, glove, at } = deepestInHelmet(driver, false)
      expect({ driver, at, arm: arm <= SEATED_MOST.arm, glove: glove <= SEATED_MOST.glove }).toEqual({
        driver,
        at,
        arm: true,
        glove: true,
      })
    }, 60_000)
  }
})
