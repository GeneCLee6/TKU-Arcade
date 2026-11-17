// e10-t05a: the three hover bodies added to the first three (kartModel.ts), our own shapes from the
// Tamsui river mouth's wildlife, made in code. Working names until KART-WORLD.md (e10-t01):
//
// - `crab`, a fiddler crab: a wide, low shell, eyes on stalks and one big claw out front;
// - `heron`, an egret: a long slim needle, a yellow bill for a nose, swept wings, one tall tail;
// - `flyfish`, a flying fish: a torpedo with big swept fins and a forked tail.
//
// Same footprint as the others (about 1.5 m wide and 2.6 m long, KART_RADIUS 1.2), same frame: -z
// forward, the chassis floating above the road.
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three'
import type { ModelKit } from './driverModel.ts'

export type RosterBody = 'crab' | 'heron' | 'flyfish'

export const isRosterBody = (body: string): body is RosterBody =>
  body === 'crab' || body === 'heron' || body === 'flyfish'

export interface BodyMaterials {
  readonly main: Material
  readonly second: Material
  readonly accent: Material
  readonly glass: Material
}

export interface BodyFit {
  /** Where the driver sits, on the chassis */
  readonly seat: { readonly y: number; readonly z: number }
  readonly rearContacts: [number, number][]
}

/** A flat outline in the kart's plane, (x, z) with -z forward, `height` thick, lying on y = 0 */
function plate(outline: readonly (readonly [number, number])[], height: number): BufferGeometry {
  const shape = new Shape()
  outline.forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)))
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, height, 0)
  return geometry
}

/** A swept fin, `length` along the kart and `height` up, thin across: its root at the origin */
function tailFin(length: number, height: number): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(-length / 2, 0)
  shape.lineTo(length / 2, 0)
  shape.lineTo(length / 2, height * 0.4)
  shape.lineTo(length * 0.25, height)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false })
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(0.025, 0, 0)
  return geometry
}

/**
 * Builds `body` onto `chassis`. `thrusterAt` adds a thruster (its housing, glowing mouth and boost
 * flame) pointing back
 */
export function buildRosterBody(
  body: RosterBody,
  kit: ModelKit,
  chassis: Group,
  paint: BodyMaterials,
  thrusterAt: (x: number, y: number, z: number, radius: number) => void,
): BodyFit {
  const { part } = kit
  const { main, second, accent, glass } = paint
  if (body === 'crab') {
    // The shell: wide and low, a darker rim under it
    const shell = part(new SphereGeometry(1, 18, 10), main, 0, 0.12, 0.1)
    shell.scale.set(0.78, 0.3, 0.98)
    chassis.add(shell)
    const rim = part(new CylinderGeometry(0.8, 0.74, 0.1, 20), second, 0, 0.02, 0.1)
    rim.scale.z = 1.2
    chassis.add(rim)
    // Eyes on stalks
    for (const side of [-1, 1]) {
      const stalk = new CylinderGeometry(0.025, 0.025, 0.28, 6)
      chassis.add(part(stalk, second, side * 0.2, 0.42, -0.62))
      chassis.add(part(new SphereGeometry(0.07, 10, 8), glass, side * 0.2, 0.57, -0.62))
    }
    // One big claw on the right, a small one on the left
    const big = part(new SphereGeometry(1, 12, 8), accent, 0.58, 0.14, -0.78)
    big.scale.set(0.24, 0.16, 0.34)
    chassis.add(big)
    const pincer = part(new ConeGeometry(0.1, 0.34, 8), accent, 0.62, 0.18, -1.1)
    pincer.rotation.x = -Math.PI / 2
    chassis.add(pincer)
    const small = part(new SphereGeometry(0.13, 10, 8), accent, -0.58, 0.1, -0.7)
    chassis.add(small)
    // Legs folded along the sides, three a side
    for (const side of [-1, 1]) {
      for (const z of [-0.25, 0.1, 0.45]) {
        const leg = part(new BoxGeometry(0.34, 0.05, 0.07), second, side * 0.82, 0.04, z)
        leg.rotation.z = side * -0.35
        chassis.add(leg)
      }
      thrusterAt(side * 0.36, 0.08, 1.12, 0.16)
    }
    return {
      seat: { y: 0.26, z: 0.22 },
      rearContacts: [
        [-0.7, 1.1],
        [0.7, 1.1],
      ],
    }
  }
  if (body === 'heron') {
    // A long, slim needle with a yellow bill for a nose
    const hull = part(new CapsuleGeometry(0.27, 1.75, 4, 12), main, 0, 0.12, 0.08)
    hull.rotation.x = Math.PI / 2
    hull.scale.x = 1.15
    chassis.add(hull)
    const bill = part(new ConeGeometry(0.16, 0.6, 10), accent, 0, 0.12, -1.25)
    bill.rotation.x = -Math.PI / 2
    chassis.add(bill)
    // The dark crown behind the cockpit
    chassis.add(part(new BoxGeometry(0.12, 0.05, 1.2), second, 0, 0.4, 0.2))
    // Swept wings, white with dark tips
    chassis.add(
      part(
        plate(
          [
            [0.2, -0.3],
            [0.76, 0.42],
            [0.76, 0.66],
            [0.2, 0.42],
            [-0.2, 0.42],
            [-0.76, 0.66],
            [-0.76, 0.42],
            [-0.2, -0.3],
          ],
          0.06,
        ),
        main,
        0,
        0.08,
        0,
      ),
    )
    for (const side of [-1, 1]) {
      chassis.add(part(new BoxGeometry(0.08, 0.08, 0.3), second, side * 0.74, 0.12, 0.54))
    }
    chassis.add(part(tailFin(0.6, 0.62), second, 0, 0.3, 0.86))
    thrusterAt(0, 0.12, 1.12, 0.2)
    return {
      seat: { y: 0.22, z: 0.32 },
      rearContacts: [
        [-0.6, 1.05],
        [0.6, 1.05],
      ],
    }
  }
  // flyfish: a torpedo, big swept fins, a forked tail
  const hull = part(new SphereGeometry(1, 18, 12), main, 0, 0.12, 0)
  hull.scale.set(0.52, 0.32, 1.3)
  chassis.add(hull)
  const belly = part(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), second)
  belly.position.set(0, 0.1, 0)
  belly.scale.set(0.5, 0.2, 1.24)
  chassis.add(belly)
  for (const side of [-1, 1]) {
    const wing = part(
      plate(
        [
          [0, -0.4],
          [0.92, 0.1],
          [0.82, 0.45],
          [0, 0.3],
        ].map(([x, z]) => [side * (x as number), z as number] as const),
        0.05,
      ),
      accent,
      side * 0.3,
      0.12,
      -0.05,
    )
    wing.rotation.z = side * 0.12
    chassis.add(wing)
    // The forked tail, one fin a side in a V
    const fork = part(tailFin(0.5, 0.44), accent, side * 0.1, 0.18, 1.05)
    fork.rotation.z = side * -0.5
    chassis.add(fork)
    thrusterAt(side * 0.24, 0.1, 1.12, 0.15)
  }
  const hump = part(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass)
  hump.position.set(0, 0.3, -0.5)
  hump.scale.set(0.24, 0.16, 0.36)
  chassis.add(hump)
  return {
    seat: { y: 0.26, z: 0.25 },
    rearContacts: [
      [-0.65, 1.05],
      [0.65, 1.05],
    ],
  }
}
