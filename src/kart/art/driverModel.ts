// The drivers (e10-t05b): four chibi racers of our own, made in code, card suits made people (the
// club is our bridge club). Working names until KART-WORLD.md (e10-t01). A big round helmet on a
// small body, the suit's crest standing on top of the helmet (seen from the chase camera behind),
// and one thing of their own each: a scarf, round ear pods, goggles, a backpack. Looks only: every
// driver drives the same. The kart model mounts the driver at its seat (kartModel.ts), so any driver
// sits in any kart.
import {
  BoxGeometry,
  CapsuleGeometry,
  ExtrudeGeometry,
  Group,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import { kartDrivers } from '../../styles/kartTokens.ts'

/** What the kart model lends the driver to build with: its geometry and material bookkeeping */
export interface ModelKit {
  part(geometry: BufferGeometry, material: Material, x?: number, y?: number, z?: number): Mesh
  paint(color: string, roughness?: number, metalness?: number): Material
  /** Round and glossy rather than faceted */
  smooth(material: Material): void
}

export interface DriverModel {
  /** Placed at the kart's seat; leans with the kart */
  readonly group: Group
  /** Turns to look where the driver steers */
  readonly head: Group
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

export function buildDriver(kit: ModelKit, driver: DriverId): DriverModel {
  const colours = kartDrivers[driver]
  const suit = kit.paint(colours.suit, 0.7, 0)
  const helmet = kit.paint(colours.helmet, 0.25, 0.25)
  kit.smooth(helmet)
  const crest = kit.paint(colours.crest, 0.35, 0.2)
  const trim = kit.paint(colours.trim, 0.4, 0.3)
  const visor = kit.paint(colours.suit, 0.1, 0.6)

  const group = new Group()
  group.add(kit.part(new CapsuleGeometry(0.15, 0.14, 3, 10), suit, 0, 0.24, 0))
  for (const side of [-1, 1]) {
    const arm = kit.part(new CapsuleGeometry(0.05, 0.26, 2, 6), suit, side * 0.17, 0.3, -0.2)
    arm.rotation.x = -1.15
    group.add(arm)
  }
  const head = new Group()
  head.position.set(0, 0.68, 0.02)
  head.add(kit.part(new SphereGeometry(0.34, 16, 12), helmet))
  // The visor, a dark band across the front
  head.add(
    kit.part(
      new SphereGeometry(0.3, 14, 8, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.34, Math.PI * 0.28),
      visor,
      0,
      0,
      -0.07,
    ),
  )

  // The crest, standing on the helmet's crown and facing the camera behind
  const shape = crestShape(driver)
  if (shape) {
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
      curveSegments: 6,
    })
    geometry.translate(0, 0, -0.03)
    head.add(kit.part(geometry, crest, 0, 0.27, 0.04))
  } else {
    for (const [x, y] of [
      [0, 0.5],
      [-0.075, 0.4],
      [0.075, 0.4],
    ] as const) {
      head.add(kit.part(new SphereGeometry(0.075, 10, 8), crest, x, y, 0.04))
    }
    head.add(kit.part(new BoxGeometry(0.04, 0.12, 0.04), crest, 0, 0.32, 0.04))
  }

  // Each one's own touch
  if (driver === 'spade') {
    // A scarf round the neck, its tail streaming back
    const ring = kit.part(new TorusGeometry(0.15, 0.04, 6, 14), trim, 0, 0.4, 0)
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    const tail = kit.part(new BoxGeometry(0.1, 0.03, 0.36), trim, 0.06, 0.42, 0.26)
    tail.rotation.x = 0.35
    group.add(tail)
  } else if (driver === 'heart') {
    // Round pods on either side of the helmet
    for (const side of [-1, 1]) {
      head.add(kit.part(new SphereGeometry(0.1, 10, 8), crest, side * 0.31, 0.12, 0.02))
    }
  } else if (driver === 'diamond') {
    // Goggles pushed up on the helmet
    const band = kit.part(new TorusGeometry(0.33, 0.025, 6, 24), trim, 0, 0.12, 0)
    band.rotation.x = Math.PI / 2 - 0.25
    head.add(band)
    for (const side of [-1, 1]) {
      const lens = kit.part(new SphereGeometry(0.07, 10, 8), visor, side * 0.11, 0.22, -0.28)
      lens.scale.z = 0.5
      head.add(lens)
    }
  } else {
    // A small backpack
    group.add(kit.part(new BoxGeometry(0.24, 0.24, 0.12), trim, 0, 0.28, 0.18))
  }
  group.add(head)
  return { group, head }
}
