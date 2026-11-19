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
// 2026-11-18, later the same day (owner: "more esports ... it looks like a child's toy"): the look
// is a race team's. Satin black and carbon with one neon colour a kart, a livery (the driver's
// racing number and the kart's own abstract sign, drawn here on a canvas: no real brand), and lit
// lines that brighten with the speed and blaze in a boost.
//
// The driver (driverModel.ts, e10-t05b) is a racer of a person's proportions, one of four, mounted
// at the body's seat: any driver in any kart. They lean into a turn, are thrown back by a boost, and sway when a hit stuns
// them. A kart's numbers are in shared/kart/karts.ts; the model is looks only. The footprint matches
// the physics: about 1.5 m wide and 2.6 m long (KART_RADIUS 1.2).
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
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
import { DRIVER_NUMBERS, type DriverId } from '../../../shared/kart/karts.ts'
import {
  kartBodies,
  kartDrivers,
  kartHover,
  kartLivery,
  kartParts,
  kartScene,
} from '../../styles/kartTokens.ts'
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
import { buildKartBody } from './vehicleBodies.ts'
import {
  bell,
  carbonTexture,
  decalTexture,
  flatten,
  hinge,
  hoop,
  morphOf,
  type BodyKit,
  type DecalKind,
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
   * Which boost runs (2026-11-18, boostFx.ts: spread `boostFx(kind)` into the look): 'team' is a
   * team race's team boost, blue. Left out (another racer's kart, a replay: the wire has one bit),
   * it is worked out from how long it runs
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
const HOVER = 0.27
/** How far a bike leans into a turn on grip, flat out and at full lock, radians (about 30°) */
const BIKE_LEAN = 0.52
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

/** The racing number, slanted, with a bar under it: white over the driver's colour */
function paintNumber(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  accent: string,
): void {
  context.setTransform(1, 0, -0.22, 1, height * 0.2, 0)
  context.fillStyle = accent
  context.fillRect(width * 0.04, height * 0.84, width * 0.8, height * 0.1)
  context.fillStyle = kartLivery.ink
  context.font = `900 ${Math.round(height * 0.86)}px "Saira", "Arial Black", "Arial", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.fillText(text, width * 0.44, height * 0.78, width * 0.8)
}

type Outline = readonly (readonly [number, number])[]

/**
 * Each kart's own abstract sign, on a 16 by 16 grid: a few slanted bars and cuts, all ours. `tide`
 * three rising chevrons, `comet` a head and its streaks, `ray` a delta, `crab` two pincers, `heron`
 * a long stroke and a short one, `flyfish` a fan. Each bar is an outline and whether it is in the
 * kart's colour (the rest are white, or a cut)
 */
const MARKS: Readonly<Record<KartBody, readonly (readonly [Outline, 'accent' | 'ink' | 'cut'])[]>> = {
  tide: [
    [[[1, 5], [8, 2], [15, 5], [15, 7], [8, 4], [1, 7]], 'ink'],
    [[[1, 9], [8, 6], [15, 9], [15, 11], [8, 8], [1, 11]], 'accent'],
    [[[1, 13], [8, 10], [15, 13], [15, 15], [8, 12], [1, 15]], 'accent'],
  ],
  comet: [
    [[[9, 3], [15, 8], [9, 13], [7, 8]], 'accent'],
    [[[1, 6], [6, 6], [5, 7.4], [1, 7.4]], 'ink'],
    [[[2, 8.6], [5.6, 8.6], [6, 10], [2, 10]], 'ink'],
  ],
  ray: [
    [[[8, 1], [15, 14], [1, 14]], 'accent'],
    [[[8, 6], [11.4, 12.4], [4.6, 12.4]], 'cut'],
    [[[7.4, 12.4], [8.6, 12.4], [8.6, 15.5], [7.4, 15.5]], 'ink'],
  ],
  crab: [
    [[[7, 1], [2, 8], [7, 15], [7, 12], [4.6, 8], [7, 4]], 'accent'],
    [[[9, 1], [14, 8], [9, 15], [9, 12], [11.4, 8], [9, 4]], 'ink'],
  ],
  heron: [
    [[[11, 1], [14, 1], [6, 15], [3, 15]], 'accent'],
    [[[5, 1], [7.4, 1], [3.6, 8], [1.2, 8]], 'ink'],
  ],
  flyfish: [
    [[[1, 13], [3, 15], [15, 4], [15, 1]], 'accent'],
    [[[1, 9], [1, 11.4], [11, 1], [8, 1]], 'ink'],
    [[[6, 15], [9, 15], [15, 9.4], [15, 7]], 'ink'],
  ],
  // 2026-11-19: `dolphin` an arc and its fin, `skipper` two leaps, `shrimp` three plates, `marlin` a
  // spear and a sail, `eel` a wave, `squid` an arrow backwards, `hermit` a turn of the shell,
  // `whale` a fluke, `swift` a forked tail, `hornet` three bands, `petrel` a cranked wing
  dolphin: [
    [[[1, 12], [5, 6], [11, 4], [15, 7], [11, 6.4], [6, 8.4], [3.4, 13]], 'accent'],
    [[[8, 5], [11, 1], [11.6, 4.6]], 'ink'],
  ],
  skipper: [
    [[[1, 13], [5, 5], [9, 13], [7, 13], [5, 9], [3, 13]], 'accent'],
    [[[8, 11], [11.4, 4], [15, 11], [13, 11], [11.4, 7.6], [10, 11]], 'ink'],
  ],
  shrimp: [
    [[[1, 3], [10, 3], [8, 6.4], [1, 6.4]], 'accent'],
    [[[4, 7.4], [13, 7.4], [11, 10.8], [4, 10.8]], 'ink'],
    [[[7, 11.8], [15, 11.8], [13, 15], [7, 15]], 'accent'],
  ],
  marlin: [
    [[[1, 11], [15, 9], [15, 10.6], [1, 12.6]], 'ink'],
    [[[5, 9.6], [8, 2], [13, 8.4]], 'accent'],
  ],
  eel: [
    [[[1, 9], [4, 4], [8, 9], [11, 13], [15, 7], [15, 10], [11, 15.4], [8, 12], [4, 7], [1, 12]], 'accent'],
    [[[11, 3], [15, 3], [15, 5], [11, 5]], 'ink'],
  ],
  squid: [
    [[[15, 8], [9, 2], [9, 14]], 'accent'],
    [[[1, 4], [8, 6], [8, 7.4], [1, 5.4]], 'ink'],
    [[[1, 7.3], [8, 7.3], [8, 8.7], [1, 8.7]], 'ink'],
    [[[1, 10.6], [8, 8.6], [8, 10], [1, 12]], 'ink'],
  ],
  hermit: [
    [[[8, 1], [15, 8], [8, 15], [1, 8]], 'accent'],
    [[[8, 4.4], [11.6, 8], [8, 11.6], [4.4, 8]], 'cut'],
    [[[8, 6.6], [9.4, 8], [8, 9.4], [6.6, 8]], 'ink'],
  ],
  whale: [
    [[[8, 14], [1, 3], [5, 4], [8, 9], [11, 4], [15, 3]], 'accent'],
    [[[7.2, 10], [8.8, 10], [8.8, 15.5], [7.2, 15.5]], 'ink'],
  ],
  swift: [
    [[[1, 1], [8, 9], [15, 1], [15, 4], [8, 13], [1, 4]], 'accent'],
    [[[8, 4], [9.4, 6], [8, 8], [6.6, 6]], 'ink'],
  ],
  hornet: [
    [[[3, 2], [15, 2], [13, 5], [1, 5]], 'accent'],
    [[[3, 6.5], [15, 6.5], [13, 9.5], [1, 9.5]], 'ink'],
    [[[3, 11], [15, 11], [13, 14], [1, 14]], 'accent'],
  ],
  petrel: [
    [[[1, 10], [5, 4], [8, 8], [11, 4], [15, 10], [11, 7.4], [8, 11.4], [5, 7.4]], 'accent'],
    [[[7, 12.4], [9, 12.4], [8, 15]], 'ink'],
  ],
}

function paintMark(context: CanvasRenderingContext2D, size: number, body: KartBody, accent: string): void {
  const unit = size / 16
  for (const [outline, fill] of MARKS[body]) {
    context.beginPath()
    outline.forEach(([x, y], index) =>
      index === 0 ? context.moveTo(x * unit, y * unit) : context.lineTo(x * unit, y * unit),
    )
    context.closePath()
    context.fillStyle = fill === 'accent' ? accent : kartLivery[fill]
    context.fill()
  }
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
  const colour = (color: string, roughness = 0.35, metalness = 0.55, emissive = 0): Material =>
    ghostPaint ??
    own(
      new MeshStandardMaterial({
        color,
        roughness,
        metalness,
        envMap: environment,
        envMapIntensity: 1.15,
        // A neon panel: it keeps its colour in a shadow and at night, short of glowing
        emissive: emissive > 0 ? color : kartParts.dark,
        emissiveIntensity: emissive,
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
  const strip = lit(colours.glow, 0.8)
  // Satin black, a paler satin panel, and the one neon colour
  const paint = {
    main: colour(colours.main, 0.46, 0.55),
    second: colour(colours.second, 0.5, 0.45),
    accent: colour(colours.accent, 0.32, 0.35, 0.32),
    carbon,
    metal: colour(kartParts.metal, 0.22, 1),
    glass: colour(kartHover.glass, 0.06, 0.9),
    dark: colour(kartParts.dark, 0.7, 0.2),
    glow: strip,
    core,
    headLamp: lit(kartParts.headLamp),
    tailLamp,
  }

  const group = new Group()
  // Everything that floats: it bobs, banks and dips above the road; the glow beneath stays put
  const chassis = new Group()
  chassis.position.y = HOVER
  group.add(chassis)

  // The livery: the driver's number and the kart's sign, each drawn once and shared by its marks
  const decals = new Map<DecalKind, Material>()
  const decalPaint = (kind: DecalKind): Material => {
    const made = decals.get(kind)
    if (made) return made
    const map =
      kind === 'number'
        ? decalTexture(128, 64, (context, width, height) =>
            paintNumber(context, width, height, DRIVER_NUMBERS[driverId], kartDrivers[driverId].crest),
          )
        : decalTexture(64, 64, (context, size) => paintMark(context, size, body, colours.accent))
    textures.push(map)
    const material = own(
      new MeshStandardMaterial({
        map,
        alphaTest: 0.45,
        roughness: 0.5,
        metalness: 0.1,
        emissive: kartLivery.ink,
        emissiveMap: map,
        emissiveIntensity: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    decals.set(kind, material)
    return material
  }

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
    decal(parent, kind, w, l, x, y, z, face = 'up', tilt = 0) {
      if (ghost) return null
      const geometry = new PlaneGeometry(w, l)
      if (face === 'up') geometry.rotateX(-Math.PI / 2)
      else if (face === 'right') geometry.rotateY(Math.PI / 2)
      else if (face === 'left') geometry.rotateY(-Math.PI / 2)
      const mesh = put(parent, geometry, decalPaint(kind), x, y, z)
      mesh.castShadow = false
      mesh.rotation.x = tilt
      return mesh
    },
  }

  const { seat, rearContacts, bike } = buildKartBody(body, kit, chassis)

  // A yoke in front of the driver, on a column: two grips and a lit read-out between them. On a
  // bike (2026-11-19), low bars over the tank instead: a clip-on each side of a small read-out
  const bar = bike
    ? hinge(chassis, 0, bike.bar.y, bike.bar.z)
    : hinge(chassis, 0, seat.y + 0.4, seat.z - 0.46)
  if (bike) {
    put(bar, new BoxGeometry(0.09, 0.03, 0.05), paint.carbon, 0, -0.01, -0.03)
    put(bar, new BoxGeometry(0.06, 0.012, 0.03), paint.glow, 0, 0.01, -0.03)
    for (const side of [-1, 1]) {
      const grip = put(bar, new CylinderGeometry(0.02, 0.02, 0.17, 6), paint.dark, side * 0.12, -0.01, 0.015)
      grip.rotation.set(0.25, 0, side * -1.3)
    }
  } else {
    put(bar, new CylinderGeometry(0.02, 0.026, 0.3, 6), paint.metal, 0, -0.1, -0.1).rotation.x = -0.8
    put(bar, new BoxGeometry(0.2, 0.07, 0.03), paint.carbon)
    put(bar, new BoxGeometry(0.11, 0.035, 0.012), paint.glow, 0, 0.005, 0.02)
    for (const side of [-1, 1]) {
      put(bar, new BoxGeometry(0.035, 0.12, 0.04), paint.dark, side * 0.115, 0, 0)
    }
  }

  // The driver (driverModel.ts), mounted at the seat: seated in a kart, astride a bike
  const crouch = bike?.crouch ?? 0
  const driver = buildDriver(kit, driverId, bike !== undefined)
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
    under = new Mesh(keep(new PlaneGeometry(bike ? 1.3 : 2.2, 3.4)), underMaterial)
    under.rotation.x = -Math.PI / 2
    // Above the road, kerbs and lines (trackArt.ts LIFT), under the body
    under.position.y = 0.1
    group.add(under)
    const beam = new Mesh(
      keep(new PlaneGeometry(bike ? 1.6 : 2.6, 4.4)),
      pool(kartParts.headLamp, 0.14),
    )
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
      // A bike (2026-11-19) leans like one: far over in a turn, further in a drift, the rider with it
      const targetRoll = bike
        ? look.drift !== 0
          ? -look.drift * (0.5 + 0.12 * (look.skid ?? 1))
          : -look.steer * BIKE_LEAN * speedShare
        : look.drift !== 0
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
      // A bike leans about the line it rides on, not about its own middle: its pads stay over the
      // road and the rider's head goes in towards the corner
      chassis.position.x = bike ? -Math.sin(roll) * HOVER : 0
      chassis.position.y =
        HOVER -
        (bike ? (1 - Math.cos(roll)) * HOVER : 0) -
        MORPH_DROP * open +
        Math.sin(bob) * (0.045 - speedShare * 0.02) +
        Math.sin(bob * 7.3) * 0.006 * speedShare

      // The driver: into the turn, thrown back by a boost and by pulling away, forward under
      // braking; the head looks where they steer; stunned, they sway and the head lolls
      const heat = reading.heat
      // On a bike the rider goes over with it, and hangs off a little further into the turn
      lean = ease(
        lean,
        bike ? -look.steer * 0.1 - look.drift * 0.16 : -look.steer * 0.16 - look.drift * 0.12,
        8,
        seconds,
      )
      thrown = ease(
        thrown,
        Math.max(-0.16, Math.min(0.12, accel * 0.006)) + heat * 0.24 + rear * 0.8,
        10,
        seconds,
      )
      sway += seconds * (dazed > 0 ? 9 : 0)
      const { torso, head, arms } = driver
      torso.rotation.z = lean + Math.sin(sway) * 0.3 * dazed
      torso.rotation.x = crouch + thrown * (bike ? 0.6 : 1) + Math.cos(sway * 0.7) * 0.12 * dazed
      head.rotation.y = -look.steer * 0.3 - look.drift * 0.15
      head.rotation.z = Math.sin(sway * 1.3 + 1) * 0.35 * dazed
      head.rotation.x = -crouch * 0.9 - thrown * 0.5 + Math.cos(sway * 1.1) * 0.2 * dazed
      bar.rotation.y = -look.steer * 0.45
      // The arms stay on the bar: they reach as the torso goes back, and follow the bar round
      for (const arm of arms) {
        arm.rotation.set(-thrown * (bike ? 0.5 : 0.9) - 0.3 * dazed, -look.steer * 0.3, 0)
      }

      // The lit parts: the thruster mouths by the speed, white-hot in the boost's own colour; the
      // core by how far the shape has opened; the tail lamps brighter under braking
      if (!ghost) {
        flameColour.set(BOOST_FX[reading.last].flame)
        tint.copy(glowColour).lerp(flameColour, heat)
        mouth.color.copy(tint).multiplyScalar((0.55 + speedShare * 0.45 + heat * 1.4) * bright)
        // The lit lines: dim standing still, brighter with the speed, blazing in a boost
        strip.color
          .copy(glowColour)
          .lerp(flameColour, heat * 0.25)
          .multiplyScalar((0.4 + speedShare * 0.6 + heat * 0.9) * (1 + (bright - 1) * 0.8))
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
