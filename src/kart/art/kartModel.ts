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
  Box3,
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
  Euler,
  Matrix4,
  Quaternion,
  Raycaster,
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
import { bodyDetailTexture, wearDecal, type BodyDetailLevel } from './bodyDetail.ts'
import { buildDriver, STANDING_HIP, type DriverDetail } from './driverModel.ts'
import { blendPose, gesturePose, REST, type DriverGesture, type GesturePose } from '../driverGestures.ts'
import { driveJoints, elbowBend, reachArm } from '../driverRig.ts'
import {
  poseLeg,
  seatedLegs,
  standingLegs,
  STILL_LEGS,
  type HandShape,
  type LegDrive,
} from '../driverLimbs.ts'
import {
  landingKick,
  SPRING_REST,
  springTarget,
  stepSpring,
  throttleOf,
  thrusterGlow,
  vaneAngle,
} from '../kartMotion.ts'
import { buildKartBody } from './vehicleBodies.ts'
import {
  bell,
  carbonTexture,
  createPaintMaterial,
  markPaint,
  mergeTree,
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
  /**
   * 2026-11-20 (§4.47, driverGestures.ts): what the driver does besides drive: look round on the
   * grid, wave, punch the air, cheer. Left out, they drive
   */
  readonly gesture?: DriverGesture
  /**
   * 2026-11-23 (§4.86, kartMotion.ts): the throttle as pressed, 0 to 1 (this browser's own kart):
   * the thrusters' halo follows it. Left out, it is read from how the kart gathers speed
   */
  readonly throttle?: number
  /** 2026-11-23: stunned this much at least, 0 to 1, whatever the scene says (a screenshot's pose) */
  readonly dazed?: number
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
  /** How hard it brakes now, 0 to 1, eased (the tail lamps; a night track's red glow behind) */
  braking(): number
  /**
   * 2026-11-20 (docs/KART-PERF.md): far off, the kart is drawn as a few merged meshes standing still
   * (its shape open or closed as the boost has it, the driver at rest), a draw a material; near, as
   * itself. Only a model built with `far` (KartDetail) can be far
   */
  detail(far: boolean): void
  dispose(): void
}

/**
 * 2026-11-23: the box round what is solid and shown of `root` (not the glows, the flames or anything
 * hidden), in its parent's frame as it stands now: where a standing driver goes, and how the race
 * room's cards frame a kart (src/kart/lobby/lobbyStage.ts)
 */
export function solidBox(root: Object3D, into = new Box3()): Box3 {
  into.makeEmpty()
  root.updateMatrixWorld(true)
  const inverse = root.parent ? root.parent.matrixWorld.clone().invert() : null
  const part = new Box3()
  root.traverseVisible((object) => {
    if (!(object instanceof Mesh)) return
    const material = object.material as Material | Material[]
    const glow = (Array.isArray(material) ? material : [material]).some(
      (one) => one.blending === AdditiveBlending || one.transparent,
    )
    if (glow) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    part.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld)
    if (inverse) part.applyMatrix4(inverse)
    into.union(part)
  })
  return into
}

/** Standing (the race room): this far out from the kart's side, this far ahead of the seat, turned so */
const STAND_ACROSS = 0.34
const STAND_AHEAD = -0.35
const STAND_TURN = 0.22

/** How high the body floats over the road, metres */
const HOVER = 0.27
/** How far a bike leans into a turn on grip, flat out and at full lock, radians (about 30°) */
const BIKE_LEAN = 0.52
/** How much lower it rides with its shape open */
const MORPH_DROP = 0.07
/** 2026-11-23 (§4.86): the yoke's grips this far either side of its middle, where the hands go */
const GRIP = 0.13

/** What the scene lends a kart's paint (Scene.ts): the environment to reflect, and how bright to glow */
export interface KartFinish {
  /** kartParts.ts's environment map; none, and the paint is plain */
  readonly environment?: Texture | null
  /**
   * How much brighter than white the lit parts are drawn: above 1 only where the picture is
   * developed afterwards (post.ts), which turns the excess into a glow
   */
  readonly glow?: number
  /**
   * The body's fine detail by the quality (2026-11-22, bodyDetail.ts): seams, screws and worn
   * decals on medium, the scratches, the grain and the fine twill too on high; none when left out
   */
  readonly detail?: BodyDetailLevel
  /**
   * 2026-11-23 (§4.86, driverModel.ts): how much of the driver is drawn and moved by the quality:
   * low merges a plain driver standing still (hands on the wheel) and leaves out the thrusters'
   * halo; only high has the nose's vanes. Left out, the full driver (and the vanes)
   */
  readonly driver?: DriverDetail
}

/** 2026-11-20 (docs/KART-PERF.md): what a model keeps besides its full self */
export interface KartDetail {
  /** A far version to draw at a distance (another racer's kart) */
  readonly far?: boolean
  /**
   * Its shadow cast by one merged stand-in rather than by every part (this browser's own kart,
   * where the scene has shadows)
   */
  readonly shadowProxy?: boolean
  /**
   * 2026-11-23 (#151): the driver standing in front of the kart, a little to one side, facing the
   * same way (the race room's place cards, src/kart/lobby/lobbyStage.ts); in a race they sit
   */
  readonly standing?: boolean
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
  // 2026-11-20, the item series: `pelican` a beak over its pouch, `otter` a stone held up in two
  // paws, `cormorant` a hooked head on a long neck
  pelican: [
    [[[1, 4], [15, 6], [15, 7.6], [1, 6.4]], 'ink'],
    [[[3, 7.4], [14, 8.4], [10, 14], [5, 13]], 'accent'],
  ],
  otter: [
    [[[5.4, 3], [10.6, 3], [12, 7], [8, 9.4], [4, 7]], 'accent'],
    [[[2, 9], [6, 11], [5, 14], [1, 12]], 'ink'],
    [[[14, 9], [15, 12], [11, 14], [10, 11]], 'ink'],
  ],
  cormorant: [
    [[[4, 15], [6, 4], [12, 1], [15, 4], [12, 3.8], [8.4, 6], [7, 15]], 'accent'],
    [[[12, 3.8], [15, 4], [13.4, 6.6]], 'ink'],
  ],
  // 2026-11-21, the first season's flagship: `kite` spread wings over its forked tail
  kite: [
    [[[1, 6], [8, 3], [15, 6], [11, 7.4], [8, 6.4], [5, 7.4]], 'accent'],
    [[[6.4, 7.4], [9.6, 7.4], [11, 15], [8, 11.6], [5, 15]], 'ink'],
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
  extra: KartDetail = {},
): KartModel {
  const colours = kartBodies[body]
  const environment = finish.environment ?? null
  const bright = finish.glow ?? 1
  const detailLevel: BodyDetailLevel = ghost ? 'off' : (finish.detail ?? 'off')
  // 2026-11-23 (§4.86): the driver's detail; on low the driver stands still, merged
  const driverDetail: DriverDetail = finish.driver ?? 'high'
  const lowDriver = driverDetail === 'low'
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
  const colour = (color: string, roughness = 0.35, metalness = 0.55, emissive = 0): Material => {
    if (ghostPaint) return ghostPaint
    const material = own(
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
    return markPaint(material, {
      color: material.color.clone(),
      roughness,
      metalness,
      emissive: material.emissive.clone().multiplyScalar(emissive),
      env: environment ? 1.15 : 0,
      woven: false,
    })
  }
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
  // 2026-11-20 (docs/KART-PERF.md): every paint of a moving part drawn as one (kartParts.ts's flatten)
  let paintAll: Material | undefined
  if (!carbon) {
    const weave = carbonTexture(detailLevel === 'high')
    textures.push(weave)
    const woven = own(
      new MeshStandardMaterial({
        color: kartParts.metal,
        map: weave,
        roughness: 0.42,
        metalness: 0.5,
        envMap: environment,
        envMapIntensity: 0.9,
      }),
    )
    carbon = markPaint(woven, {
      color: woven.color.clone(),
      roughness: 0.42,
      metalness: 0.5,
      emissive: new Color(0, 0, 0),
      env: environment ? 0.9 : 0,
      woven: true,
    })
    paintAll = own(createPaintMaterial(environment, weave, bodyDetailTexture(detailLevel)))
  }
  const glowColour = new Color(colours.glow)
  const core = lit(colours.glow)
  const mouth = lit(colours.glow)
  const tailLamp = lit(kartParts.tailLamp)
  const tailColour = new Color(kartParts.tailLamp)
  const strip = lit(colours.glow, 0.8)
  // The soft round glow: the pool under the kart and (2026-11-23) the halo behind each thruster
  const glowMap = ghost ? null : glowTexture()
  if (glowMap) textures.push(glowMap)
  const halo =
    glowMap && !lowDriver
      ? own(
          new MeshBasicMaterial({
            map: glowMap,
            color: colours.glow,
            transparent: true,
            opacity: 0.2,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        )
      : null
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
        ? decalTexture(128, 64, (context, width, height) => {
            paintNumber(context, width, height, DRIVER_NUMBERS[driverId], kartDrivers[driverId].crest)
            if (detailLevel !== 'off') wearDecal(context, width, height, Number.parseInt(DRIVER_NUMBERS[driverId], 10) || 7)
          })
        : decalTexture(64, 64, (context, size) => {
            paintMark(context, size, body, colours.accent)
            if (detailLevel !== 'off') wearDecal(context, size, size, body.length * 31)
          })
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
    ...(paintAll ? { allPaint: paintAll } : {}),
    put,
    colour,
    morph: (object, to) => morphs.push(morphOf(object, to, morphEase)),
    nozzle(parent, x, y, z, radius) {
      put(parent, bell(radius, 0.44), paint.metal, x, y, z)
      put(parent, hoop(radius * 0.96, 0.02), paint.glow, x, y, z)
      put(parent, new CircleGeometry(radius * 0.7, 16), mouth, x, y, z - 0.1)
      // A halo behind the mouth, as strong as the throttle (2026-11-23, kartMotion.ts)
      if (halo) put(parent, new PlaneGeometry(radius * 3.6, radius * 3.6), halo, x, y, z + 0.02).castShadow = false
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
  // bike (2026-11-19), low bars over the tank instead: a clip-on each side of a small read-out.
  // 2026-11-23 (§4.86): the yoke turns about its column (`wheel`) and the driver's hands go with it
  const bar = bike
    ? hinge(chassis, 0, bike.bar.y, bike.bar.z)
    : hinge(chassis, 0, seat.y + 0.4, seat.z - 0.46)
  const wheel = bike ? bar : hinge(bar)
  if (bike) {
    put(bar, new BoxGeometry(0.09, 0.03, 0.05), paint.carbon, 0, -0.01, -0.03)
    put(bar, new BoxGeometry(0.06, 0.012, 0.03), paint.glow, 0, 0.01, -0.03)
    for (const side of [-1, 1]) {
      const grip = put(bar, new CylinderGeometry(0.02, 0.02, 0.17, 6), paint.dark, side * 0.12, -0.01, 0.015)
      grip.rotation.set(0.25, 0, side * -1.3)
    }
  } else {
    put(bar, new CylinderGeometry(0.02, 0.026, 0.3, 6), paint.metal, 0, -0.1, -0.1).rotation.x = -0.8
    // The yoke: a carbon body, a lit read-out, a mark at the top (it shows the wheel turn), paddles
    // behind and a grip each side
    put(wheel, new BoxGeometry(0.22, 0.075, 0.03), paint.carbon)
    put(wheel, new BoxGeometry(0.11, 0.035, 0.012), paint.glow, 0, 0.005, 0.02)
    put(wheel, new BoxGeometry(0.022, 0.014, 0.034), paint.accent, 0, 0.042, 0)
    for (const side of [-1, 1]) {
      put(wheel, new BoxGeometry(0.04, 0.13, 0.045), paint.dark, side * GRIP, 0, 0)
      put(wheel, new BoxGeometry(0.05, 0.035, 0.008), paint.metal, side * 0.075, 0.03, -0.024)
    }
  }

  // The driver (driverModel.ts), mounted at the seat: seated in a kart, astride a bike
  const standing = extra.standing ?? false
  const crouch = standing ? 0 : (bike?.crouch ?? 0)
  // Standing, they stand on the ground beside the cockpit, off to the left of it as seen from in
  // front, turned a little towards the kart
  const driver = buildDriver(kit, driverId, driverDetail)
  if (standing) {
    const box = solidBox(chassis)
    driver.group.position.set(box.max.x + STAND_ACROSS, STANDING_HIP, seat.z + STAND_AHEAD)
    driver.group.rotation.y = STAND_TURN
    group.add(driver.group)
  } else {
    driver.group.position.set(0, seat.y, seat.z)
    chassis.add(driver.group)
  }

  // 2026-11-23 (§4.86, driverRig.ts): the skeleton. The joints from the drive and the gesture, the
  // hands on the wheel (two bones from each shoulder to its grip), or raised off it by the gesture.
  // 2026-11-23 (§4.91, driverLimbs.ts): and the legs, seated on the pedals (pressed with the throttle
  // and the brake, swung out of a turn, pressed up by a landing) or standing (the weight from foot to
  // foot, a step, a jump); and the fingers: round the grip on the wheel, the gesture's shape off it
  const { pelvis, torso, head, arms, elbows, hips, knees, ankles } = driver
  const ikTurn = new Quaternion()
  const gestureTurn = new Quaternion()
  const turnBy = new Euler(0, 0, 0, 'ZXY')
  const toTorso = new Matrix4()
  const grip = new Vector3()
  const pole = new Vector3()
  // On their feet the arms hang a little out from the sides, the elbows just bent
  const hanging = [-1, 1].map((side) => new Quaternion().setFromEuler(new Euler(0.06, 0, side * 0.1)))
  const seatedY = torso.position.y
  const shapes: [HandShape, HandShape] = ['grip', 'grip']
  const stillLegs: LegDrive = { ...STILL_LEGS, bike: bike !== undefined }
  const poseDriver = (
    joints: ReturnType<typeof driveJoints>,
    g: GesturePose,
    legDrive: LegDrive = stillLegs,
  ): void => {
    // On their feet (the race room) nothing of the drive moves them: only the gesture
    const drive = standing ? 0 : 1
    // The legs first: they say where the pelvis is, and the torso rides on it
    const legs = standing ? standingLegs(g) : seatedLegs(legDrive, g)
    pelvis.position.set(...legs.pelvis)
    pelvis.rotation.z = legs.pelvisRoll
    for (const index of [0, 1] as const) {
      const { knee } = poseLeg(legs, index, hips[index]!.quaternion, ankles[index]!.quaternion)
      knees[index]!.rotation.x = knee
    }
    torso.rotation.set(
      joints.torsoBack * drive + g.torsoBack,
      joints.torsoTwist * drive + g.twist,
      // Standing, the shoulders tip against the hips' roll (the weight on one foot)
      joints.torsoLean * drive - legs.pelvisRoll * 0.75,
    )
    // Standing, the bounce is the pelvis's (legs.pelvis); seated, the torso rises off the seat
    torso.position.y = seatedY + (standing ? 0 : g.bounce)
    head.rotation.set(
      joints.headUp * drive + g.headUp,
      joints.headTurn * drive + g.headTurn,
      joints.headRoll * drive + g.headTilt,
    )
    if (bike) bar.rotation.y = -joints.wheel * 0.4
    else wheel.rotation.z = -joints.wheel
    wheel.updateMatrix()
    bar.updateMatrix()
    pelvis.updateMatrix()
    torso.updateMatrix()
    toTorso.multiplyMatrices(pelvis.matrix, torso.matrix).invert()
    for (const [index, arm] of arms.entries()) {
      const left = index === 0
      const side = left ? -1 : 1
      let reach = 0.2
      if (standing) ikTurn.copy(hanging[index]!)
      else {
        // The grip, from the wheel to the chassis, to the seat (not turned), to the torso, to the shoulder
        if (bike) grip.set(side * 0.15, -0.01, 0.015)
        else grip.set(side * GRIP, 0, 0.01).applyMatrix4(wheel.matrix)
        grip.applyMatrix4(bar.matrix).sub(driver.group.position).applyMatrix4(toTorso).sub(arm.position)
        // The elbows out to the sides and a little down and back
        pole.set(side, -0.55, 0.35)
        reach = reachArm(grip, pole, ikTurn)
      }
      const up = (left ? g.leftUp : g.rightUp) + joints.loose[index]! * drive
      turnBy.set(up, 0, left ? g.leftOut : -g.rightOut)
      gestureTurn.setFromEuler(turnBy)
      arm.quaternion.multiplyQuaternions(gestureTurn, ikTurn)
      elbows[index]!.rotation.x = elbowBend(reach, up, left ? g.leftBend : g.rightBend)
      // The fingers: round the grip while the hand is on the wheel; off it, what the gesture shows
      const off = standing || Math.abs(up) > 0.6
      const asked = left ? g.leftHand : g.rightHand
      shapes[index] = !off ? 'grip' : !left && g.vSign >= 0.5 ? 'vee' : (asked ?? (standing ? 'relax' : 'fist'))
    }
    driver.setHands(shapes[0], shapes[1])
  }
  const STILL_JOINTS = driveJoints({
    steer: 0,
    drift: 0,
    heat: 0,
    surge: 0,
    dazed: 0,
    sway: 0,
    bike: bike !== undefined,
    crouch,
  })
  poseDriver(STILL_JOINTS, REST)
  // Low (a race on the low quality): the driver as it sits now, merged and never moved again
  const rigged = !lowDriver || standing
  if (!rigged) {
    driver.group.updateMatrixWorld(true)
    const pieces: Mesh[] = []
    driver.group.traverseVisible((object) => {
      if (object instanceof Mesh) pieces.push(object)
    })
    const merged = mergeTree(driver.group, pieces, keep)
    driver.group.clear()
    for (const mesh of merged) {
      mesh.castShadow = shadows
      driver.group.add(mesh)
    }
  }

  // 2026-11-23 (§4.86, kartMotion.ts): a vane standing on each side of the nose, turning with the
  // steering; found by looking straight down onto the body ahead of the cockpit. On the high quality
  // only (two draws a kart), and not on a bike (its bars turn) or a ghost
  const vanes: Group[] = []
  if (!bike && !ghost && driverDetail === 'high') {
    const bounds = solidBox(chassis)
    const surfaces: Mesh[] = []
    chassis.traverseVisible((object) => {
      if (!(object instanceof Mesh)) return
      const material = object.material as Material
      if (material.transparent || material.blending === AdditiveBlending) return
      if (driver.group.getObjectById(object.id)) return
      surfaces.push(object)
    })
    const caster = new Raycaster()
    const down = new Vector3(0, -1, 0)
    const from = new Vector3()
    const halfWidth = Math.min(-bounds.min.x, bounds.max.x)
    for (const ahead of [0.6, 0.48, 0.36]) {
      const found = [-1, 1].map((side) => {
        from.set(side * halfWidth * 0.62, bounds.max.y + 0.5, bounds.min.z * ahead)
        caster.set(from, down)
        const hit = caster.intersectObjects(surfaces, false)[0]
        return hit ? chassis.worldToLocal(hit.point.clone()) : null
      })
      if (found.some((spot) => spot === null)) continue
      for (const spot of found) {
        const vane = hinge(chassis, spot!.x, spot!.y - 0.005, spot!.z)
        put(vane, new BoxGeometry(0.05, 0.012, 0.12), paint.carbon, 0, 0.006, 0.03)
        put(vane, new BoxGeometry(0.014, 0.085, 0.2), paint.accent, 0, 0.05, 0.04)
        put(vane, new BoxGeometry(0.018, 0.01, 0.18), paint.glow, 0, 0.095, 0.04)
        vanes.push(vane)
      }
      break
    }
  }

  // Where the thruster mouths are with the shape closed, in the kart's own frame
  group.updateMatrixWorld(true)
  const spot = new Vector3()
  const thrusters = nozzles.map((nozzle): [number, number, number] => {
    group.worldToLocal(nozzle.getWorldPosition(spot))
    return [spot.x, spot.y, spot.z]
  })
  // Everything built: one mesh for each material in each moving part
  flatten(chassis, keep, shadows, paintAll)
  if (standing) flatten(driver.group, keep, shadows, paintAll)

  // 2026-11-20 (docs/KART-PERF.md): the far version, closed and open, and the shadow's stand-in, all
  // made from the parts as they now stand (at rest), riding on the chassis so that they still bob,
  // bank and pitch
  const parts: Mesh[] = []
  chassis.traverse((object) => {
    if (object instanceof Mesh) parts.push(object)
  })
  const farLooks: Group[] = []
  if (extra.far && !ghost) {
    const shapes = morphs.length > 0 ? [0, 1] : [0]
    for (const shape of shapes) {
      for (const morph of morphs) morph(shape)
      const look = new Group()
      for (const mesh of mergeTree(chassis, parts, keep)) look.add(mesh)
      look.visible = false
      farLooks.push(look)
    }
    for (const morph of morphs) morph(0)
    for (const look of farLooks) chassis.add(look)
  }
  // The shadow's stand-ins, closed and open: drawn into the shadow map only (they write nothing to
  // the picture), one draw where the parts were one a material and a moving part
  const stands: Mesh[] = []
  if (extra.shadowProxy && shadows && !ghost) {
    const unseen = own(new MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
    const shapes = morphs.length > 0 ? [0, 1] : [0]
    for (const shape of shapes) {
      for (const morph of morphs) morph(shape)
      for (const stand of mergeTree(chassis, parts, keep, unseen)) {
        stand.castShadow = true
        stand.visible = shape === 0
        stands.push(stand)
      }
    }
    for (const morph of morphs) morph(0)
    for (const stand of stands) chassis.add(stand)
    for (const mesh of parts) mesh.castShadow = false
  }
  let far = false

  // The glow on the road beneath, and the pool of the head lamps ahead: not on a ghost
  let under: Mesh | null = null
  let underMaterial: MeshBasicMaterial | null = null
  if (glowMap) {
    const texture = glowMap
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
  // The driver's gesture (§4.47): which, how long into it, the pose eased toward it, and where in a
  // looping gesture this driver is, so that a grid of them does not move as one
  let gesture: DriverGesture | undefined
  let gestureSeconds = 0
  let gestured: GesturePose = REST
  const gestureSeed = Math.random()
  // 2026-11-23 (§4.86, kartMotion.ts): the spring under the body, the landings seen and how long it
  // has flown; the steering, the slide and the throttle as the driver and the thrusters follow them
  let spring = SPRING_REST
  let landingsSeen = 0
  let airTime = 0
  let steered = 0
  let slid = 0
  let throttled = 0
  /** The nose thrown up by a boost that fired, radians, dying away; and the boosts seen so far */
  let rear = 0
  let firedSeen = 0
  let lastSpeed = 0
  let bob = 0
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
    braking: () => braking,
    detail(wanted) {
      if (farLooks.length === 0 || wanted === far) return
      far = wanted
      for (const mesh of parts) mesh.visible = !far
      if (!far) for (const look of farLooks) look.visible = false
    },
    update(look, seconds, hit = 0) {
      const dazed = Math.max(hit, look.dazed ?? 0)
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
      if (stands.length > 1) {
        const open = reading.morph >= 0.5
        stands[0]!.visible = !open
        stands[1]!.visible = open
      }
      if (far) {
        const shown = farLooks.length > 1 && reading.morph >= 0.5 ? 1 : 0
        farLooks.forEach((look, index) => (look.visible = index === shown))
      }
      if (reading.morph !== shaped) {
        shaped = reading.morph
        for (const morph of morphs) morph(reading.morph)
      }
      chassis.rotation.z = roll
      chassis.rotation.x = pitch
      // A bike leans about the line it rides on, not about its own middle: its pads stay over the
      // road and the rider's head goes in towards the corner
      chassis.position.x = bike ? -Math.sin(roll) * HOVER : 0
      // The spring: squatting as it pulls away, up a little in the air, pressed down by a landing
      const landed = (look.landings ?? 0) > landingsSeen
      landingsSeen = look.landings ?? 0
      if (look.airborne) airTime += seconds
      spring = stepSpring(
        spring,
        springTarget(accel, look.airborne ?? false, reading.heat),
        seconds,
        landed ? landingKick(airTime) : 0,
      )
      if (landed || !look.airborne) airTime = 0
      chassis.position.y =
        spring.height +
        HOVER -
        (bike ? (1 - Math.cos(roll)) * HOVER : 0) -
        MORPH_DROP * open +
        Math.sin(bob) * (0.045 - speedShare * 0.02) +
        Math.sin(bob * 7.3) * 0.006 * speedShare

      // The driver (§4.86, driverRig.ts): into the turn, thrown back by a boost and by pulling away,
      // forward under braking, the shoulders and the head to the inside of a drift, the wheel turned
      // and the hands with it; stunned, they sway, the head lolls and the hands come loose
      const heat = reading.heat
      steered = ease(steered, look.steer, 8, seconds)
      slid = ease(slid, look.drift, 8, seconds)
      thrown = ease(thrown, Math.max(-0.16, Math.min(0.12, accel * 0.006)) + rear * 0.8, 10, seconds)
      sway += seconds * (dazed > 0 ? 9 : 0)
      if (look.gesture !== gesture) {
        gesture = look.gesture
        gestureSeconds = 0
      }
      gestureSeconds += seconds
      if (rigged && !far) {
        gestured = blendPose(
          gestured,
          gesture ? gesturePose(gesture, gestureSeconds, gestureSeed, driverId) : REST,
          1 - Math.exp(-14 * seconds),
        )
        poseDriver(
          driveJoints({
            steer: steered,
            drift: slid,
            heat,
            surge: thrown,
            dazed,
            sway,
            bike: bike !== undefined,
            crouch,
          }),
          gestured,
          {
            steer: steered,
            pedal: throttled,
            brake: braking,
            // Pressed into the seat by a landing (the spring below its rest)
            squash: Math.min(1, Math.max(0, -spring.height / 0.1)),
            bike: bike !== undefined,
          },
        )
      }
      if (!far) {
        const turn = -vaneAngle(steered, slid, speedShare)
        for (const vane of vanes) vane.rotation.y = turn
      }

      // The lit parts: the thruster mouths by the speed, white-hot in the boost's own colour; the
      // core by how far the shape has opened; the tail lamps brighter under braking
      if (!ghost) {
        flameColour.set(BOOST_FX[reading.last].flame)
        tint.copy(glowColour).lerp(flameColour, heat)
        // The thrusters by the throttle too (kartMotion.ts): the mouths, and the halo behind them
        throttled = ease(throttled, throttleOf(look.throttle, accel, speedShare), 12, seconds)
        const burn = thrusterGlow(throttled, speedShare, heat)
        mouth.color.copy(tint).multiplyScalar(burn.mouth * bright)
        if (halo) {
          halo.opacity = burn.halo * 0.75
          halo.color.copy(tint)
        }
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
      driver.skeleton?.dispose()
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}
