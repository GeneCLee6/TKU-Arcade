// 2026-11-23 (docs/KART-WORLD.md §3.3): what the drivers win with besides their hands. Dee's
// calculator, Clover's dumbbell (each in a hand, shown by the pose's `prop`) and Hartie's hearts (a
// thrown kiss: driverGestures.ts's heartFlight puts them). Made in code, small: only on the full kit
// (driverModel.ts), nothing on the low quality's driver, which never moves.
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Object3D,
  type Material,
  type Shape,
} from 'three'
import type { BodyKit } from './kartParts.ts'
import type { DriverProp } from './driverLooks.ts'
import { HEART_COUNT } from '../driverGestures.ts'

/**
 * The prop in `hand` (the hand's joint, the palm hanging below it), at no size until a pose shows it;
 * null for a driver without one
 */
export function buildProp(
  kit: BodyKit,
  hand: Object3D,
  prop: DriverProp,
  paint: { main: Material; second: Material; lit: Material },
): Object3D | null {
  if (prop === 'none') return null
  const holder = new Object3D()
  holder.position.set(0, -0.06, 0)
  hand.add(holder)
  if (prop === 'calculator') {
    // Held up flat in the palm, its face to the driver: a body, a lit read-out, rows of keys
    const body = new Object3D()
    body.position.set(0, -0.03, -0.03)
    body.rotation.x = -0.4
    holder.add(body)
    kit.put(body, new BoxGeometry(0.1, 0.16, 0.02), paint.main)
    kit.put(body, new BoxGeometry(0.075, 0.035, 0.006), paint.lit, 0, 0.05, -0.012)
    kit.put(body, new BoxGeometry(0.075, 0.07, 0.006), paint.second, 0, -0.025, -0.012)
  } else {
    // A bar through the fist, a plate at each end
    kit.put(holder, new CylinderGeometry(0.012, 0.012, 0.3, 6), paint.second).rotation.z =
      Math.PI / 2
    for (const side of [-1, 1]) {
      kit.put(
        holder,
        new CylinderGeometry(0.06, 0.06, 0.05, 12),
        paint.main,
        side * 0.12,
        0,
        0,
      ).rotation.z = Math.PI / 2
    }
  }
  holder.scale.setScalar(0)
  return holder
}

/** Hartie's hearts on `torso`, at no size until a kiss is thrown; `shapes` the heart's outline */
export function buildHearts(
  kit: BodyKit,
  torso: Object3D,
  shapes: Shape[],
  material: Material,
): Object3D[] {
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 0.02,
    bevelEnabled: false,
    curveSegments: 6,
  })
  // Its middle at its own origin
  geometry.translate(0, -0.135, -0.01)
  geometry.scale(0.75, 0.75, 1)
  const hearts: Object3D[] = []
  for (let index = 0; index < HEART_COUNT; index++) {
    const holder = new Object3D()
    torso.add(holder)
    const mesh = kit.put(holder, index === 0 ? geometry : geometry.clone(), material)
    mesh.castShadow = false
    holder.scale.setScalar(0)
    hearts.push(holder)
  }
  return hearts
}
