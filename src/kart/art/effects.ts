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
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three'
import { kartHover, kartScene } from '../../styles/kartTokens.ts'
import type { KartLook, KartModel } from './kartModel.ts'

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
const JET_LIFE = 0.32
/** ... this many a second from each thruster */
const JET_RATE = 100
/** The ring of light on the road when a boost fires: how long it lasts and how wide it gets, metres */
const RING_SECONDS = 0.42
const RING_REACH = 4.6
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
  dispose(): void
}

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

/**
 * `lite` is for another racer's kart (2026-11-17): the same marks, smoke, sparks and flames from
 * smaller pools, so that a full grid costs little; its marks stay about a fifth as long
 */
export function createKartEffects(world: Object3D, kart: KartModel, lite = false): KartEffects {
  const PUFFS = lite ? 36 : FULL_PUFFS
  const SPARKS = lite ? 50 : FULL_SPARKS
  const MARKS = lite ? 120 : FULL_MARKS
  const JETS = lite ? 48 : FULL_JETS
  const SKIDS = lite ? 1200 : FULL_SKIDS
  const texture = softTexture()
  let clock = 0

  // ── Dust: a light stream from under the back while drifting ──
  const puffs: {
    sprite: Sprite
    material: SpriteMaterial
    age: number
    vx: number
    vy: number
    vz: number
    thick: number
  }[] = []
  for (let index = 0; index < PUFFS; index++) {
    const material = new SpriteMaterial({
      map: texture,
      color: kartScene.smoke,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    const sprite = new Sprite(material)
    sprite.visible = false
    world.add(sprite)
    puffs.push({ sprite, material, age: PUFF_LIFE, vx: 0, vy: 0, vz: 0, thick: 1 })
  }
  let nextPuff = 0
  let puffDue = 0

  // ── Sparks: small bright dots thrown out sideways and back, falling ──
  const sparkMaterials = [
    kart.glow,
    kartHover.spark,
    kartHover.sparkEarned,
    kartHover.sparkReady,
  ].map(
    (color) =>
      new SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
  )
  const sparks: { sprite: Sprite; age: number; vx: number; vy: number; vz: number }[] = []
  for (let index = 0; index < SPARKS; index++) {
    const sprite = new Sprite(sparkMaterials[index % 2]!)
    sprite.visible = false
    world.add(sprite)
    sparks.push({ sprite, age: SPARK_LIFE, vx: 0, vy: 0, vz: 0 })
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

  // ── The boost flames, on the kart, one at each thruster ──
  const outerMaterial = new MeshBasicMaterial({
    color: kartScene.flame,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const innerMaterial = new MeshBasicMaterial({
    color: kartScene.flameCore,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  // One big thruster gets a bigger flame than each of two small ones
  const flameSize = kart.thrusters.length > 1 ? 0.8 : 1.25
  const outerGeometry = new ConeGeometry(0.16 * flameSize, 0.95 * flameSize, 10)
  const innerGeometry = new ConeGeometry(0.08 * flameSize, 0.6 * flameSize, 8)
  const flames = kart.thrusters.map((thruster) => {
    const group = new Group()
    const outer = new Mesh(outerGeometry, outerMaterial)
    const inner = new Mesh(innerGeometry, innerMaterial)
    // Cones point up: laid back along +z, out of the thruster
    for (const cone of [outer, inner]) cone.rotation.x = Math.PI / 2
    outer.position.z = 0.48 * flameSize
    inner.position.z = 0.32 * flameSize
    group.add(outer, inner)
    group.position.set(...thruster)
    group.visible = false
    kart.group.add(group)
    return { group, outer, inner }
  })
  // ── The fire a boost leaves behind: small bright puffs out of each thruster, left in the world ──
  const jetMaterials = [kartScene.flameCore, kartScene.flame].map(
    (color) =>
      new SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
  )
  const jets: { sprite: Sprite; age: number; vx: number; vy: number; vz: number; size: number }[] =
    []
  for (let index = 0; index < JETS; index++) {
    const sprite = new Sprite(jetMaterials[index % 2]!)
    sprite.visible = false
    world.add(sprite)
    jets.push({ sprite, age: JET_LIFE, vx: 0, vy: 0, vz: 0, size: 1 })
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

  let flicker = 0
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
        (smoking ? PUFF_RATE + PUFF_RATE_MORE * skid : look.boosting && !flying ? 4 : 0) * seconds
      const cos = Math.cos(pose.heading)
      const sin = Math.sin(pose.heading)
      while (puffDue >= 1) {
        puffDue -= 1
        const corner = corners[nextPuff % corners.length]!
        const puff = puffs[nextPuff]!
        puff.age = 0
        puff.thick = smoking ? 0.45 + 0.55 * skid : 0.5
        // Out to the side the kart slides towards (the outside of the drift), and up
        const outward = -Math.sign(look.drift) * (smoking ? 1.2 + Math.random() * 2.2 : 0)
        puff.vx = outward * cos + (Math.random() - 0.5) * 0.8
        puff.vz = outward * sin + (Math.random() - 0.5) * 0.8
        puff.vy = 0.7 + Math.random() * 0.9
        puff.sprite.position.set(
          corner.x + (Math.random() - 0.5) * 0.5,
          0.22 + floor,
          corner.z + (Math.random() - 0.5) * 0.5,
        )
        puff.sprite.visible = true
        nextPuff = (nextPuff + 1) % PUFFS
      }
      for (const puff of puffs) {
        if (puff.age >= PUFF_LIFE) continue
        puff.age += seconds
        const share = Math.min(1, puff.age / PUFF_LIFE)
        puff.sprite.position.x += puff.vx * seconds
        puff.sprite.position.y += puff.vy * seconds
        puff.sprite.position.z += puff.vz * seconds
        const size = 0.9 + share * 3.6
        puff.sprite.scale.set(size, size, 1)
        puff.material.opacity = 0.8 * puff.thick * (1 - share) ** 1.4
        if (share >= 1) puff.sprite.visible = false
      }

      // Sparks: thrown out of the drift's outside corner and back along the kart. Gold once the
      // drift has earned its release boost; pale blue from both corners while its window is open
      const charge = look.charge ?? 0
      const ready = charge === 2
      sparkDue += (ready && !flying ? 140 : sliding ? (charge === 1 ? 110 : 70) : 0) * seconds
      const throwSpark = (
        corner: { x: number; z: number },
        outward: number,
        back: number,
        material: SpriteMaterial,
      ) => {
        const spark = sparks[nextSpark]!
        spark.age = 0
        // From the kart's frame (outward along x, back along +z) into the world's
        spark.vx = outward * cos - back * sin
        spark.vz = outward * sin + back * cos
        spark.vy = 1.5 + Math.random() * 2.5
        spark.sprite.material = material
        spark.sprite.position.set(corner.x, 0.25 + floor, corner.z)
        spark.sprite.visible = true
        nextSpark = (nextSpark + 1) % SPARKS
      }
      while (sparkDue >= 1) {
        sparkDue -= 1
        if (ready) {
          const side = nextSpark % 2 === 0 ? 0 : corners.length - 1
          const outward = (side === 0 ? -1 : 1) * (1 + Math.random() * 3)
          throwSpark(corners[side]!, outward, 4 + Math.random() * 5, sparkMaterials[3]!)
          continue
        }
        // The outside of a drift to the right is the left corner
        const corner = corners[look.drift > 0 ? 0 : corners.length - 1]!
        const outward = -Math.sign(look.drift) * (2 + Math.random() * 3)
        const material = charge === 1 ? sparkMaterials[2]! : sparkMaterials[nextSpark % 2]!
        throwSpark(corner, outward, 3 + Math.random() * 4, material)
      }
      // A boost fired: a fan of sparks out of the back, a ring of light on the road, and the
      // flames stretch, all by how hard it kicks
      if ((look.bursts ?? 0) > bursts) {
        burstAge = 0
        burstPower = look.burstPower ?? 0.6
        if (!flying) {
          ringAge = 0
          ringPower = burstPower
          const behind = toWorld(pose, 0, 0.9)
          ring.position.set(behind.x, MARK_HEIGHT + 0.02 + floor, behind.z)
        }
        jetDue += 24 * burstPower
        for (let index = 0; index < Math.round(BURST_SPARKS * (0.5 + burstPower)); index++) {
          const corner = corners[index % corners.length]!
          const fan = (Math.random() - 0.5) * 9
          throwSpark(corner, fan, 8 + Math.random() * 9, sparkMaterials[index % 2 === 0 ? 1 : 3]!)
        }
      }
      bursts = look.bursts ?? 0
      burstAge = Math.min(BURST_SECONDS, burstAge + seconds)
      for (const spark of sparks) {
        if (spark.age >= SPARK_LIFE) continue
        spark.age += seconds
        spark.vy -= 14 * seconds
        const { position } = spark.sprite
        position.x += spark.vx * seconds
        position.z += spark.vz * seconds
        position.y = Math.max(0.12 + floor, position.y + spark.vy * seconds)
        const size = 0.3 * (1 - Math.min(1, spark.age / SPARK_LIFE)) + 0.05
        spark.sprite.scale.set(size, size, 1)
        if (spark.age >= SPARK_LIFE) spark.sprite.visible = false
      }

      // The ring spreads over the road and fades
      if (ringAge < RING_SECONDS) {
        ringAge += seconds
        const share = Math.min(1, ringAge / RING_SECONDS)
        const reach = 1 + (RING_REACH * (0.4 + 0.6 * ringPower) - 1) * (1 - (1 - share) ** 2)
        ring.scale.set(reach, reach, 1)
        ringMaterial.opacity = 0.7 * ringPower * (1 - share)
        ring.visible = share < 1
      }

      // The fire left behind the thrusters while a boost runs
      if (look.boosting) jetDue += JET_RATE * kart.thrusters.length * seconds
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
        jet.size = (0.4 + Math.random() * 0.4) * (1 + 0.8 * (1 - burstAge / BURST_SECONDS))
        jet.sprite.position.set(from.x, ty + 0.34 + floor, from.z)
        jet.sprite.visible = true
        nextJet = (nextJet + 1) % JETS
      }
      for (const jet of jets) {
        if (jet.age >= JET_LIFE) continue
        jet.age += seconds
        const share = Math.min(1, jet.age / JET_LIFE)
        const { position } = jet.sprite
        position.x += jet.vx * seconds
        position.y += jet.vy * seconds
        position.z += jet.vz * seconds
        const size = jet.size * (1 - share * 0.75)
        jet.sprite.scale.set(size, size, 1)
        if (share >= 1) jet.sprite.visible = false
      }

      for (const flame of flames) flame.group.visible = look.boosting
      if (look.boosting) {
        flicker += seconds * 40
        for (const flame of flames) {
          // Long and fat just after a boost fires, settling back
          const burst = 1.25 + (1.2 + 1.6 * burstPower) * (1 - burstAge / BURST_SECONDS)
          const stretch = (0.85 + Math.sin(flicker) * 0.15 + Math.random() * 0.1) * burst
          const fat = 1 + (burst - 1) * 0.35
          flame.outer.scale.set(fat, stretch, fat)
          flame.inner.scale.set(fat, (0.8 + Math.random() * 0.3) * burst, fat)
        }
      }
    },
    lift() {
      lastCorners = null
    },
    dispose() {
      for (const puff of puffs) {
        puff.material.dispose()
        world.remove(puff.sprite)
      }
      for (const spark of sparks) world.remove(spark.sprite)
      for (const material of sparkMaterials) material.dispose()
      for (const jet of jets) world.remove(jet.sprite)
      for (const material of jetMaterials) material.dispose()
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
      outerGeometry.dispose()
      innerGeometry.dispose()
      outerMaterial.dispose()
      innerMaterial.dispose()
    },
  }
}
