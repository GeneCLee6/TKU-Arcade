// The karts (e8-t07; owner 2026-11-14: "no tyres, hugging the floor"): hover karts of our own, made
// in code. No wheels: each body rides about a third of a metre above the road on its thrusters, with
// a soft bob, a glow on the road beneath it and glowing thruster mouths at the back. Six bodies
// (e10-t05a), all our own shapes and colours (kartBodies), drawn again on 2026-11-18 (owner: "more
// and more real, more striking; some karts change shape when they fire a boost"): kartBodies.ts has
// the six shapes, kartParts.ts what they are built from, and this file what they share: the paint
// (metallic, catching an environment map), the lamps, the thrusters, the driver, and how it all
// moves.
//
// It moves like a hover kart: it bobs, banks into a drift and a fast turn, dips under braking, lifts
// its nose pulling away, and the thrusters glow brighter with speed and flare in a boost. While a
// full boost runs (boostFx.ts) the kart changes shape: every body has parts that open, slide and
// spread, over about a quarter of a second, and close again when it ends. The look says which boost
// runs; where it only says that one does (another racer's kart, a bot's, a replay's), the kind is
// worked out from how long it has run, so everyone's kart is seen to change.
//
// The driver (driverModel.ts, e10-t05b) is chibi, one of four, mounted at the body's seat: any
// driver in any kart. They lean into a turn, are thrown back by a boost, and sway when a hit stuns
// them. A kart's numbers are in shared/kart/karts.ts; the model is looks only. The footprint matches
// the physics: about 1.5 m wide and 2.6 m long (KART_RADIUS 1.2).
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import type { DriverId } from '../../../shared/kart/karts.ts'
import { kartBodies, kartHover, kartParts, kartScene } from '../../styles/kartTokens.ts'
import type { KartBody } from '../bodies.ts'
import {
  BOOST_FX,
  morphEase,
  NO_BOOST,
  readBoost,
  type BoostKind,
  type BoostReading,
} from '../boostFx.ts'
import { buildDriver } from './driverModel.ts'
import { buildKartBody } from './kartBodies.ts'
import {
  bell,
  carbonTexture,
  flatten,
  hinge,
  hoop,
  morphOf,
  type BodyKit,
  type Morph,
} from './kartParts.ts'

/** What the model shows each frame, besides where it is */
export interface KartLook {
  /** m/s along the way it points (negative in reverse) */
  readonly speed: number
  /** -1 left to 1 right, as pressed */
  readonly steer: number
  /** -1 left, 1 right, 0 not drifting */
  readonly drift: number
  readonly boosting: boolean
  /**
   * Which boost runs (2026-11-18, boostFx.ts: spread `boostFx(kind)` into the look). Left out
   * (another racer's kart, a replay: the wire has one bit), it is worked out from how long it runs
   */
  readonly boostKind?: BoostKind
  /**
   * The release boost's state, for the sparks: 1 when the drift has gone on long enough to earn
   * one, 2 while its window is open (press the throttle now), 0 or left out otherwise
   */
  readonly charge?: 0 | 1 | 2
  /** Counts boosts fired, of any kind: when it goes up the thrusters burst */
  readonly bursts?: number
  /**
   * How hard the last of those kicked, 0 to 1 (feelFx.ts's BURST_POWER): a perfect start throws the
   * most flame. Left out, a middling one
   */
  readonly burstPower?: number
  /**
   * How hard the tyres slide, 0 to 1 (feelFx.ts's skidStrength): how dark the skid marks are and how
   * thick the smoke. Left out (another racer's kart), a drift marks at full strength
   */
  readonly skid?: number
  /** A hill track (2026-11-17): whether the kart is in the air, and a count of its landings */
  readonly airborne?: boolean
  readonly landings?: number
}

export interface KartModel {
  readonly group: Group
  readonly body: KartBody
  readonly driver: DriverId
  /** The glow colour: the drift sparks and trails match it */
  readonly glow: string
  /** Under the back corners, in the kart's own frame (x, z): where the drift trails and sparks start */
  readonly rearContacts: readonly (readonly [number, number])[]
  /** The thruster mouths, in the kart's own frame (x, y, z), pointing back (+z), the shape closed */
  readonly thrusters: readonly (readonly [number, number, number])[]
  /** The same as things on the chassis, pointing back (+z): the flames ride on them, shape and all */
  readonly nozzles: readonly Object3D[]
  /** The boost as last read from the look (boostFx.ts): its kind, the shape's change, what fired */
  boost(): BoostReading
  /** `dazed`, 0 to 1: the driver sways, stunned by a hit */
  update(look: KartLook, frameSeconds: number, dazed?: number): void
  dispose(): void
}

/** How high the body floats over the road, metres */
const HOVER = 0.34
/** How much lower it rides with its shape open */
const MORPH_DROP = 0.07

/** What the scene lends a kart's paint (Scene.ts): the environment to reflect, and how bright to glow */
export interface KartFinish {
  /** kartParts.ts's environment map; none, and the paint is plain */
  readonly environment?: Texture | null
  /**
   * How much brighter than white the lit parts are drawn: above 1 only where the picture is
   * developed afterwards (post.ts), which turns the excess into a glow
   */
  readonly glow?: number
}

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
 * `ghost`: see-through and one colour, as a ghost of the best run (e8-t11), with no glow on the
 * road. Shadows only when the scene draws them
 */
export function buildKartModel(
  shadows: boolean,
  ghost = false,
  body: KartBody = 'tide',
  driverId: DriverId = 'spade',
  finish: KartFinish = {},
): KartModel {
  const colours = kartBodies[body]
  const environment = finish.environment ?? null
  const bright = finish.glow ?? 1
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const textures: Texture[] = []
  const keep = <T extends BufferGeometry>(geometry: T) => (geometries.push(geometry), geometry)
  const own = <T extends Material>(material: T) => (materials.push(material), material)

  // A ghost is one see-through material all over, so it merges into a mesh or two
  const ghostPaint = ghost
    ? own(
        new MeshStandardMaterial({
          color: kartScene.ghost,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          roughness: 0.4,
        }),
      )
    : null
  const colour = (color: string, roughness = 0.35, metalness = 0.55): Material =>
    ghostPaint ??
    own(
      new MeshStandardMaterial({
        color,
        roughness,
        metalness,
        envMap: environment,
        envMapIntensity: 1.15,
      }),
    )
  /** Lit from within: a plain colour, brighter than white by `gain` of what the scene's glow allows */
  const lit = (color: string, gain = 1) =>
    own(
      new MeshBasicMaterial({
        color: ghost ? kartScene.ghost : new Color(color).multiplyScalar(1 + (bright - 1) * gain),
        transparent: ghost,
        opacity: ghost ? 0.3 : 1,
        depthWrite: !ghost,
        toneMapped: false,
      }),
    )
  let carbon: Material | null = ghostPaint
  if (!carbon) {
    const weave = carbonTexture()
    textures.push(weave)
    carbon = own(
      new MeshStandardMaterial({
        color: kartParts.metal,
        map: weave,
        roughness: 0.42,
        metalness: 0.5,
        envMap: environment,
        envMapIntensity: 0.9,
      }),
    )
  }
  const glowColour = new Color(colours.glow)
  const core = lit(colours.glow)
  const mouth = lit(colours.glow)
  const tailLamp = lit(kartParts.tailLamp)
  const tailColour = new Color(kartParts.tailLamp)
  const paint = {
    main: colour(colours.main, 0.3, 0.6),
    second: colour(colours.second, 0.36, 0.5),
    accent: colour(colours.accent, 0.3, 0.65),
    carbon,
    metal: colour(kartParts.metal, 0.22, 1),
    glass: colour(kartHover.glass, 0.06, 0.9),
    dark: colour(kartParts.dark, 0.7, 0.2),
    glow: lit(colours.glow, 0.8),
    core,
    headLamp: lit(kartParts.headLamp),
    tailLamp,
  }

  const group = new Group()
  // Everything that floats: it bobs, banks and dips above the road; the glow beneath stays put
  const chassis = new Group()
  chassis.position.y = HOVER
  group.add(chassis)

  const morphs: Morph[] = []
  const nozzles: Object3D[] = []
  const put: BodyKit['put'] = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(keep(geometry), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadows
    parent.add(mesh)
    return mesh
  }
  const kit: BodyKit = {
    paint,
    put,
    colour,
    morph: (object, to) => morphs.push(morphOf(object, to, morphEase)),
    nozzle(parent, x, y, z, radius) {
      put(parent, bell(radius, 0.44), paint.metal, x, y, z)
      put(parent, hoop(radius * 0.96, 0.02), paint.glow, x, y, z)
      put(parent, new CircleGeometry(radius * 0.7, 16), mouth, x, y, z - 0.1)
      // A collar round the bell: it slides back and widens while a full boost runs
      const collar = hinge(parent, x, y, z - 0.16)
      put(collar, bell(radius * 1.12, 0.2, 0.86), paint.carbon)
      kit.morph(collar, { z: z + 0.02, s: 1.3, from: 0.3 })
      const anchor = new Object3D()
      anchor.position.set(x, y, z)
      parent.add(anchor)
      nozzles.push(anchor)
    },
    strip(parent, x, y, z, length, turn = 0, material = paint.glow) {
      const mesh = put(parent, new BoxGeometry(0.03, 0.022, length), material, x, y, z)
      mesh.rotation.y = turn
      return mesh
    },
  }

  const { seat, rearContacts } = buildKartBody(body, kit, chassis)

  // A handlebar in front of the driver: a hover kart steers with one
  const bar = hinge(chassis, 0, seat.y + 0.3, seat.z - 0.42)
  put(bar, new CylinderGeometry(0.025, 0.03, 0.26, 8), paint.metal, 0, -0.13, 0)
  put(bar, new CapsuleGeometry(0.03, 0.42, 2, 8), paint.dark).rotation.z = Math.PI / 2
  put(bar, new BoxGeometry(0.1, 0.05, 0.03), paint.glow, 0, 0.02, -0.02)

  // The driver (driverModel.ts), mounted at the seat
  const driver = buildDriver(kit, driverId)
  driver.group.position.set(0, seat.y, seat.z)
  chassis.add(driver.group)

  // Where the thruster mouths are with the shape closed, in the kart's own frame
  group.updateMatrixWorld(true)
  const spot = new Vector3()
  const thrusters = nozzles.map((nozzle): [number, number, number] => {
    group.worldToLocal(nozzle.getWorldPosition(spot))
    return [spot.x, spot.y, spot.z]
  })
  // Everything built: one mesh for each material in each moving part
  flatten(chassis, keep, shadows)

  // The glow on the road beneath, and the pool of the head lamps ahead: not on a ghost
  let under: Mesh | null = null
  let underMaterial: MeshBasicMaterial | null = null
  if (!ghost) {
    const texture = glowTexture()
    textures.push(texture)
    const pool = (color: string, opacity: number) =>
      own(
        new MeshBasicMaterial({
          map: texture,
          color,
          transparent: true,
          opacity,
          blending: AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      )
    underMaterial = pool(colours.glow, 0.6)
    under = new Mesh(keep(new PlaneGeometry(2.2, 3.4)), underMaterial)
    under.rotation.x = -Math.PI / 2
    // Above the road, kerbs and lines (trackArt.ts LIFT), under the body
    under.position.y = 0.1
    group.add(under)
    const beam = new Mesh(keep(new PlaneGeometry(2.6, 4.4)), pool(kartParts.headLamp, 0.14))
    beam.rotation.x = -Math.PI / 2
    beam.position.set(0, 0.1, -3.1)
    group.add(beam)
  }

  let roll = 0
  let pitch = 0
  /** The nose thrown up by a boost that fired, radians, dying away; and the boosts seen so far */
  let rear = 0
  let firedSeen = 0
  let lastSpeed = 0
  let bob = 0
  let lean = 0
  let thrown = 0
  let braking = 0
  let sway = 0
  let reading: BoostReading = NO_BOOST
  let shaped = -1
  const tint = new Color()
  const flameColour = new Color()
  const ease = (from: number, to: number, rate: number, seconds: number) =>
    from + (to - from) * (1 - Math.exp(-rate * seconds))

  return {
    group,
    body,
    driver: driverId,
    glow: colours.glow,
    rearContacts,
    thrusters,
    nozzles,
    boost: () => reading,
    update(look, seconds, dazed = 0) {
      reading = readBoost(reading, look, seconds)
      const speedShare = Math.min(1, Math.abs(look.speed) / 30)
      // Banking into a drift, a little into a fast turn: - about z leans the top towards +x, into a right turn
      // (2026-11-17: deeper, by how hard it slides, so that the weight is seen to go over)
      const targetRoll =
        look.drift !== 0
          ? -look.drift * (0.13 + 0.09 * (look.skid ?? 1))
          : -look.steer * 0.07 * speedShare
      roll = ease(roll, targetRoll, 7, seconds)
      const accel = seconds > 0 ? (look.speed - lastSpeed) / seconds : 0
      lastSpeed = look.speed
      // + about x lifts the nose: up pulling away and in a boost, down under braking
      // A boost that fires throws the nose up (2026-11-17), settling to a lift while it lasts
      if (reading.fired > firedSeen) rear = 0.1 + 0.12 * reading.power
      firedSeen = reading.fired
      rear = ease(rear, 0, 5, seconds)
      const targetPitch =
        Math.max(-0.08, Math.min(0.07, accel * 0.004)) + (look.boosting ? 0.05 : 0) + rear
      pitch = ease(pitch, targetPitch, 9, seconds)
      bob += seconds * (2.3 + speedShare * 3)

      // The change of shape: every part to its place, the body lower
      const open = morphEase(reading.morph)
      if (reading.morph !== shaped) {
        shaped = reading.morph
        for (const morph of morphs) morph(reading.morph)
      }
      chassis.rotation.z = roll
      chassis.rotation.x = pitch
      chassis.position.y =
        HOVER -
        MORPH_DROP * open +
        Math.sin(bob) * (0.045 - speedShare * 0.02) +
        Math.sin(bob * 7.3) * 0.006 * speedShare

      // The driver: into the turn, thrown back by a boost and by pulling away, forward under
      // braking; the head looks where they steer; stunned, they sway and the head lolls
      const heat = reading.heat
      lean = ease(lean, -look.steer * 0.16 - look.drift * 0.12, 8, seconds)
      thrown = ease(
        thrown,
        Math.max(-0.16, Math.min(0.12, accel * 0.006)) + heat * 0.24 + rear * 0.8,
        10,
        seconds,
      )
      sway += seconds * (dazed > 0 ? 9 : 0)
      const { torso, head, arms } = driver
      torso.rotation.z = lean + Math.sin(sway) * 0.3 * dazed
      torso.rotation.x = thrown + Math.cos(sway * 0.7) * 0.12 * dazed
      head.rotation.y = -look.steer * 0.3 - look.drift * 0.15
      head.rotation.z = Math.sin(sway * 1.3 + 1) * 0.35 * dazed
      head.rotation.x = -thrown * 0.5 + Math.cos(sway * 1.1) * 0.2 * dazed
      bar.rotation.y = -look.steer * 0.45
      // The arms stay on the bar: they reach as the torso goes back, and follow the bar round
      for (const arm of arms) arm.rotation.set(-thrown * 0.9 - 0.3 * dazed, -look.steer * 0.3, 0)

      // The lit parts: the thruster mouths by the speed, white-hot in the boost's own colour; the
      // core by how far the shape has opened; the tail lamps brighter under braking
      if (!ghost) {
        flameColour.set(BOOST_FX[reading.last].flame)
        tint.copy(glowColour).lerp(flameColour, heat)
        mouth.color.copy(tint).multiplyScalar((0.55 + speedShare * 0.45 + heat * 1.4) * bright)
        const pulse = 1 + Math.sin(bob * 5) * 0.12 * open
        core.color
          .copy(glowColour)
          .lerp(flameColour, heat * 0.35)
          .multiplyScalar((0.1 + 0.9 * Math.min(1, open)) * pulse * (1 + (bright - 1) * 1.3))
        braking = ease(braking, accel < -8 ? 1 : 0, 14, seconds)
        tailLamp.color.copy(tailColour).multiplyScalar((0.55 + braking * 0.9) * bright)
      }
      if (under && underMaterial) {
        // The glow spreads and dims as the body rises on its bob, and takes the boost's colour
        const lift = chassis.position.y - HOVER
        under.scale.set(1 + lift * 2 + open * 0.25, 1 + lift * 2 + open * 0.2, 1)
        underMaterial.opacity = 0.7 - lift * 2 + heat * 0.15
        underMaterial.color.copy(glowColour).lerp(flameColour, heat * 0.4)
      }
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}
