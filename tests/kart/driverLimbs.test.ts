import { Quaternion, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  HAND_SHAPES,
  handCurl,
  HIP_X,
  jointShare,
  LEGS_AT_EASE,
  poseLeg,
  seatedLegs,
  SHIN,
  SKIN_BLEND,
  STANDING_ANKLE_Y,
  standingLegs,
  STILL_LEGS,
  THIGH,
  type LegTargets,
} from '../../src/kart/driverLimbs.ts'
import { blendPose, gesturePose, REST, type GestureStyle } from '../../src/kart/driverGestures.ts'
import { buildKartModel } from '../../src/kart/art/kartModel.ts'
import { bakeSkinned } from '../../src/kart/art/driverSkin.ts'
import { FRAME_MS, isDue, MAX_STRIDE, nextPacing, START_PACING } from '../../src/kart/lobby/lobbyPacing.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.91): the legs, the hands and the skin, as pure sums; and the
// skin and the legs put on a real model

const STYLES: readonly GestureStyle[] = ['spade', 'heart', 'diamond', 'club']

/** Forward through a leg: where its ankle and toe end up, in the driver's frame */
function legOf(targets: LegTargets, index: 0 | 1) {
  const hip = new Quaternion()
  const ankle = new Quaternion()
  const { knee } = poseLeg(targets, index, hip, ankle)
  const side = index === 0 ? -1 : 1
  const roll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), targets.pelvisRoll)
  const hipAt = new Vector3(side * HIP_X, 0, 0).applyQuaternion(roll).add(new Vector3(...targets.pelvis))
  const kneeTurn = hip.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), knee))
  const kneeAt = new Vector3(0, -THIGH, 0).applyQuaternion(hip).applyQuaternion(roll).add(hipAt)
  const ankleAt = new Vector3(0, -SHIN, 0).applyQuaternion(kneeTurn).applyQuaternion(roll).add(kneeAt)
  const toe = new Vector3(0, -0.04, -0.15)
    .normalize()
    .applyQuaternion(kneeTurn.clone().multiply(ankle))
    .applyQuaternion(roll)
  return { knee, kneeAt, ankleAt, toe }
}

describe('the legs', () => {
  it('puts the feet on the pedals seated, the knees up, the boots along the toes', () => {
    const targets = seatedLegs(STILL_LEGS)
    for (const index of [0, 1] as const) {
      const leg = legOf(targets, index)
      expect(leg.ankleAt.distanceTo(new Vector3(...targets.ankles[index]))).toBeLessThan(1e-3)
      // The knee bent and up, above both the hip and the ankle
      expect(leg.knee).toBeGreaterThan(0.3)
      expect(leg.kneeAt.y).toBeGreaterThan(targets.pelvis[1])
      expect(leg.toe.dot(new Vector3(...targets.toes[index]).normalize())).toBeGreaterThan(0.999)
    }
  })

  it('presses the right foot with the throttle and the left with the brake, toes down', () => {
    const rest = seatedLegs(STILL_LEGS)
    const gas = seatedLegs({ ...STILL_LEGS, pedal: 1 })
    const brake = seatedLegs({ ...STILL_LEGS, brake: 1 })
    expect(gas.ankles[1][2]).toBeLessThan(rest.ankles[1][2] - 0.02)
    expect(gas.ankles[0]).toEqual(rest.ankles[0])
    expect(gas.toes[1][1]).toBeLessThan(rest.toes[1][1])
    expect(brake.ankles[0][2]).toBeLessThan(rest.ankles[0][2] - 0.02)
    expect(brake.ankles[1]).toEqual(rest.ankles[1])
  })

  it('swings the knees out of a turn and presses the pelvis down on a landing', () => {
    const right = seatedLegs({ ...STILL_LEGS, steer: 1 })
    const rest = seatedLegs(STILL_LEGS)
    for (const index of [0, 1] as const) expect(right.knees[index][0]).toBeLessThan(rest.knees[index][0])
    const landed = seatedLegs({ ...STILL_LEGS, squash: 1 })
    expect(landed.pelvis[1]).toBeLessThan(rest.pelvis[1] - 0.02)
    // The knees come up as the pelvis goes down, the feet where they were
    expect(legOf(landed, 1).knee).toBeGreaterThan(legOf(rest, 1).knee)
  })

  it('standing, keeps both feet on the ground whichever foot the weight is on', () => {
    for (const shift of [-0.05, -0.02, 0, 0.03, 0.05]) {
      const targets = standingLegs({ ...LEGS_AT_EASE, hipShift: shift })
      for (const index of [0, 1] as const) {
        const leg = legOf(targets, index)
        expect(leg.ankleAt.y).toBeCloseTo(STANDING_ANKLE_Y, 3)
        expect(leg.ankleAt.distanceTo(new Vector3(...targets.ankles[index]))).toBeLessThan(1e-3)
      }
      // The free hip drops (the pelvis rolls towards the foot without the weight)
      if (shift !== 0) expect(Math.sign(targets.pelvisRoll)).toBe(Math.sign(shift))
    }
  })

  it('takes a small bounce in the knees and leaves the ground for a jump', () => {
    const soft = standingLegs({ ...LEGS_AT_EASE, bounce: 0.01 })
    expect(soft.ankles[0][1]).toBe(STANDING_ANKLE_Y)
    const jump = standingLegs({ ...LEGS_AT_EASE, bounce: 0.12 })
    expect(jump.ankles[0][1]).toBeGreaterThan(STANDING_ANKLE_Y + 0.05)
    expect(jump.pelvis[1]).toBeGreaterThan(soft.pelvis[1] + 0.05)
  })
})

describe('the standing gestures', () => {
  it('changes feet now and then while standing, each driver at their own pace', () => {
    for (const style of STYLES) {
      const shifts = Array.from({ length: 200 }, (_, i) => gesturePose('stand', i * 0.1, 0.3, style).hipShift)
      expect(Math.max(...shifts)).toBeGreaterThan(0.015)
      expect(Math.min(...shifts)).toBeLessThan(-0.015)
      // At ease: the hands relaxed, off any wheel
      expect(gesturePose('stand', 1, 0.3, style).rightHand).toBeDefined()
    }
  })

  it('gets ready on the balls of the feet with a thumb up', () => {
    const ready = gesturePose('ready', 1.2, 0.2)
    expect(ready.rightHand).toBe('thumb')
    expect(ready.bounce).toBeGreaterThan(0.01)
    expect(ready.rightUp).toBeGreaterThan(0.8)
  })

  it('wins with the legs too: a step, a jump, a kick back, a wide stance', () => {
    const at = (style: GestureStyle) => gesturePose('cheer', 1.1, 0, style)
    expect(at('spade').leftStep).toBeGreaterThan(0.1)
    const heart = Array.from({ length: 30 }, (_, i) => gesturePose('cheer', 0.5 + i * 0.05, 0, 'heart').bounce)
    expect(Math.max(...heart)).toBeGreaterThan(0.06)
    expect(at('diamond').rightLift).toBeGreaterThan(0.05)
    expect(at('club').stance).toBeGreaterThan(0.08)
    expect(at('club').rightHand).toBe('fist')
    expect(at('spade').leftHand).toBe('point')
    expect(gesturePose('wave', 0.4).rightHand).toBe('open')
  })

  it('shows a hand shape as soon as it is asked, the joints easing', () => {
    const half = blendPose(REST, gesturePose('ready', 2), 0.1)
    expect(half.rightHand).toBe('thumb')
    expect(half.rightUp).toBeLessThan(gesturePose('ready', 2).rightUp)
  })
})

describe('the hands', () => {
  it('has seven shapes, each its own', () => {
    const prints = new Set(HAND_SHAPES.map((shape) => JSON.stringify(handCurl(shape))))
    expect(prints.size).toBe(HAND_SHAPES.length)
  })

  it('curls round the grip, closes a fist, opens, points, shows a thumb and a V', () => {
    const sum = (shape: (typeof HAND_SHAPES)[number]) => handCurl(shape).fingers.reduce((a, b) => a + b, 0)
    expect(sum('fist')).toBe(4)
    expect(sum('open')).toBeLessThan(0.3)
    expect(sum('grip')).toBeGreaterThan(2.5)
    expect(sum('grip')).toBeLessThan(sum('fist'))
    expect(handCurl('point').fingers).toEqual([0, 1, 1, 1])
    expect(handCurl('vee').fingers.slice(0, 2)).toEqual([0, 0])
    // The thumb up points across the hand, out past the index finger; a fist's tucked into the palm
    expect(handCurl('thumb').thumb[0]).toBeGreaterThan(0.9)
    expect(handCurl('fist').thumb[2]).toBeLessThan(0)
  })
})

describe('the skin', () => {
  it('goes over from one bone to the next smoothly across the joint', () => {
    expect(jointShare(-0.1, 0.3)).toBe(0)
    expect(jointShare(-0.3, 0.3)).toBeCloseTo(0.5)
    expect(jointShare(-0.3 - SKIN_BLEND, 0.3)).toBe(1)
    let last = 0
    for (let y = -0.2; y > -0.4; y -= 0.005) {
      const share = jointShare(y, 0.3)
      expect(share).toBeGreaterThanOrEqual(last)
      // No step: a few millimetres down the limb moves it only a little
      expect(share - last).toBeLessThan(0.2)
      last = share
    }
  })

  it('draws the limbs as skin on the full kit, its weights whole, fewer draws than the joints', () => {
    const model = buildKartModel(false, false, 'tide', 'heart')
    const skins: SkinnedMesh[] = []
    model.group.traverse((object) => {
      if (object instanceof SkinnedMesh) skins.push(object)
    })
    // Every paint of the four limbs in one mesh
    expect(skins.length).toBeGreaterThanOrEqual(1)
    expect(skins.length).toBeLessThanOrEqual(2)
    for (const skin of skins) {
      const weights = skin.geometry.getAttribute('skinWeight')
      for (let i = 0; i < weights.count; i += 7) {
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1)
      }
    }
    const low = buildKartModel(false, false, 'tide', 'heart', { driver: 'low' })
    let lowSkins = 0
    low.group.traverse((object) => {
      if (object instanceof SkinnedMesh) lowSkins++
    })
    expect(lowSkins).toBe(0)
    model.dispose()
    low.dispose()
  })

  it('keeps a bent sleeve in one piece: the skin near the hand where the hand is', () => {
    const model = buildKartModel(false, false, 'comet', 'club')
    for (let i = 0; i < 90; i++) model.update({ speed: 0, steer: 0, drift: 0, boosting: false, gesture: 'cheer' }, 1 / 60)
    model.group.updateMatrixWorld(true)
    const hands: Vector3[] = []
    model.group.traverse((object) => {
      if (object.userData.hand) hands.push(object.getWorldPosition(new Vector3()))
    })
    let skin: SkinnedMesh | null = null
    model.group.traverse((object) => {
      if (object instanceof SkinnedMesh && !skin) skin = object
    })
    const baked = bakeSkinned(skin!)
    baked.applyMatrix4(skin!.matrixWorld)
    const position = baked.getAttribute('position')
    const vertex = new Vector3()
    for (const hand of hands) {
      let nearest = Infinity
      for (let i = 0; i < position.count; i++) nearest = Math.min(nearest, vertex.fromBufferAttribute(position, i).distanceTo(hand))
      // The glove's cuff and the sleeve's end are at the hand's joint, raised with it
      expect(nearest).toBeLessThan(0.05)
    }
    model.dispose()
  })
})

describe('a standing driver on a real model', () => {
  // Each model's gestures start at a random point of their loop (kartModel.ts gestureSeed): checked
  // at several, the sole within a centimetre of the ground (2026-11-23: one fixed 5 mm was flaky)
  it.each([0, 0.25, 0.5, 0.75, 0.99])('keeps the soles on the ground standing, through a change of feet (seed %s)', (seed) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(seed)
    const model = buildKartModel(false, false, 'tide', 'spade', {}, { standing: true })
    random.mockRestore()
    const ankles = () => {
      model.group.updateMatrixWorld(true)
      const found: number[] = []
      model.group.traverse((object) => {
        if (object.userData.ankle) {
          found.push(object.getWorldPosition(new Vector3()).y)
        }
      })
      return found
    }
    for (let i = 0; i < 120; i++) model.update({ speed: 0, steer: 0, drift: 0, boosting: false, gesture: 'stand' }, 1 / 30)
    const standing = ankles()
    expect(standing).toHaveLength(2)
    // The ankle 8 cm over the ground (the sole under it)
    for (const y of standing) expect(Math.abs(y - 0.08)).toBeLessThan(0.01)
    model.dispose()
  })

  it('presses the right foot forward with the throttle, seated', () => {
    const model = buildKartModel(false, false, 'tide', 'diamond')
    const ankle = () => {
      model.group.updateMatrixWorld(true)
      const found: Vector3[] = []
      model.group.traverse((object) => {
        if (object.userData.ankle) found.push(object.getWorldPosition(new Vector3()))
      })
      return found[1]!
    }
    for (let i = 0; i < 40; i++) model.update({ speed: 10, steer: 0, drift: 0, boosting: false, throttle: 0 }, 1 / 60)
    const off = ankle()
    for (let i = 0; i < 40; i++) model.update({ speed: 10, steer: 0, drift: 0, boosting: false, throttle: 1 }, 1 / 60)
    expect(ankle().z).toBeLessThan(off.z - 0.015)
    model.dispose()
  })
})

describe("the race room's pacing on a phone", () => {
  it('draws at most 18 frames a second', () => {
    expect(1000 / FRAME_MS.slow).toBeLessThanOrEqual(18.01)
    expect(1000 / FRAME_MS.fast).toBeLessThanOrEqual(31)
  })

  it('draws the busy pictures every frame and the quiet ones in turn', () => {
    const frames = Array.from({ length: 12 }, (_, frame) => frame)
    expect(frames.every((frame) => isDue(frame, 8, true, 3))).toBe(true)
    for (const slot of [0, 1, 2, 3]) {
      const due = frames.filter((frame) => isDue(frame, slot, false, 2)).length
      expect(due).toBe(6)
    }
  })

  it('draws the quiet pictures less often while the phone cannot keep up, and more again once it can', () => {
    let pacing = START_PACING
    for (let i = 0; i < 200; i++) pacing = nextPacing(pacing, 20)
    expect(pacing.stride).toBe(MAX_STRIDE)
    for (let i = 0; i < 400; i++) pacing = nextPacing(pacing, 2)
    expect(pacing.stride).toBe(2)
  })
})
