import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  COUNTER_LOCK,
  driveJoints,
  elbowBend,
  FOREARM,
  RAISED_BEND,
  reachArm,
  UPPER_ARM,
  WHEEL_LOCK,
  type DriveState,
} from '../../src/kart/driverRig.ts'
import { gesturePose, REST, type GestureStyle } from '../../src/kart/driverGestures.ts'
import {
  landingKick,
  SPRING_REST,
  springTarget,
  stepSpring,
  throttleOf,
  thrusterGlow,
  VANE_LOCK,
  vaneAngle,
} from '../../src/kart/kartMotion.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.85): the driver's skeleton and the kart's motion, as pure sums

/** Where the hand ends up for a shoulder turn and an elbow bend (the arm built hanging down -y) */
function handOf(turn: Quaternion, bend: number): Vector3 {
  const elbow = new Vector3(0, -UPPER_ARM, 0).applyQuaternion(turn)
  const forearm = new Vector3(0, -Math.cos(bend), -Math.sin(bend)).multiplyScalar(FOREARM)
  return elbow.add(forearm.applyQuaternion(turn))
}

const STILL: DriveState = { steer: 0, drift: 0, heat: 0, surge: 0, dazed: 0, sway: 0 }

describe('reaching for the wheel (two bones)', () => {
  it('puts the hand on the target, the elbow bent and out towards the pole', () => {
    const turn = new Quaternion()
    for (const target of [
      new Vector3(-0.08, -0.14, -0.46),
      new Vector3(0.1, -0.2, -0.4),
      new Vector3(0.05, -0.05, -0.5),
    ]) {
      const pole = new Vector3(1, -0.55, 0.35)
      const bend = reachArm(target, pole, turn)
      expect(bend).toBeGreaterThan(0.1)
      expect(bend).toBeLessThan(Math.PI)
      expect(handOf(turn, bend).distanceTo(target)).toBeLessThan(1e-4)
      // The elbow is on the pole's side of the line from the shoulder to the hand
      const elbow = new Vector3(0, -UPPER_ARM, 0).applyQuaternion(turn)
      const line = target.clone().normalize()
      const off = elbow.clone().addScaledVector(line, -elbow.dot(line))
      expect(off.dot(pole)).toBeGreaterThan(0)
    }
  })

  it('reaches straight for a target out of reach, and folds for one too close', () => {
    const turn = new Quaternion()
    const far = new Vector3(0, -0.2, -2)
    const bend = reachArm(far, new Vector3(1, 0, 0), turn)
    expect(bend).toBeLessThan(0.1)
    const hand = handOf(turn, bend)
    expect(hand.clone().normalize().dot(far.clone().normalize())).toBeGreaterThan(0.999)
    expect(reachArm(new Vector3(0, -0.02, -0.02), new Vector3(1, 0, 0), turn)).toBeGreaterThan(2)
  })

  it('follows the wheel: turned right, the right hand drops and the left rises', () => {
    const shoulder = (side: number) => new Vector3(side * 0.2, 0.44, 0)
    const gripAt = (side: number, wheel: number) =>
      new Vector3(side * 0.13 * Math.cos(-wheel), side * 0.13 * Math.sin(-wheel) + 0.3, -0.46)
    const turn = new Quaternion()
    for (const side of [-1, 1]) {
      const target = gripAt(side, 0.8).sub(shoulder(side))
      const bend = reachArm(target, new Vector3(side, -0.55, 0.35), turn)
      const hand = handOf(turn, bend).add(shoulder(side))
      if (side > 0) expect(hand.y).toBeLessThan(0.3 - 0.05)
      else expect(hand.y).toBeGreaterThan(0.3 + 0.05)
    }
  })
})

describe('the driving pose', () => {
  it('sits upright and looks ahead standing still', () => {
    const joints = driveJoints(STILL)
    expect(joints.torsoLean).toBe(0)
    expect(joints.headTurn).toBeCloseTo(0)
    expect(joints.wheel).toBe(0)
    expect(joints.loose).toEqual([0, 0])
  })

  it('turns the wheel, leans and looks into a right turn', () => {
    const joints = driveJoints({ ...STILL, steer: 1 })
    expect(joints.wheel).toBeCloseTo(WHEEL_LOCK)
    expect(joints.torsoLean).toBeLessThan(-0.1)
    expect(joints.headTurn).toBeLessThan(-0.2)
    // The eyes kept level a little against the lean
    expect(Math.sign(joints.headRoll)).toBe(-Math.sign(joints.torsoLean))
    expect(driveJoints({ ...STILL, steer: -1 }).wheel).toBeCloseTo(-WHEEL_LOCK)
  })

  it('in a drift, turns the shoulders and the head to the inside and holds opposite lock', () => {
    const turning = driveJoints({ ...STILL, steer: 1 })
    const drifting = driveJoints({ ...STILL, steer: 1, drift: 1 })
    expect(drifting.headTurn).toBeLessThan(turning.headTurn - 0.3)
    expect(drifting.torsoTwist).toBeLessThan(turning.torsoTwist - 0.1)
    expect(drifting.wheel).toBeCloseTo(WHEEL_LOCK - COUNTER_LOCK)
    expect(drifting.torsoLean).toBeLessThan(turning.torsoLean)
  })

  it('is thrown back with the chin up in a boost, forward braking', () => {
    const boost = driveJoints({ ...STILL, heat: 1 })
    expect(boost.torsoBack).toBeGreaterThan(0.2)
    expect(boost.headUp).toBeLessThan(0)
    expect(driveJoints({ ...STILL, surge: -0.16 }).torsoBack).toBeLessThan(0)
    // A bike's rider lies forward and is thrown back less
    const bike = driveJoints({ ...STILL, heat: 1, bike: true, crouch: -0.5 })
    expect(bike.torsoBack).toBeLessThan(0)
    expect(bike.torsoBack - -0.5).toBeLessThan(boost.torsoBack)
  })

  it('sways, lolls and loosens the hands when stunned, and moves as the sway runs', () => {
    const a = driveJoints({ ...STILL, dazed: 1, sway: 1 })
    const b = driveJoints({ ...STILL, dazed: 1, sway: 2.5 })
    expect(Math.abs(a.torsoLean)).toBeGreaterThan(0.1)
    expect(a.torsoLean).not.toBeCloseTo(b.torsoLean)
    expect(a.headRoll).not.toBeCloseTo(b.headRoll)
    expect(Math.min(...a.loose)).toBeGreaterThan(0)
  })

  it('bends the elbow as the reach needs on the wheel, and holds a raised arm nearly straight', () => {
    expect(elbowBend(1.2, 0)).toBeCloseTo(1.2)
    expect(elbowBend(1.2, 2.4)).toBeCloseTo(RAISED_BEND)
    expect(elbowBend(1.2, 2.4, 1.2)).toBeCloseTo(RAISED_BEND + 1.2)
    expect(elbowBend(0.1, 0, -1)).toBe(0)
  })
})

describe('each driver waits and wins their own way', () => {
  const STYLES: readonly GestureStyle[] = ['spade', 'heart', 'diamond', 'club']

  it('has four different waits and four different wins', () => {
    for (const gesture of ['idle', 'cheer'] as const) {
      const poses = STYLES.map((style) => JSON.stringify(gesturePose(gesture, 2.2, 0.3, style)))
      expect(new Set(poses).size).toBe(4)
    }
  })

  it('keeps the hands near the wheel while waiting', () => {
    for (const style of STYLES) {
      for (let t = 0; t < 12; t += 0.2) {
        const pose = gesturePose('idle', t, 0.4, style)
        expect(Math.max(pose.leftUp, pose.rightUp)).toBeLessThan(0.3)
        expect(pose.vSign).toBe(0)
      }
    }
  })

  it('wins as each one does: one fist up, a heart over the helmet, a V, both arms flexed', () => {
    const spade = gesturePose('cheer', 1.5, 0, 'spade')
    expect(spade.rightUp).toBeGreaterThan(2.5)
    expect(spade.leftUp).toBeLessThan(2)
    const heart = gesturePose('cheer', 1.5, 0, 'heart')
    expect(Math.min(heart.leftUp, heart.rightUp)).toBeGreaterThan(2.3)
    expect(Math.min(heart.leftBend, heart.rightBend)).toBeGreaterThan(1)
    const diamond = gesturePose('cheer', 1.5, 0, 'diamond')
    expect(diamond.vSign).toBe(1)
    expect(diamond.rightUp).toBeGreaterThan(2)
    expect(diamond.leftUp).toBe(0)
    const club = gesturePose('cheer', 1.5, 0, 'club')
    expect(Math.min(club.leftOut, club.rightOut)).toBeGreaterThan(1.2)
    expect(Math.min(club.leftBend, club.rightBend)).toBeGreaterThan(1.4)
  })

  it('rises into the win from rest, and turns to their own win on the podium after a while', () => {
    for (const style of STYLES) {
      const start = gesturePose('cheer', 0, 0, style)
      expect(start.leftUp).toBe(REST.leftUp)
      expect(start.rightUp).toBe(REST.rightUp)
    }
    expect(gesturePose('podium', 6, 0, 'club')).toEqual(gesturePose('cheer', 3, 0, 'club'))
    expect(gesturePose('podium', 1, 0, 'club')).toEqual(gesturePose('podium', 1, 0))
  })
})

describe("the kart's motion on its thrusters", () => {
  const settle = (from = SPRING_REST, target = 0, seconds = 1.5, kick = 0) => {
    let spring = stepSpring(from, target, 1 / 60, kick)
    for (let t = 1 / 60; t < seconds; t += 1 / 60) spring = stepSpring(spring, target, 1 / 60)
    return spring
  }

  it('squats pulling away and in a boost, rides up in the air', () => {
    expect(springTarget(20, false, 0)).toBeLessThan(-0.04)
    expect(springTarget(20, false, 1)).toBeLessThan(springTarget(20, false, 0))
    expect(springTarget(0, false, 0)).toBeCloseTo(0)
    expect(springTarget(0, true, 0)).toBeGreaterThan(0)
    expect(settle(SPRING_REST, springTarget(20, false, 0)).height).toBeCloseTo(springTarget(20, false, 0), 3)
  })

  it('is pressed down by a landing, bounces back over and settles', () => {
    let spring = stepSpring(SPRING_REST, 0, 1 / 60, landingKick(1))
    let lowest = 0
    let highest = 0
    for (let t = 0; t < 1.5; t += 1 / 60) {
      spring = stepSpring(spring, 0, 1 / 60)
      lowest = Math.min(lowest, spring.height)
      highest = Math.max(highest, spring.height)
    }
    expect(lowest).toBeLessThan(-0.05)
    expect(lowest).toBeGreaterThanOrEqual(-0.12)
    expect(highest).toBeGreaterThan(0)
    expect(Math.abs(spring.height)).toBeLessThan(0.002)
    // A longer flight lands harder
    expect(landingKick(1.5)).toBeLessThan(landingKick(0.2))
  })

  it('takes a long frame in steps, the same as short ones', () => {
    const one = stepSpring(SPRING_REST, 0, 0.1, -1)
    let many = stepSpring(SPRING_REST, 0, 0, -1)
    for (let i = 0; i < 12; i++) many = stepSpring(many, 0, 0.1 / 12)
    expect(one.height).toBeCloseTo(many.height, 3)
  })

  it('glows behind the thrusters by the throttle, and most in a boost', () => {
    expect(throttleOf(1, 0, 0)).toBe(1)
    expect(throttleOf(undefined, 20, 0)).toBe(1)
    expect(throttleOf(undefined, -10, 0)).toBe(0)
    const idle = thrusterGlow(0, 0, 0)
    const open = thrusterGlow(1, 0.5, 0)
    const boost = thrusterGlow(1, 1, 1)
    expect(open.halo).toBeGreaterThan(idle.halo)
    expect(open.mouth).toBeGreaterThan(idle.mouth)
    expect(boost.halo).toBe(1)
    expect(boost.mouth).toBeGreaterThan(open.mouth)
  })

  it('turns the nose vanes with the steering, held opposite in a drift, never past the stop', () => {
    expect(vaneAngle(0, 0, 1)).toBe(0)
    expect(vaneAngle(1, 0, 1)).toBeCloseTo(VANE_LOCK)
    expect(vaneAngle(1, 0, 0)).toBeLessThan(vaneAngle(1, 0, 1))
    expect(vaneAngle(-1, 0, 1)).toBeCloseTo(-VANE_LOCK)
    expect(vaneAngle(1, 1, 1)).toBeLessThan(vaneAngle(1, 0, 1))
    expect(Math.abs(vaneAngle(1, -1, 1))).toBeLessThanOrEqual(VANE_LOCK)
  })
})
