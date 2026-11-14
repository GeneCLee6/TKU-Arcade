// The karts (e8-t07; owner 2026-11-14: "no tyres, hugging the floor"): hover karts of our own, made
// in code. No wheels: each body rides about a third of a metre above the road on its thrusters, with
// a soft bob, a glow on the road beneath it and glowing thruster mouths at the back. Three bodies,
// all our own shapes and colours (kartBodies), with working names until KART-WORLD.md (e10-t01):
//
// - `tide`, a catamaran: two long pontoons joined by a deck, a thruster at the back of each;
// - `comet`, a rounded pod with a skirt round it and one big ring thruster;
// - `ray`, a wide, flat delta with twin tail fins.
//
// The driver is chibi: a big round helmet on a small body, the karts small beside the tracks'
// oversized scenery. Cosmetic only: every body drives the same (physics.ts). The footprint matches
// the physics: about 1.5 m wide and 2.6 m long (KART_RADIUS 1.2).
//
// It moves like a hover kart: it bobs, banks into a drift and a fast turn, dips under braking, lifts
// its nose pulling away, and the thrusters glow brighter with speed and flare in a boost.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { kartBodies, kartHover, kartScene } from '../../styles/kartTokens.ts'
import type { KartBody } from '../bodies.ts'

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
  readonly body: KartBody
  /** The glow colour: the drift sparks and trails match it */
  readonly glow: string
  /** Under the back corners, in the kart's own frame (x, z): where the drift trails and sparks start */
  readonly rearContacts: readonly (readonly [number, number])[]
  /** The thruster mouths, in the kart's own frame (x, y, z), pointing back (+z): the boost flames */
  readonly thrusters: readonly (readonly [number, number, number])[]
  update(look: KartLook, frameSeconds: number): void
  dispose(): void
}

/** How high the body floats over the road, metres */
const HOVER = 0.34

/** A soft round glow, white in the middle: tinted by its material */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

/**
 * A flat outline in the kart's plane, (x, z) with -z forward, extruded `height` up with rounded
 * edges: the delta body
 */
function slab(outline: readonly (readonly [number, number])[], height: number): BufferGeometry {
  const shape = new Shape()
  outline.forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)))
  shape.closePath()
  const bevel = Math.min(0.08, height / 3)
  const geometry = new ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  })
  // The shape's y is the kart's z; the depth goes up
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, height - bevel, 0)
  return geometry
}

/** A swept tail fin, `length` along the kart and `height` up, thin across: its root at the origin */
function fin(length: number, height: number): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(-length / 2, 0)
  shape.lineTo(length / 2, 0)
  shape.lineTo(length / 2, height * 0.35)
  shape.lineTo(length * 0.3, height)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false })
  // The shape's x runs along the kart (+z back), its y up; the depth across
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(0.025, 0, 0)
  return geometry
}

/**
 * `ghost`: see-through and one colour, as a ghost of the best run (e8-t11), with no glow on the
 * road. Shadows only when the scene draws them
 */
export function buildKartModel(
  shadows: boolean,
  ghost = false,
  body: KartBody = 'tide',
): KartModel {
  const colours = kartBodies[body]
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const textures: Texture[] = []
  const keep = <T extends BufferGeometry>(geometry: T) => (geometries.push(geometry), geometry)
  const paint = (color: string, roughness = 0.45, metalness = 0.15) => {
    const material = ghost
      ? new MeshStandardMaterial({
          color: kartScene.ghost,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          roughness: 0.4,
          flatShading: true,
        })
      : new MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
    materials.push(material)
    return material
  }
  const shine = (color: string, opacity = 1) => {
    const material = new MeshBasicMaterial({
      color: ghost ? kartScene.ghost : color,
      transparent: true,
      opacity: ghost ? 0.3 : opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    materials.push(material)
    return material
  }
  const part = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(keep(geometry), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadows
    return mesh
  }

  const main = paint(colours.main)
  const second = paint(colours.second)
  const accent = paint(colours.accent)
  const housing = paint(kartHover.housing, 0.5, 0.5)
  const glass = paint(kartHover.glass, 0.1, 0.6)
  const suit = paint(colours.suit, 0.7, 0)
  const helmet = paint(colours.helmet, 0.25, 0.25)
  // The helmet is round and glossy, not faceted
  if (helmet instanceof MeshStandardMaterial) helmet.flatShading = false
  const mouth = shine(colours.glow, 0.95)

  const group = new Group()
  // Everything that floats: it bobs, banks and dips above the road; the glow beneath stays put
  const chassis = new Group()
  chassis.position.y = HOVER
  group.add(chassis)

  const discs: Mesh[] = []
  const thrusters: [number, number, number][] = []
  /** A thruster: a housing pointing back, its mouth glowing */
  const thrusterAt = (x: number, y: number, z: number, radius: number) => {
    const shell = part(new CylinderGeometry(radius, radius * 1.15, 0.42, 12), housing, x, y, z)
    shell.rotation.x = Math.PI / 2
    chassis.add(shell)
    const disc = new Mesh(keep(new CircleGeometry(radius * 0.78, 14)), mouth)
    disc.position.set(x, y, z + 0.215)
    chassis.add(disc)
    discs.push(disc)
    thrusters.push([x, HOVER + y, z + 0.22])
  }
  /** Where the driver sits, on the chassis */
  let seat = { y: 0.2, z: 0.25 }
  let rearContacts: [number, number][] = [
    [-0.55, 1.0],
    [0.55, 1.0],
  ]

  if (body === 'tide') {
    // Two pontoons, a deck across them, a nose fairing and a low screen
    for (const side of [-1, 1]) {
      const pontoon = part(new CapsuleGeometry(0.24, 1.85, 4, 12), main, side * 0.56, 0.02, 0.02)
      pontoon.rotation.x = Math.PI / 2
      chassis.add(pontoon)
      // A stripe along the top of each
      chassis.add(part(new BoxGeometry(0.1, 0.04, 1.5), second, side * 0.56, 0.25, 0.05))
      chassis.add(part(fin(0.5, 0.34), accent, side * 0.56, 0.2, 0.86))
      thrusterAt(side * 0.56, 0.04, 1.2, 0.17)
    }
    chassis.add(part(new BoxGeometry(0.92, 0.12, 1.55), second, 0, 0.12, 0.18))
    const nose = part(new BoxGeometry(1.0, 0.14, 0.42), accent, 0, 0.12, -0.78)
    nose.rotation.x = 0.12
    chassis.add(nose)
    const screen = part(new BoxGeometry(0.62, 0.26, 0.05), glass, 0, 0.32, -0.42)
    screen.rotation.x = -0.6
    chassis.add(screen)
    seat = { y: 0.18, z: 0.28 }
    rearContacts = [
      [-0.56, 1.05],
      [0.56, 1.05],
    ]
  } else if (body === 'comet') {
    // A rounded pod, a skirt round its waist, stubby wings and one big ring thruster
    const pod = part(new SphereGeometry(1, 18, 12), main, 0, 0.12, 0.05)
    pod.scale.set(0.7, 0.36, 1.28)
    chassis.add(pod)
    const skirt = part(new TorusGeometry(1, 0.085, 6, 32), accent, 0, 0.04, 0.05)
    skirt.rotation.x = Math.PI / 2
    skirt.scale.set(0.76, 1.26, 1)
    chassis.add(skirt)
    // A pale cap over the nose
    const band = part(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), second)
    band.position.set(0, 0.06, -0.42)
    band.scale.set(0.5, 0.36, 0.86)
    chassis.add(band)
    // A small fin on the back, a stripe along it
    chassis.add(part(fin(0.6, 0.36), second, 0, 0.36, 0.72))
    // One wide, short nozzle at the back: a bell, not a tube
    const bell = part(new CylinderGeometry(0.26, 0.32, 0.3, 16), second, 0, 0.16, 1.22)
    bell.rotation.x = Math.PI / 2
    chassis.add(bell)
    const disc = new Mesh(keep(new CircleGeometry(0.24, 18)), mouth)
    disc.position.set(0, 0.16, 1.375)
    chassis.add(disc)
    discs.push(disc)
    thrusters.push([0, HOVER + 0.16, 1.4])
    seat = { y: 0.26, z: 0.18 }
    rearContacts = [
      [-0.5, 1.1],
      [0.5, 1.1],
    ]
  } else {
    // A wide, flat delta, a hump for the cockpit, twin tail fins and two thrusters
    chassis.add(
      part(
        slab(
          [
            [0, -1.32],
            [0.32, -0.95],
            [0.78, 0.55],
            [0.74, 1.12],
            [-0.74, 1.12],
            [-0.78, 0.55],
            [-0.32, -0.95],
          ],
          0.2,
        ),
        main,
        0,
        -0.04,
        0,
      ),
    )
    // A dark inlay down the middle
    chassis.add(
      part(
        slab(
          [
            [0, -1.05],
            [0.2, -0.75],
            [0.34, 0.9],
            [-0.34, 0.9],
            [-0.2, -0.75],
          ],
          0.06,
        ),
        second,
        0,
        0.15,
        0,
      ),
    )
    for (const side of [-1, 1]) {
      // Gold wing tips and the tail fins
      chassis.add(part(new BoxGeometry(0.1, 0.1, 0.6), accent, side * 0.74, 0.08, 0.78))
      const tail = part(fin(0.55, 0.42), accent, side * 0.5, 0.18, 0.82)
      tail.rotation.z = side * -0.2
      chassis.add(tail)
      thrusterAt(side * 0.32, 0.1, 1.18, 0.15)
    }
    const hump = part(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass)
    hump.position.set(0, 0.16, -0.42)
    hump.scale.set(0.3, 0.2, 0.45)
    chassis.add(hump)
    seat = { y: 0.2, z: 0.3 }
    rearContacts = [
      [-0.7, 1.05],
      [0.7, 1.05],
    ]
  }

  // A handlebar in front of the driver: a hover kart steers with one
  const bar = new Group()
  bar.position.set(0, seat.y + 0.3, seat.z - 0.42)
  bar.add(part(new CylinderGeometry(0.025, 0.025, 0.24, 6), housing, 0, -0.12, 0))
  const grip = part(new CapsuleGeometry(0.03, 0.42, 2, 6), housing)
  grip.rotation.z = Math.PI / 2
  bar.add(grip)
  chassis.add(bar)

  // The driver, chibi: a small body and a big round helmet, a visor and a stripe over the top
  const driver = new Group()
  driver.position.set(0, seat.y, seat.z)
  driver.add(part(new CapsuleGeometry(0.15, 0.14, 3, 10), suit, 0, 0.24, 0))
  for (const side of [-1, 1]) {
    const arm = part(new CapsuleGeometry(0.05, 0.26, 2, 6), suit, side * 0.17, 0.3, -0.2)
    arm.rotation.x = -1.15
    driver.add(arm)
  }
  const head = new Group()
  head.position.set(0, 0.68, 0.02)
  head.add(part(new SphereGeometry(0.34, 16, 12), helmet))
  head.add(
    part(
      new SphereGeometry(0.3, 14, 8, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.34, Math.PI * 0.28),
      glass,
      0,
      0,
      -0.07,
    ),
  )
  head.add(part(new BoxGeometry(0.08, 0.06, 0.6), accent, 0, 0.32, 0.02))
  driver.add(head)
  chassis.add(driver)

  // The glow on the road beneath: not on a ghost
  let under: Mesh | null = null
  let underMaterial: MeshBasicMaterial | null = null
  if (!ghost) {
    const texture = glowTexture()
    textures.push(texture)
    underMaterial = new MeshBasicMaterial({
      map: texture,
      color: colours.glow,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
    materials.push(underMaterial)
    under = new Mesh(keep(new PlaneGeometry(2.2, 3.4)), underMaterial)
    under.rotation.x = -Math.PI / 2
    // Above the road, kerbs and lines (trackArt.ts LIFT), under the body
    under.position.y = 0.1
    group.add(under)
  }

  let roll = 0
  let pitch = 0
  let lastSpeed = 0
  let bob = 0
  let flare = 0
  const ease = (from: number, to: number, rate: number, seconds: number) =>
    from + (to - from) * (1 - Math.exp(-rate * seconds))

  return {
    group,
    body,
    glow: colours.glow,
    rearContacts,
    thrusters,
    update(look, seconds) {
      const speedShare = Math.min(1, Math.abs(look.speed) / 30)
      // Banking into a drift, a little into a fast turn: - about z leans the top towards +x, into a right turn
      const targetRoll = look.drift !== 0 ? -look.drift * 0.13 : -look.steer * 0.06 * speedShare
      roll = ease(roll, targetRoll, 7, seconds)
      const accel = seconds > 0 ? (look.speed - lastSpeed) / seconds : 0
      lastSpeed = look.speed
      // + about x lifts the nose: up pulling away and in a boost, down under braking
      const targetPitch =
        Math.max(-0.07, Math.min(0.06, accel * 0.004)) + (look.boosting ? 0.03 : 0)
      pitch = ease(pitch, targetPitch, 6, seconds)
      bob += seconds * (2.3 + speedShare * 3)
      chassis.rotation.z = roll
      chassis.rotation.x = pitch
      chassis.position.y =
        HOVER +
        Math.sin(bob) * (0.045 - speedShare * 0.02) +
        Math.sin(bob * 7.3) * 0.006 * speedShare
      // The driver leans with the kart and looks where they steer
      driver.rotation.z = roll * 0.8 - look.steer * 0.05
      head.rotation.y = -look.steer * 0.3 - look.drift * 0.15
      bar.rotation.y = -look.steer * 0.45
      // The thrusters glow with speed and flare in a boost
      flare = ease(flare, look.boosting ? 1 : 0, 10, seconds)
      const size = 0.75 + speedShare * 0.3 + flare * 0.35
      for (const disc of discs) disc.scale.set(size, size, 1)
      if (under && underMaterial) {
        // The glow spreads and dims as the body rises on its bob
        const lift = chassis.position.y - HOVER
        under.scale.set(1 + lift * 2, 1 + lift * 2, 1)
        underMaterial.opacity = 0.7 - lift * 2 + flare * 0.25
      }
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}
