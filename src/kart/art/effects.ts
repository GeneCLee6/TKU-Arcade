// e8-t07: what a kart leaves behind. Since the hover karts (2026-11-14): sparks spraying from the
// back corners in a drift, a little dust, glowing trails on the road in the kart's own colour that
// fade out behind it, and a flame from each thruster during a boost. Pooled and reused: nothing is
// made or freed while driving. 2026-11-14 (owner): dark skid marks too, left on the road by every
// drift and fading over several seconds, in a pool of their own with a cap. Then (the drift as a
// real slide): the sparks turn gold once the drift has earned its release boost and spray pale blue
// from both corners while the release window is open, and every boost fired bursts: a fan of sparks
// out of the back and the flames stretched long for a moment.
// 2026-11-17 (owner: "a perfect start has to feel like a launch; a drift needs the tyres' squeal and
// skid marks"; docs/KART-FEEL.md §7): the skid marks are as dark as the slide is deep (feelFx.ts),
// wider, and stay for most of a lap; braking hard marks the road too; the smoke is thick and rolls
// away to the outside; a boost leaves a trail of fire behind the thrusters all the while it runs, and
// the moment it fires a ring of light bursts out on the road under the kart, the bigger the harder
// it kicks.
// 2026-11-18 (owner: "the boost's effects need designing again"; boostFx.ts): every boost is one
// effect at four sizes and in four colours (an instant boost, a full one, a team boost in blue, a
// perfect start). The flame is a shaded jet with a pale heart, coloured tips and shock diamonds,
// riding on the thruster (so it follows the kart's change of shape); the thrusters flash when it
// lights; a full boost leaves ribbons of light behind the thrusters and throws sparks all the while;
// and when it fires a ring of light stands up behind the kart as well as the one on the road. What
// runs is read from the kart's model (kartModel.ts's `boost`), which works it out for a kart whose
// look only says that it boosts: another racer's kart gets all of it too, from smaller pools.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Object3D,
} from 'three'
import { kartHover, kartScene } from '../../styles/kartTokens.ts'
import { BOOST_FX } from '../boostFx.ts'
import { createParticleBatch } from './particles.ts'
import type { KartLook, KartModel } from './kartModel.ts'
import { loadSettings, PARTICLE_SHARE } from '../settings.ts'

/** Dust puffs alive at once, at most */
const FULL_PUFFS = 110
const PUFF_LIFE = 1.1
/** Smoke puffs a second from a slide just deep enough to mark the road, and how many more at full */
const PUFF_RATE = 16
const PUFF_RATE_MORE = 44
/** Sparks alive at once, at most */
const FULL_SPARKS = 150
const SPARK_LIFE = 0.45
/** A boost fired throws this many sparks out of the back at once ... */
const BURST_SPARKS = 36
/** ... and stretches the flames for this long */
const BURST_SECONDS = 0.45
/** Pieces of the fire a boost leaves behind the thrusters, alive at once at most ... */
const FULL_JETS = 160
const JET_LIFE = 0.22
/** ... this many a second from each thruster */
const JET_RATE = 100
/** The ring of light on the road when a boost fires: how long it lasts and how wide it gets, metres */
const RING_SECONDS = 0.42
/** The ring that stands up behind the kart when a full boost fires: how long it lasts */
const WAVE_SECONDS = 0.34
/** The flash at the thrusters when a boost lights */
const FLASH_SECONDS = 0.16
/** A full boost's flame, metres long and metres across at its widest, before the kart's own size */
const FLAME_LENGTH = 2.8
const FLAME_GIRTH = 0.27
/** The points of a ribbon of light behind a thruster, at most; one is laid every RIBBON_STEP metres */
const FULL_RIBBON = 30
const RIBBON_STEP = 0.3
/** A ribbon's point fades out over this many seconds */
const RIBBON_FADE = 0.3
const RIBBON_WIDTH = 0.2
/** Sparks a second out of the thrusters while a full boost runs */
const BOOST_SPARK_RATE = 46
/** Trail pieces kept: about two seconds of a drift, both corners; the oldest are laid over again */
const FULL_MARKS = 260
const MARK_WIDTH = 0.18
/** Just above the road and kerbs (trackArt.ts LIFT), under the kart's glow */
const MARK_HEIGHT = 0.085
/**
 * The longest piece laid in one frame, metres: a slow frame at boost speed still joins up (a reset,
 * which jumps further, lifts the trail first)
 */
const MAX_PIECE = 8
/** A trail fades out over this many seconds */
const MARK_FADE = 1.6
/** Skid mark pieces kept: about 50 s of sliding, both corners; the oldest are laid over again */
const FULL_SKIDS = 6000
const SKID_WIDTH = 0.5
/** A piece of trail or skid mark is laid once the corner has moved this far, metres */
const MIN_PIECE = 0.22
/** A landing (a hill track, 2026-11-17) leaves a dark mark for this long after touching down ... */
const LANDING_MARK_SECONDS = 0.16
/** ... and throws up this many puffs of dust */
const LANDING_PUFFS = 10
/** A skid mark fades out over this many seconds */
const SKID_FADE = 40
/** How dark a fresh skid mark of a deep slide is: its opacity */
const SKID_OPACITY = 0.9
/** The skid marks lie a hair under the trails, so that the glow draws over them */
const SKID_HEIGHT = MARK_HEIGHT - 0.004

export interface KartEffects {
  /** `pose.y` is the road's height under the kart on a hill track (2026-11-17); left out, 0 */
  update(
    pose: { x: number; z: number; heading: number; y?: number },
    look: KartLook,
    seconds: number,
  ): void
  /** Forgets the trails, as after a reset: the next drift does not join up with the last */
  lift(): void
  /**
   * Where the air shimmers behind the thrusters, in the world, and how strongly, 0 to 1 (post.ts
   * bends the picture there); null while nothing burns
   */
  heat(): HeatSpot | null
  dispose(): void
}

export interface HeatSpot {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly strength: number
}

const FLAME_VERTEX = /* glsl */ `
uniform float time;
varying float vAlong;
varying vec3 vNormal;
varying vec3 vSeen;
void main() {
  vAlong = uv.y;
  vec3 moved = position;
  // The jet wavers more the further from the thruster
  moved.x += sin(time * 37.0 + uv.y * 9.0) * 0.035 * uv.y;
  moved.y += cos(time * 29.0 + uv.y * 11.0) * 0.035 * uv.y;
  vec4 seen = modelViewMatrix * vec4(moved, 1.0);
  vNormal = normalMatrix * normal;
  vSeen = -seen.xyz;
  gl_Position = projectionMatrix * seen;
}`

const FLAME_FRAGMENT = /* glsl */ `
uniform float time;
uniform float gain;
uniform float lit;
uniform vec3 core;
uniform vec3 flame;
uniform vec3 tip;
varying float vAlong;
varying vec3 vNormal;
varying vec3 vSeen;
void main() {
  // (Clamped: at a smoothed edge the values are guessed past their ends)
  float along = clamp(vAlong, 0.0, 1.0);
  // Seen through its middle the jet is thick and pale; at its rim thin and coloured
  float facing = abs(dot(normalize(vNormal), normalize(vSeen)));
  float thick = pow(clamp(facing, 0.0, 1.0), 1.2);
  vec3 colour = mix(tip, flame, (1.0 - smoothstep(0.2, 0.9, along)));
  // The pale heart: white-hot out of the thruster, gone by half way down
  float heart = thick * thick * (1.0 - smoothstep(0.0, 0.6, along));
  colour = mix(colour, core, heart) * (1.0 + 1.6 * heart * gain);
  // Shock diamonds running down it
  float diamonds = 1.0 + 0.45 * sin(along * 30.0 - time * 34.0) * (1.0 - smoothstep(0.05, 0.75, along));
  float flicker = 0.86 + 0.14 * sin(time * 53.0 + along * 17.0);
  float alpha = (0.1 + 0.5 * thick) * (1.0 - smoothstep(0.3, 1.0, along)) * flicker * lit;
  gl_FragColor = vec4(colour * diamonds, alpha);
}`

/** A jet of unit length along +z from the origin, unit radius at its widest: a flame's shape */
function flameGeometry(): LatheGeometry {
  const points: Vector2[] = []
  for (let step = 0; step <= 12; step++) {
    const along = step / 12
    // Out of the mouth, a belly, then a long taper to a point
    const radius = along < 0.14 ? 0.72 + 0.28 * (along / 0.14) : (1 - (along - 0.14) / 0.86) ** 1.25
    points.push(new Vector2(Math.max(0.001, radius), along))
  }
  const geometry = new LatheGeometry(points, 24)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

const WHITE = new Color(1, 1, 1)

function softTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31)
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

/** A puff, a spark or a piece of fire: where it is, how it moves, how it looks this frame */
interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  /** Across, metres, this frame; and (the fire) at its start */
  size: number
  base: number
  opacity: number
  /** How thick (smoke) */
  thick: number
  /** Which of its kind's colours */
  colour: number
}

const particle = (age: number): Particle => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  age,
  size: 0,
  base: 1,
  opacity: 0,
  thick: 1,
  colour: 0,
})

/**
 * `lite` is for another racer's kart (2026-11-17): the same marks, smoke, sparks and flames from
 * smaller pools, so that a full grid costs little; its marks stay about a fifth as long
 */
export function createKartEffects(
  world: Object3D,
  kart: KartModel,
  lite = false,
  /** How much brighter than white the fire may be drawn (post.ts's glow); 1 draws it plain */
  glow = 1,
): KartEffects {
  const PUFFS = lite ? 36 : FULL_PUFFS
  const SPARKS = lite ? 50 : FULL_SPARKS
  const MARKS = lite ? 120 : FULL_MARKS
  const JETS = lite ? 48 : FULL_JETS
  const SKIDS = lite ? 1200 : FULL_SKIDS
  const RIBBON = lite ? 16 : FULL_RIBBON
  const texture = softTexture()
  // 2026-11-22 (§4.72, src/kart/settings.ts): the effects level lays fewer of them
  const share = PARTICLE_SHARE[loadSettings().effects]
  let clock = 0

  // 2026-11-20 (docs/KART-PERF.md): the smoke, the sparks and the fire are particles in two
  // batches (particles.ts), one draw each, not a sprite each
  const smoke = createParticleBatch(world, { capacity: PUFFS, map: texture, additive: false })
  const glowing = createParticleBatch(world, {
    capacity: SPARKS + JETS,
    map: texture,
    additive: true,
  })

  // ── Dust: a light stream from under the back while drifting ──
  const smokeColour = new Color(kartScene.smoke)
  const puffs: Particle[] = []
  for (let index = 0; index < PUFFS; index++) puffs.push(particle(PUFF_LIFE))
  let nextPuff = 0
  let puffDue = 0

  // ── Sparks: small bright dots thrown out sideways and back, falling ──
  /** Their colours: the kart's glow, a spark's, a drift's that has earned its boost, the window's */
  const sparkColours = [
    kart.glow,
    kartHover.spark,
    kartHover.sparkEarned,
    kartHover.sparkReady,
  ].map((color) => new Color(color))
  const sparks: Particle[] = []
  for (let index = 0; index < SPARKS; index++) {
    const spark = particle(SPARK_LIFE)
    spark.colour = index % 2
    sparks.push(spark)
  }
  let nextSpark = 0
  let sparkDue = 0

  // ── Trails: one ribbon piece per corner per frame while drifting, fading with age ──
  const positions = new Float32Array(MARKS * 4 * 3)
  const colours = new Float32Array(MARKS * 4 * 3)
  const born = new Float32Array(MARKS).fill(-Infinity)
  const indices = new Uint32Array(MARKS * 6)
  for (let piece = 0; piece < MARKS; piece++) {
    const a = piece * 4
    // Wound to face up (2026-11-14: they faced the ground before, and so never showed)
    indices.set([a, a + 2, a + 1, a + 2, a + 3, a + 1], piece * 6)
  }
  const markGeometry = new BufferGeometry()
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
  const colourAttribute = new BufferAttribute(colours, 3).setUsage(DynamicDrawUsage)
  markGeometry.setAttribute('position', positionAttribute)
  markGeometry.setAttribute('color', colourAttribute)
  markGeometry.setIndex(new BufferAttribute(indices, 1))
  // Added light: black adds nothing, so a trail fades out by darkening
  const markMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const marks = new Mesh(markGeometry, markMaterial)
  // Its bounds change all the time; never culled
  marks.frustumCulled = false
  world.add(marks)
  const trailColour = new Color(kart.glow)
  let nextMark = 0
  let lastCorners: { x: number; z: number }[] | null = null
  let fading = false

  // ── Skid marks: dark, see-through, long-lasting; their opacity fades with age ──
  const skidPositions = new Float32Array(SKIDS * 4 * 3)
  const skidColours = new Float32Array(SKIDS * 4 * 4)
  const skidBorn = new Float32Array(SKIDS).fill(-Infinity)
  /** How dark each piece was laid, 0 to 1 */
  const skidDark = new Float32Array(SKIDS)
  const skidIndices = new Uint32Array(SKIDS * 6)
  for (let piece = 0; piece < SKIDS; piece++) {
    const a = piece * 4
    skidIndices.set([a, a + 2, a + 1, a + 2, a + 3, a + 1], piece * 6)
  }
  const skidTint = new Color(kartScene.skid)
  for (let vertex = 0; vertex < SKIDS * 4; vertex++) {
    skidColours.set([skidTint.r, skidTint.g, skidTint.b, 0], vertex * 4)
  }
  const skidGeometry = new BufferGeometry()
  const skidPositionAttribute = new BufferAttribute(skidPositions, 3).setUsage(DynamicDrawUsage)
  // Four numbers a vertex: the alpha fades each piece out on its own
  const skidColourAttribute = new BufferAttribute(skidColours, 4).setUsage(DynamicDrawUsage)
  skidGeometry.setAttribute('position', skidPositionAttribute)
  skidGeometry.setAttribute('color', skidColourAttribute)
  skidGeometry.setIndex(new BufferAttribute(skidIndices, 1))
  const skidMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const skids = new Mesh(skidGeometry, skidMaterial)
  skids.frustumCulled = false
  // Before the glowing trails, so that they add their light over the dark marks
  skids.renderOrder = 1
  marks.renderOrder = 2
  world.add(skids)
  let nextSkid = 0
  let skidsShowing = false

  // ── The boost flames: a shaded jet riding on each thruster ──
  const flameUniforms = {
    time: { value: 0 },
    gain: { value: glow },
    lit: { value: 0 },
    core: { value: new Color(kartScene.flameCore) },
    flame: { value: new Color(kartScene.flame) },
    tip: { value: new Color(kartScene.flame) },
  }
  const flameMaterial = new ShaderMaterial({
    uniforms: flameUniforms,
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  })
  const flameShape = flameGeometry()
  // One big thruster gets a bigger flame than each of two small ones
  const flameSize = kart.nozzles.length > 1 ? 0.85 : 1.3
  const flames = kart.nozzles.map((nozzle) => {
    const flame = new Mesh(flameShape, flameMaterial)
    flame.visible = false
    flame.frustumCulled = false
    nozzle.add(flame)
    return flame
  })
  // The flash at the thrusters when a boost lights: one soft burst, riding on the kart
  const flashMaterial = new SpriteMaterial({
    map: texture,
    color: kartScene.flameCore,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const flash = new Sprite(flashMaterial)
  flash.visible = false
  const mouths = Math.max(1, kart.thrusters.length)
  const rear = [0, 1, 2].map(
    (axis) => kart.thrusters.reduce((sum, thruster) => sum + thruster[axis]!, 0) / mouths,
  )
  flash.position.set(rear[0]!, rear[1]!, rear[2]! + 0.15)
  kart.group.add(flash)
  let flashAge = FLASH_SECONDS

  // ── The ribbons of light a full boost leaves behind each thruster (two at most) ──
  const ribbonMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  })
  const ribbons = kart.nozzles.slice(0, 2).map(() => {
    const ribbonPositions = new Float32Array(RIBBON * 2 * 3)
    const ribbonColours = new Float32Array(RIBBON * 2 * 3)
    const ribbonIndices = new Uint16Array((RIBBON - 1) * 6)
    for (let piece = 0; piece < RIBBON - 1; piece++) {
      const at = piece * 2
      ribbonIndices.set([at, at + 2, at + 1, at + 2, at + 3, at + 1], piece * 6)
    }
    const geometry = new BufferGeometry()
    const position = new BufferAttribute(ribbonPositions, 3).setUsage(DynamicDrawUsage)
    const colour = new BufferAttribute(ribbonColours, 3).setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setAttribute('color', colour)
    geometry.setIndex(new BufferAttribute(ribbonIndices, 1))
    const mesh = new Mesh(geometry, ribbonMaterial)
    mesh.frustumCulled = false
    mesh.visible = false
    world.add(mesh)
    return {
      mesh,
      geometry,
      position,
      colour,
      /** The points, newest first: x, y, z and the moment each was laid */
      points: new Float32Array(RIBBON * 4).fill(-Infinity),
      /** Whether the newest point is still riding on the thruster */
      open: false,
    }
  })
  const ribbonColour = new Color()
  // ── The fire a boost leaves behind: small bright puffs out of each thruster, left in the world ──
  /** Every other one the boost's heart colour, the rest its flame's (set each frame) */
  const jetColours = [new Color(kartScene.flameCore), new Color(kartScene.flame)]
  const JET_OPACITY = 0.4
  const jets: Particle[] = []
  for (let index = 0; index < JETS; index++) {
    const jet = particle(JET_LIFE)
    jet.colour = index % 2
    jets.push(jet)
  }
  let nextJet = 0
  let jetDue = 0

  // ── The ring of light on the road when a boost fires ──
  const ringGeometry = new RingGeometry(0.84, 1, 40)
  const ringMaterial = new MeshBasicMaterial({
    color: kartScene.flameCore,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
  const ring = new Mesh(ringGeometry, ringMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.visible = false
  ring.renderOrder = 3
  world.add(ring)
  let ringAge = RING_SECONDS
  let ringPower = 0
  let ringReach: number = BOOST_FX.n2o.ring
  // The same, standing up behind the kart and facing along the road: a full boost's shock wave
  const waveMaterial = new MeshBasicMaterial({
    color: kartScene.flameCore,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  })
  const wave = new Mesh(ringGeometry, waveMaterial)
  wave.visible = false
  world.add(wave)
  let waveAge = WAVE_SECONDS
  let waveReach = 1
  let heat: HeatSpot | null = null
  const spot = new Vector3()
  const styleColour = new Color()

  let flicker = 0
  let boostSparkDue = 0
  let bursts = 0
  let burstPower = 0
  let burstAge = BURST_SECONDS
  // A hill track (2026-11-17): the height marks, dust and sparks start from, and the landings seen
  let floor = 0
  let landings = 0
  let landAge = LANDING_MARK_SECONDS

  const toWorld = (pose: { x: number; z: number; heading: number }, lx: number, lz: number) => {
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    return { x: pose.x + lx * cos - lz * sin, z: pose.z + lx * sin + lz * cos }
  }

  const layMark = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.02 || length > MAX_PIECE) return
    // Across the direction of travel, half the trail's width either side
    const nx = (-dz / length) * (MARK_WIDTH / 2)
    const nz = (dx / length) * (MARK_WIDTH / 2)
    positions.set(
      [
        from.x + nx,
        MARK_HEIGHT + floor,
        from.z + nz,
        from.x - nx,
        MARK_HEIGHT + floor,
        from.z - nz,
        to.x + nx,
        MARK_HEIGHT + floor,
        to.z + nz,
        to.x - nx,
        MARK_HEIGHT + floor,
        to.z - nz,
      ],
      nextMark * 12,
    )
    born[nextMark] = clock
    nextMark = (nextMark + 1) % MARKS
    positionAttribute.needsUpdate = true
  }

  const laySkid = (from: { x: number; z: number }, to: { x: number; z: number }, dark: number) => {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.02 || length > MAX_PIECE) return
    const nx = (-dz / length) * (SKID_WIDTH / 2)
    const nz = (dx / length) * (SKID_WIDTH / 2)
    const y = SKID_HEIGHT + floor
    skidPositions.set(
      [
        from.x + nx,
        y,
        from.z + nz,
        from.x - nx,
        y,
        from.z - nz,
        to.x + nx,
        y,
        to.z + nz,
        to.x - nx,
        y,
        to.z - nz,
      ],
      nextSkid * 12,
    )
    skidBorn[nextSkid] = clock
    skidDark[nextSkid] = dark
    nextSkid = (nextSkid + 1) % SKIDS
    skidPositionAttribute.needsUpdate = true
  }

  /** Each skid piece's opacity by its age; says whether any piece still shows */
  const fadeSkids = () => {
    let showing = false
    for (let piece = 0; piece < SKIDS; piece++) {
      const share = Math.max(0, 1 - (clock - skidBorn[piece]!) / SKID_FADE)
      if (share > 0) showing = true
      // Holds dark for most of its life, then fades
      const alpha = Math.min(1, share * 2.5) * SKID_OPACITY * skidDark[piece]!
      for (let corner = 0; corner < 4; corner++) skidColours[(piece * 4 + corner) * 4 + 3] = alpha
    }
    skidColourAttribute.needsUpdate = true
    return showing
  }

  /** Each trail piece's brightness by its age; says whether any piece still shows */
  const fadeMarks = () => {
    let showing = false
    for (let piece = 0; piece < MARKS; piece++) {
      const share = Math.max(0, 1 - (clock - born[piece]!) / MARK_FADE)
      if (share > 0) showing = true
      const strength = share * share * 0.6
      for (let corner = 0; corner < 4; corner++) {
        const at = (piece * 4 + corner) * 3
        colours[at] = trailColour.r * strength
        colours[at + 1] = trailColour.g * strength
        colours[at + 2] = trailColour.b * strength
      }
    }
    colourAttribute.needsUpdate = true
    return showing
  }

  return {
    update(pose, look, seconds) {
      clock += seconds
      floor = pose.y ?? 0
      // In the air (a hill track) nothing touches the road: no marks, no dust, no sparks
      const flying = look.airborne ?? false
      const sliding = !flying && look.drift !== 0 && Math.abs(look.speed) > 6
      // How hard the tyres slide (feelFx.ts): a drift by its depth, a locked brake too. Left out
      // (another racer's kart), a drift at full strength
      const skid = flying ? 0 : (look.skid ?? (sliding ? 1 : 0))
      const corners = kart.rearContacts.map(([lx, lz]) => toWorld(pose, lx, lz))
      // A landing: a puff of dust from both corners and a short dark mark where the tyres hit
      const landed = (look.landings ?? 0) > landings
      landings = look.landings ?? 0
      if (landed) {
        landAge = 0
        puffDue += LANDING_PUFFS
      }
      landAge += seconds
      const landing = !flying && landAge < LANDING_MARK_SECONDS
      const marking = sliding || skid > 0 || landing

      if (marking && lastCorners) {
        // A piece once the kart has moved far enough: a slow frame rate lays as many as a fast one
        const moved = Math.hypot(
          corners[0]!.x - lastCorners[0]!.x,
          corners[0]!.z - lastCorners[0]!.z,
        )
        if (moved >= MIN_PIECE) {
          const dark = Math.max(skid, landing ? 0.8 : 0) * (lite ? 0.75 : 1)
          const from = lastCorners
          corners.forEach((corner, index) => {
            // Another racer's kart leaves the dark marks only: eight glowing trails are a mess
            if (sliding && !lite) layMark(from[index]!, corner)
            if (dark > 0) laySkid(from[index]!, corner, dark)
          })
          lastCorners = corners
        }
      } else lastCorners = marking ? corners : null
      // Faded every frame while a trail or a skid mark still shows, then left alone
      if ((sliding && !lite) || fading) fading = fadeMarks()
      if (marking || skidsShowing) skidsShowing = fadeSkids()

      // Tyre smoke: thick from a deep slide, rolling away to the outside of the drift; a faint
      // stream under boost
      const smoking = skid > 0
      puffDue +=
        share *
        (smoking ? PUFF_RATE + PUFF_RATE_MORE * skid : look.boosting && !flying ? 4 : 0) * seconds
      const cos = Math.cos(pose.heading)
      const sin = Math.sin(pose.heading)
      while (puffDue >= 1) {
        puffDue -= 1
        const corner = corners[nextPuff % corners.length]!
        const puff = puffs[nextPuff]!
        puff.age = 0
        puff.thick = smoking ? 0.45 + 0.55 * skid : 0.3
        // Out to the side the kart slides towards (the outside of the drift), and up
        const outward = -Math.sign(look.drift) * (smoking ? 1.2 + Math.random() * 2.2 : 0)
        puff.vx = outward * cos + (Math.random() - 0.5) * 0.8
        puff.vz = outward * sin + (Math.random() - 0.5) * 0.8
        puff.vy = 0.7 + Math.random() * 0.9
        puff.x = corner.x + (Math.random() - 0.5) * 0.5
        puff.y = 0.22 + floor
        puff.z = corner.z + (Math.random() - 0.5) * 0.5
        nextPuff = (nextPuff + 1) % PUFFS
      }
      for (const puff of puffs) {
        if (puff.age >= PUFF_LIFE) continue
        puff.age += seconds
        const share = Math.min(1, puff.age / PUFF_LIFE)
        puff.x += puff.vx * seconds
        puff.y += puff.vy * seconds
        puff.z += puff.vz * seconds
        puff.size = 0.9 + share * 3.6
        puff.opacity = 0.8 * puff.thick * (1 - share) ** 1.4
      }

      // Sparks: thrown out of the drift's outside corner and back along the kart. Gold once the
      // drift has earned its release boost; pale blue from both corners while its window is open
      const charge = look.charge ?? 0
      const ready = charge === 2
      sparkDue += share * (ready && !flying ? 140 : sliding ? (charge === 1 ? 110 : 70) : 0) * seconds
      const throwSpark = (
        corner: { x: number; z: number },
        outward: number,
        back: number,
        colour: number,
      ) => {
        const spark = sparks[nextSpark]!
        spark.age = 0
        // From the kart's frame (outward along x, back along +z) into the world's
        spark.vx = outward * cos - back * sin
        spark.vz = outward * sin + back * cos
        spark.vy = 1.5 + Math.random() * 2.5
        spark.colour = colour
        spark.x = corner.x
        spark.y = 0.25 + floor
        spark.z = corner.z
        nextSpark = (nextSpark + 1) % SPARKS
      }
      while (sparkDue >= 1) {
        sparkDue -= 1
        if (ready) {
          const side = nextSpark % 2 === 0 ? 0 : corners.length - 1
          const outward = (side === 0 ? -1 : 1) * (1 + Math.random() * 3)
          throwSpark(corners[side]!, outward, 4 + Math.random() * 5, 3)
          continue
        }
        // The outside of a drift to the right is the left corner
        const corner = corners[look.drift > 0 ? 0 : corners.length - 1]!
        const outward = -Math.sign(look.drift) * (2 + Math.random() * 3)
        throwSpark(corner, outward, 3 + Math.random() * 4, charge === 1 ? 2 : nextSpark % 2)
      }
      // The boost as the model reads it (boostFx.ts): which kind runs, what fired
      const boost = kart.boost()
      const style = BOOST_FX[boost.kind ?? boost.last]
      const burning = boost.kind !== null
      // A boost fired: a fan of sparks out of the back, a ring of light on the road, a flash at
      // the thrusters and the flames stretched, all by how hard it kicks and in its own colour; a
      // full boost stands a ring up behind the kart too
      if (boost.fired > bursts) {
        burstAge = 0
        burstPower = boost.power
        styleColour.set(style.flame)
        if (!flying) {
          ringAge = 0
          ringPower = burstPower
          ringReach = style.ring
          ringMaterial.color.copy(styleColour).lerp(WHITE, 0.45)
          const behind = toWorld(pose, 0, 0.9)
          ring.position.set(behind.x, MARK_HEIGHT + 0.02 + floor, behind.z)
        }
        if (style.shockwave) {
          waveAge = 0
          waveReach = style.ring * 0.42
          waveMaterial.color.copy(styleColour).lerp(WHITE, 0.3)
          const behind = toWorld(pose, 0, 1.5)
          wave.position.set(behind.x, 0.7 + floor, behind.z)
          wave.rotation.set(0, -pose.heading, 0)
        }
        flashAge = 0
        flashMaterial.color.set(style.core)
        jetDue += 24 * burstPower * share
        for (let index = 0; index < Math.round(BURST_SPARKS * (0.5 + burstPower)); index++) {
          const corner = corners[index % corners.length]!
          const fan = (Math.random() - 0.5) * 9
          throwSpark(corner, fan, 8 + Math.random() * 9, index % 2 === 0 ? 1 : 3)
        }
      }
      bursts = boost.fired
      burstAge = Math.min(BURST_SECONDS, burstAge + seconds)
      // A full boost throws sparks out of the back all the while
      if (burning && style.ribbons && !flying) {
        boostSparkDue += BOOST_SPARK_RATE * (lite ? 0.4 : 1) * share * seconds
        while (boostSparkDue >= 1) {
          boostSparkDue -= 1
          const corner = corners[nextSpark % corners.length]!
          throwSpark(corner, (Math.random() - 0.5) * 5, 5 + Math.random() * 8, 0)
        }
      }
      for (const spark of sparks) {
        if (spark.age >= SPARK_LIFE) continue
        spark.age += seconds
        spark.vy -= 14 * seconds
        spark.x += spark.vx * seconds
        spark.z += spark.vz * seconds
        spark.y = Math.max(0.12 + floor, spark.y + spark.vy * seconds)
        spark.size = 0.17 * (1 - Math.min(1, spark.age / SPARK_LIFE)) + 0.04
      }

      // The ring spreads over the road and fades
      if (ringAge < RING_SECONDS) {
        ringAge += seconds
        const share = Math.min(1, ringAge / RING_SECONDS)
        const reach = 1 + (ringReach * (0.4 + 0.6 * ringPower) - 1) * (1 - (1 - share) ** 2)
        ring.scale.set(reach, reach, 1)
        ringMaterial.opacity = 0.7 * ringPower * (1 - share)
        ring.visible = share < 1
      }

      if (waveAge < WAVE_SECONDS) {
        waveAge += seconds
        const share = Math.min(1, waveAge / WAVE_SECONDS)
        const reach = 0.5 + (waveReach - 0.5) * (1 - (1 - share) ** 3)
        wave.scale.set(reach, reach, 1)
        waveMaterial.opacity = 0.75 * ringPower * (1 - share) ** 1.5
        wave.visible = share < 1
      }
      if (flashAge < FLASH_SECONDS) {
        flashAge += seconds
        const share = Math.min(1, flashAge / FLASH_SECONDS)
        const size = (1.2 + 3.4 * burstPower) * (0.4 + 0.6 * share)
        flash.scale.set(size, size, 1)
        flashMaterial.opacity = 0.9 * (1 - share) ** 2
        flash.visible = share < 1
      }

      // The fire left behind the thrusters while a boost runs, in the boost's colours
      jetColours[0]!.set(style.core)
      jetColours[1]!.set(style.flame)
      if (look.boosting)
        jetDue +=
          JET_RATE *
          (style.ribbons ? 0.3 : 0.5 + 0.5 * style.length) *
          kart.thrusters.length *
          share *
          seconds
      else jetDue = Math.min(jetDue, 1)
      let mouth = 0
      while (jetDue >= 1) {
        jetDue -= 1
        const [tx, ty, tz] = kart.thrusters[mouth++ % kart.thrusters.length]!
        const from = toWorld(pose, tx, tz + 0.2)
        const jet = jets[nextJet]!
        jet.age = Math.random() * 0.06
        // Thrown back out of the kart, a little spread; the kart drives away from it
        const back = 5 + Math.random() * 7
        const spread = (Math.random() - 0.5) * 1.6
        jet.vx = spread * cos - back * sin
        jet.vz = spread * sin + back * cos
        jet.vy = (Math.random() - 0.3) * 1.2
        jet.base =
          (0.22 + Math.random() * 0.26) * style.girth * (1 + 0.8 * (1 - burstAge / BURST_SECONDS))
        jet.x = from.x
        jet.y = ty + 0.34 + floor
        jet.z = from.z
        nextJet = (nextJet + 1) % JETS
      }
      for (const jet of jets) {
        if (jet.age >= JET_LIFE) continue
        jet.age += seconds
        const share = Math.min(1, jet.age / JET_LIFE)
        jet.x += jet.vx * seconds
        jet.y += jet.vy * seconds
        jet.z += jet.vz * seconds
        jet.size = jet.base * (1 - share * 0.85)
      }
      // This frame's particles, as many draws as there are batches: what is still alive
      smoke.begin()
      for (const puff of puffs) {
        if (puff.age < PUFF_LIFE) smoke.add(puff.x, puff.y, puff.z, puff.size, smokeColour, puff.opacity)
      }
      smoke.end()
      glowing.begin()
      for (const spark of sparks) {
        if (spark.age < SPARK_LIFE)
          glowing.add(spark.x, spark.y, spark.z, spark.size, sparkColours[spark.colour]!, 1)
      }
      for (const jet of jets) {
        if (jet.age < JET_LIFE)
          glowing.add(jet.x, jet.y, jet.z, jet.size, jetColours[jet.colour]!, JET_OPACITY)
      }
      glowing.end()

      // The flames: lit fast, dying away; long and fat just after a boost fires, settling back
      const lit = boost.heat
      for (const flame of flames) flame.visible = lit > 0
      heat = null
      if (lit > 0) {
        flicker += seconds
        flameUniforms.time.value = flicker % 100
        flameUniforms.lit.value = lit
        flameUniforms.core.value.set(style.core)
        flameUniforms.flame.value.set(style.flame)
        flameUniforms.tip.value.set(style.tip)
        const burst = 1 + (0.5 + 0.7 * burstPower) * (1 - burstAge / BURST_SECONDS)
        const length = FLAME_LENGTH * flameSize * style.length * burst * (0.4 + 0.6 * lit)
        const girth = FLAME_GIRTH * flameSize * style.girth * (1 + (burst - 1) * 0.4)
        for (const flame of flames) {
          flame.scale.set(girth, girth, length * (0.94 + Math.random() * 0.12))
        }
        // Where the air shimmers: a little behind the thrusters
        const behind = toWorld(pose, 0, 1.9)
        heat = {
          x: behind.x,
          y: 0.45 + floor,
          z: behind.z,
          strength: lit * (0.4 + 0.6 * Math.min(1, style.length)),
        }
      }

      // The ribbons: a point laid behind each thruster every so often while a full boost runs, the
      // newest riding on the thruster; each fades with its age
      const trailing = burning && style.ribbons
      if (trailing) ribbonColour.set(style.trail).multiplyScalar(1 + (glow - 1) * 0.35)
      ribbons.forEach((ribbon, index) => {
        const { points } = ribbon
        if (!trailing && !ribbon.mesh.visible) {
          ribbon.open = false
          return
        }
        if (trailing) {
          kart.nozzles[index]!.getWorldPosition(spot)
          if (!ribbon.open) {
            // A new ribbon: nothing joins it to the last one
            points.fill(-Infinity)
            ribbon.open = true
            points.set([spot.x, spot.y, spot.z, clock], 4)
          }
          const moved = Math.hypot(points[4]! - spot.x, points[6]! - spot.z)
          if (moved >= RIBBON_STEP) points.copyWithin(4, 0, (RIBBON - 1) * 4)
          points.set([spot.x, spot.y, spot.z, clock], 0)
        } else ribbon.open = false
        let showing = false
        const positions = ribbon.position.array as Float32Array
        const colours = ribbon.colour.array as Float32Array
        for (let point = 0; point < RIBBON; point++) {
          const at = point * 4
          const born = points[at + 3]!
          const fade = born === -Infinity ? 0 : Math.max(0, 1 - (clock - born) / RIBBON_FADE)
          if (fade > 0) showing = true
          // Across the ribbon: square to the way it runs, flat on the road's plane
          const next = Math.min(RIBBON - 1, point + 1) * 4
          const previous = Math.max(0, point - 1) * 4
          let dx = points[previous]! - points[next]!
          let dz = points[previous + 2]! - points[next + 2]!
          if (!Number.isFinite(dx) || !Number.isFinite(dz)) dx = dz = 0
          const length = Math.hypot(dx, dz) || 1
          const half = (RIBBON_WIDTH / 2) * style.girth * (0.35 + 0.65 * fade)
          const nx = (-dz / length) * half
          const nz = (dx / length) * half
          // A point that has faded sits on the one before it, so its piece has no size
          const from = fade > 0 ? at : Math.max(0, point - 1) * 4
          const x = Number.isFinite(points[from]!) ? points[from]! : 0
          const y = Number.isFinite(points[from + 1]!) ? points[from + 1]! : 0
          const z = Number.isFinite(points[from + 2]!) ? points[from + 2]! : 0
          positions.set([x + nx, y, z + nz, x - nx, y, z - nz], point * 6)
          const strength = fade * fade
          for (const side of [0, 3]) {
            colours[point * 6 + side] = ribbonColour.r * strength
            colours[point * 6 + side + 1] = ribbonColour.g * strength
            colours[point * 6 + side + 2] = ribbonColour.b * strength
          }
        }
        ribbon.position.needsUpdate = true
        ribbon.colour.needsUpdate = true
        ribbon.mesh.visible = showing
      })
    },
    lift() {
      lastCorners = null
      for (const ribbon of ribbons) {
        ribbon.open = false
        ribbon.points.fill(-Infinity)
        ribbon.mesh.visible = false
      }
    },
    heat: () => heat,
    dispose() {
      smoke.dispose()
      glowing.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
      world.remove(ring)
      texture.dispose()
      markGeometry.dispose()
      markMaterial.dispose()
      world.remove(marks)
      skidGeometry.dispose()
      skidMaterial.dispose()
      world.remove(skids)
      for (const flame of flames) flame.removeFromParent()
      flameShape.dispose()
      flameMaterial.dispose()
      flash.removeFromParent()
      flashMaterial.dispose()
      for (const ribbon of ribbons) {
        ribbon.geometry.dispose()
        world.remove(ribbon.mesh)
      }
      ribbonMaterial.dispose()
      waveMaterial.dispose()
      world.remove(wave)
    },
  }
}
