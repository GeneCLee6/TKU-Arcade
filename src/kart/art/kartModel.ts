// e8-t07: the first kart, an original design made in code: a low go-kart with side pods, a front
// nose and a rear wing, four chunky wheels (bigger at the back), and its driver: a round helmet with
// a visor, arms on the wheel. Our own cartoon shapes and colours (kartScene), nothing traced or
// borrowed. The size matches the physics: 1.5 m wide, 2.6 m long (KART_RADIUS 1.2).
//
// It moves like a kart: the wheels turn with the speed, the front ones steer, the body leans out of
// a drift and dips under braking, and the driver leans into the turn.
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'

/** What the model shows each frame, besides where it is */
export interface KartLook {
  /** m/s along the way it points (negative in reverse) */
  readonly speed: number
  /** -1 left to 1 right, as pressed */
  readonly steer: number
  /** -1 left, 1 right, 0 not drifting */
  readonly drift: number
  readonly boosting: boolean
}

export interface KartModel {
  readonly group: Group
  /** Where the back wheels touch the road, in the kart's own frame (x, z), for marks and smoke */
  readonly rearWheels: readonly (readonly [number, number])[]
  /** Where the exhaust is, in the kart's own frame (x, y, z), for the boost flame */
  readonly exhaust: readonly [number, number, number]
  update(look: KartLook, frameSeconds: number): void
  dispose(): void
}

const WHEEL = { front: 0.27, rear: 0.33, width: 0.26 }
const TRACK_WIDTH = 0.66
const AXLE = { front: -0.88, rear: 0.86 }

export function buildKartModel(shadows: boolean): KartModel {
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const keep = <T extends BufferGeometry>(geometry: T) => (geometries.push(geometry), geometry)
  const paint = (color: string, roughness = 0.55, metalness = 0.1) => {
    const material = new MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
    materials.push(material)
    return material
  }
  const part = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(keep(geometry), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadows
    return mesh
  }

  const body = paint(kartScene.body)
  const trim = paint(kartScene.nose)
  const dark = paint(kartScene.kartDark, 0.8)
  const metal = paint(kartScene.metal, 0.35, 0.6)
  const rubber = paint(kartScene.tyre, 0.95, 0)
  const suit = paint(kartScene.suit)
  const helmet = paint(kartScene.helmet, 0.3, 0.2)
  const visor = paint(kartScene.visor, 0.1, 0.5)

  const group = new Group()
  // Everything that rocks on the springs: the wheels stay on the road, this leans and dips
  const chassis = new Group()
  chassis.position.y = 0.16
  group.add(chassis)

  // The floor pan, pods either side, the nose, the bumper, the engine and the wing
  chassis.add(part(new BoxGeometry(1.0, 0.12, 2.3), dark, 0, 0.08, 0))
  for (const side of [-1, 1]) {
    const pod = part(new CapsuleGeometry(0.17, 1.05, 3, 8), body, side * 0.56, 0.22, 0.05)
    pod.rotation.x = Math.PI / 2
    chassis.add(pod)
  }
  const nose = part(new BoxGeometry(0.95, 0.22, 0.75), body, 0, 0.22, -0.92)
  nose.rotation.x = 0.18
  chassis.add(nose)
  chassis.add(part(new BoxGeometry(1.25, 0.1, 0.18), trim, 0, 0.12, -1.28))
  chassis.add(part(new BoxGeometry(0.62, 0.36, 0.5), metal, 0, 0.32, 0.92))
  chassis.add(part(new CylinderGeometry(0.07, 0.09, 0.32, 8), metal, 0.22, 0.42, 1.2))
  for (const side of [-1, 1])
    chassis.add(part(new BoxGeometry(0.06, 0.48, 0.12), dark, side * 0.5, 0.56, 1.13))
  chassis.add(part(new BoxGeometry(1.32, 0.06, 0.34), body, 0, 0.82, 1.14))
  // The seat, the steering column and wheel
  chassis.add(part(new BoxGeometry(0.5, 0.42, 0.14), dark, 0, 0.38, 0.42))
  const column = part(new CylinderGeometry(0.03, 0.03, 0.5, 6), metal, 0, 0.42, -0.28)
  column.rotation.x = -0.95
  chassis.add(column)
  const wheel = new Mesh(keep(new CylinderGeometry(0.17, 0.17, 0.05, 12)), dark)
  wheel.position.set(0, 0.62, -0.42)
  wheel.rotation.x = 0.62
  wheel.castShadow = shadows
  chassis.add(wheel)

  // The driver: a suit, arms forward to the wheel, a round helmet and its visor
  const driver = new Group()
  driver.position.set(0, 0.38, 0.32)
  driver.add(part(new CapsuleGeometry(0.2, 0.32, 3, 10), suit, 0, 0.36, 0))
  for (const side of [-1, 1]) {
    const arm = part(new CapsuleGeometry(0.06, 0.38, 2, 6), suit, side * 0.2, 0.42, -0.3)
    arm.rotation.x = -1.2
    driver.add(arm)
  }
  const head = new Group()
  head.position.set(0, 0.86, 0.02)
  head.add(part(new SphereGeometry(0.24, 14, 10), helmet))
  const shield = part(
    new SphereGeometry(0.2, 12, 8, -Math.PI * 0.85, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.3),
    visor,
    0,
    0.0,
    -0.06,
  )
  head.add(shield)
  head.add(part(new BoxGeometry(0.06, 0.05, 0.42), trim, 0, 0.22, 0.02))
  driver.add(head)
  chassis.add(driver)

  // Four wheels: tyre and hub, each turning about its own axle
  const wheels: { spin: Group; steer: Group | null; radius: number }[] = []
  for (const [z, radius, front] of [
    [AXLE.front, WHEEL.front, true],
    [AXLE.rear, WHEEL.rear, false],
  ] as const) {
    for (const side of [-1, 1]) {
      const steer = new Group()
      steer.position.set(side * TRACK_WIDTH, radius, z)
      const spin = new Group()
      const tyre = part(new CylinderGeometry(radius, radius, WHEEL.width, 14), rubber)
      tyre.rotation.z = Math.PI / 2
      const hub = part(
        new CylinderGeometry(radius * 0.55, radius * 0.55, WHEEL.width + 0.02, 8),
        metal,
      )
      hub.rotation.z = Math.PI / 2
      spin.add(tyre, hub)
      steer.add(spin)
      group.add(steer)
      wheels.push({ spin, steer: front ? steer : null, radius })
    }
  }

  let roll = 0
  let pitch = 0
  let lastSpeed = 0
  let bounce = 0
  const ease = (from: number, to: number, rate: number, seconds: number) =>
    from + (to - from) * (1 - Math.exp(-rate * seconds))

  return {
    group,
    rearWheels: [
      [-TRACK_WIDTH, AXLE.rear],
      [TRACK_WIDTH, AXLE.rear],
    ],
    exhaust: [0.22, 0.58, 1.38],
    update(look, seconds) {
      for (const one of wheels) {
        one.spin.rotation.x -= (look.speed / one.radius) * seconds
        if (one.steer) one.steer.rotation.y = -look.steer * 0.42
      }
      // Leaning out of a drift, a little with plain steering at speed; dipping under hard braking
      const speedShare = Math.min(1, Math.abs(look.speed) / 30)
      // + about z leans the top towards -x: out of a right-hand turn
      const targetRoll = look.drift !== 0 ? look.drift * 0.09 : look.steer * 0.04 * speedShare
      roll = ease(roll, targetRoll, 8, seconds)
      const accel = seconds > 0 ? (look.speed - lastSpeed) / seconds : 0
      lastSpeed = look.speed
      // + about x lifts the nose: up when pulling away, down under braking
      pitch = ease(pitch, Math.max(-0.06, Math.min(0.05, accel * 0.004)), 6, seconds)
      bounce += seconds * (6 + speedShare * 14)
      chassis.rotation.z = roll
      chassis.rotation.x = pitch
      chassis.position.y = 0.16 + Math.sin(bounce) * 0.008 * speedShare
      // The driver leans into the turn and looks where they steer
      driver.rotation.z = -roll * 1.8 - look.steer * 0.06
      head.rotation.y = -look.steer * 0.3 - look.drift * 0.15
      wheel.rotation.y = -look.steer * 0.6
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}
