// The drivers (e10-t05b): four chibi racers of our own, made in code, card suits made people (the
// club is our bridge club). Working names until KART-WORLD.md (e10-t01). A big round helmet on a
// small body, the suit's crest standing on top of the helmet (seen from the chase camera behind),
// and one thing of their own each: a scarf, round ear pods, goggles, a backpack. Looks only: every
// driver drives the same. The kart model mounts the driver at its seat (kartModel.ts), so any driver
// sits in any kart. 2026-11-18: seated, arms on the handlebar, a torso that leans (kartModel.ts
// moves it: into a turn, back in a boost, swaying when stunned).
import {
  BoxGeometry,
  CapsuleGeometry,
  ExtrudeGeometry,
  Group,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import { kartDrivers } from '../../styles/kartTokens.ts'
import type { BodyKit } from './kartParts.ts'

export interface DriverModel {
  /** Placed at the kart's seat */
  readonly group: Group
  /** Everything above the seat: leans into a turn, back in a boost, sways when stunned */
  readonly torso: Group
  /** Turns to look where the driver steers */
  readonly head: Group
  /** Left and right, from the shoulder to the handlebar: they follow it */
  readonly arms: readonly [Group, Group]
}

/** The suit's sign, flat in x (across) and y (up), about 0.26 m tall, its foot at the origin */
function crestShape(driver: DriverId): Shape | null {
  const shape = new Shape()
  switch (driver) {
    case 'spade':
      // A point on top, two round lobes, a short flared stem
      shape.moveTo(0, 0.27)
      shape.bezierCurveTo(0.05, 0.2, 0.15, 0.15, 0.13, 0.08)
      shape.bezierCurveTo(0.11, 0.02, 0.04, 0.03, 0.02, 0.06)
      shape.lineTo(0.06, 0)
      shape.lineTo(-0.06, 0)
      shape.lineTo(-0.02, 0.06)
      shape.bezierCurveTo(-0.04, 0.03, -0.11, 0.02, -0.13, 0.08)
      shape.bezierCurveTo(-0.15, 0.15, -0.05, 0.2, 0, 0.27)
      return shape
    case 'heart':
      shape.moveTo(0, 0)
      shape.bezierCurveTo(0.08, 0.06, 0.16, 0.12, 0.14, 0.2)
      shape.bezierCurveTo(0.12, 0.27, 0.03, 0.27, 0, 0.2)
      shape.bezierCurveTo(-0.03, 0.27, -0.12, 0.27, -0.14, 0.2)
      shape.bezierCurveTo(-0.16, 0.12, -0.08, 0.06, 0, 0)
      return shape
    case 'diamond':
      shape.moveTo(0, 0)
      shape.lineTo(0.1, 0.13)
      shape.lineTo(0, 0.27)
      shape.lineTo(-0.1, 0.13)
      shape.closePath()
      return shape
    case 'club':
      // Three balls, not a flat shape: drawn as spheres
      return null
  }
}

export function buildDriver(kit: BodyKit, driver: DriverId): DriverModel {
  const colours = kartDrivers[driver]
  const suit = kit.colour(colours.suit, 0.75, 0)
  const helmet = kit.colour(colours.helmet, 0.3, 0.1)
  const crest = kit.colour(colours.crest, 0.3, 0.3)
  const trim = kit.colour(colours.trim, 0.4, 0.3)
  const visor = kit.paint.glass

  const group = new Group()
  // Seated: the legs out in front, the knees up a little
  for (const side of [-1, 1]) {
    const leg = kit.put(group, new CapsuleGeometry(0.06, 0.2, 2, 8), suit, side * 0.09, 0.13, -0.16)
    leg.rotation.x = -1.25
    kit.put(group, new SphereGeometry(0.07, 8, 6), trim, side * 0.09, 0.1, -0.32)
  }
  const torso = new Group()
  torso.position.set(0, 0.1, 0)
  group.add(torso)
  kit.put(torso, new CapsuleGeometry(0.15, 0.14, 3, 12), suit, 0, 0.14, 0)
  // A stripe down the chest and back in the crest's colour
  kit.put(torso, new BoxGeometry(0.07, 0.24, 0.31), crest, 0, 0.16, 0)
  const arms = [-1, 1].map((side) => {
    const arm = new Group()
    arm.position.set(side * 0.17, 0.26, -0.02)
    kit.put(arm, new CapsuleGeometry(0.048, 0.26, 2, 8), suit, 0, -0.03, -0.17).rotation.x = -1.2
    kit.put(arm, new SphereGeometry(0.06, 8, 6), trim, 0, -0.1, -0.34)
    torso.add(arm)
    return arm
  }) as [Group, Group]
  const head = new Group()
  head.position.set(0, 0.58, 0.02)
  kit.put(head, new SphereGeometry(0.34, 20, 14), helmet)
  // The visor, a dark band across the front
  kit.put(
    head,
    new SphereGeometry(0.3, 16, 8, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.34, Math.PI * 0.28),
    visor,
    0,
    0,
    -0.07,
  )
  // A band round the helmet's base
  kit.put(head, new TorusGeometry(0.3, 0.03, 6, 20), trim, 0, -0.17, 0).rotation.x = Math.PI / 2

  // The crest, standing on the helmet's crown and facing the camera behind
  const shape = crestShape(driver)
  if (shape) {
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
      curveSegments: 6,
    })
    geometry.translate(0, 0, -0.03)
    kit.put(head, geometry, crest, 0, 0.27, 0.04)
  } else {
    for (const [x, y] of [
      [0, 0.5],
      [-0.075, 0.4],
      [0.075, 0.4],
    ] as const) {
      kit.put(head, new SphereGeometry(0.075, 10, 8), crest, x, y, 0.04)
    }
    kit.put(head, new BoxGeometry(0.04, 0.12, 0.04), crest, 0, 0.32, 0.04)
  }

  // Each one's own touch
  if (driver === 'spade') {
    // A scarf round the neck, its tail streaming back
    kit.put(torso, new TorusGeometry(0.15, 0.04, 6, 14), trim, 0, 0.3, 0).rotation.x = Math.PI / 2
    kit.put(torso, new BoxGeometry(0.1, 0.03, 0.36), trim, 0.06, 0.32, 0.26).rotation.x = 0.35
  } else if (driver === 'heart') {
    // Round pods on either side of the helmet
    for (const side of [-1, 1]) {
      kit.put(head, new SphereGeometry(0.1, 10, 8), crest, side * 0.31, 0.12, 0.02)
    }
  } else if (driver === 'diamond') {
    // Goggles pushed up on the helmet
    kit.put(head, new TorusGeometry(0.33, 0.025, 6, 24), trim, 0, 0.12, 0).rotation.x =
      Math.PI / 2 - 0.25
    for (const side of [-1, 1]) {
      kit.put(head, new SphereGeometry(0.07, 10, 8), visor, side * 0.11, 0.22, -0.28).scale.z = 0.5
    }
  } else {
    // A small backpack
    kit.put(torso, new BoxGeometry(0.24, 0.24, 0.12), trim, 0, 0.18, 0.18)
  }
  torso.add(head)
  return { group, torso, head, arms }
}
