// 2026-11-20 (docs/ARCHITECTURE.md §4.47): light that falls on things, at night. Before this the
// lamps only glowed themselves; now on a night track (the old street, Danhai, an editor's night):
// - the headlights light the road ahead: on high a real spot light on this browser's own kart (it
//   lights the walls, the scenery and the karts in front) with a pool of light under it; on medium
//   only the pool, a flat additive quad shaped like a beam (no light, nothing to shade); on low off
// - the tail lamps glow red on the road behind, brighter under braking
// - street lamps pool warm light on the road, baked: one instanced quad for every pool on the
//   track, one draw call; on Danhai and an editor's night track with a post and a lamp head over
//   each, on the old street under its strings of lanterns
// Everything is made here (canvas gradients, boxes); no texture or model files.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SpotLight,
  Vector3,
  type Material,
  type Texture,
} from 'three'
import type { Track } from '../../../shared/kart/track.ts'
import { kartNight } from '../../styles/kartTokens.ts'
import type { KartModel } from './kartModel.ts'

// 2026-11-23: in headlights.ts, which the scene reads on every track (this module comes only for a night)
import type { HeadlightLevel } from './headlights.ts'
export { headlightLevel, type HeadlightLevel } from './headlights.ts'

/** The beam's pool on the road: this wide at its far end and this long, metres, from the nose on */
const BEAM_WIDTH = 7
const BEAM_LENGTH = 17
const BEAM_FROM = 1.5
/** How bright the pool is (additive): enough to read, not to wash the road out */
const BEAM_STRENGTH = 0.62
/** Street lamps: one every this many metres of road, alternating sides; each pool this wide */
export const LAMP_SPACING = 30
const POOL_SIZE = 12
const POOL_STRENGTH = 0.55
const POST_HEIGHT = 6
/** Just over the road, drawn over it */
const ROAD_LIFT = 0.05

/** Shared by every kart's lights and the street lamps, freed with the scene */
export interface NightKit {
  readonly beam: Texture
  readonly pool: Texture
  dispose(): void
}

function canvasTexture(width: number, height: number, paint: (data: ImageData) => void): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    const data = context.createImageData(width, height)
    paint(data)
    context.putImageData(data, 0, 0)
  }
  return new CanvasTexture(canvas)
}

/**
 * A beam as seen on the road from above: narrow and bright at the lamps (the texture's bottom row),
 * wider and fading towards the far end, soft at the sides
 */
export function beamShade(across: number, along: number): number {
  const half = 0.36 + 0.64 * along
  const side = Math.min(1, Math.max(0, 1 - Math.abs(across) / half) * 1.6)
  const near = Math.min(1, along / 0.18)
  return side * side * (3 - 2 * side) * near * near * (1 - along) ** 1.15
}

export function createNightKit(): NightKit {
  const beam = canvasTexture(64, 128, (data) => {
    for (let y = 0; y < data.height; y++) {
      // The canvas's top row is the texture's far end (v = 1)
      const along = 1 - y / (data.height - 1)
      for (let x = 0; x < data.width; x++) {
        const across = (x / (data.width - 1)) * 2 - 1
        const value = Math.round(255 * beamShade(across, along))
        const at = (y * data.width + x) * 4
        data.data[at] = data.data[at + 1] = data.data[at + 2] = value
        data.data[at + 3] = 255
      }
    }
  })
  const pool = canvasTexture(64, 64, (data) => {
    for (let y = 0; y < data.height; y++) {
      for (let x = 0; x < data.width; x++) {
        const r = Math.min(1, Math.hypot(x / 31.5 - 1, y / 31.5 - 1))
        const value = Math.round(255 * (1 - r) ** 2)
        const at = (y * data.width + x) * 4
        data.data[at] = data.data[at + 1] = data.data[at + 2] = value
        data.data[at + 3] = 255
      }
    }
  })
  return {
    beam,
    pool,
    dispose() {
      beam.dispose()
      pool.dispose()
    },
  }
}

const glowMaterial = (map: Texture, colour: string, strength: number): MeshBasicMaterial =>
  new MeshBasicMaterial({
    map,
    color: new Color(colour).multiplyScalar(strength),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })

export interface KartLights {
  /** Every frame, after the model's own update: the tail glow follows its braking */
  update(): void
  dispose(): void
}

/**
 * A kart's lights at night, riding on its model: the beam's pool ahead and the red glow behind, and
 * with `level` 'spot' a spot light as well. Nothing at all with 'off'
 */
export function addKartLights(model: KartModel, level: HeadlightLevel, kit: NightKit): KartLights {
  if (level === 'off') return { update() {}, dispose() {} }
  const beamGeometry = new PlaneGeometry(BEAM_WIDTH, BEAM_LENGTH)
  beamGeometry.rotateX(-Math.PI / 2)
  beamGeometry.translate(0, ROAD_LIFT, -(BEAM_FROM + BEAM_LENGTH / 2))
  const beamMaterial = glowMaterial(kit.beam, kartNight.beam, level === 'spot' ? BEAM_STRENGTH * 0.7 : BEAM_STRENGTH)
  const beam = new Mesh(beamGeometry, beamMaterial)
  beam.renderOrder = 2
  model.group.add(beam)
  const tailGeometry = new PlaneGeometry(1.8, 1.5)
  tailGeometry.rotateX(-Math.PI / 2)
  tailGeometry.translate(0, ROAD_LIFT, 1.6)
  const tailMaterial = glowMaterial(kit.pool, kartNight.tailGlow, 0.3)
  const tail = new Mesh(tailGeometry, tailMaterial)
  tail.renderOrder = 2
  model.group.add(tail)
  const tailColour = new Color(kartNight.tailGlow)
  let spot: SpotLight | null = null
  if (level === 'spot') {
    // Over the nose, reaching down the road: it lights what stands ahead (walls, karts, scenery)
    spot = new SpotLight(kartNight.beam, 110, 48, 0.42, 0.6, 1.25)
    spot.position.set(0, 1.1, -1)
    spot.target.position.set(0, 0, -16)
    model.group.add(spot, spot.target)
  }
  return {
    update() {
      const braking = model.braking()
      tailMaterial.color.copy(tailColour).multiplyScalar(0.12 + braking * 0.5)
    },
    dispose() {
      model.group.remove(beam, tail)
      if (spot) {
        model.group.remove(spot, spot.target)
        spot.dispose()
      }
      beamGeometry.dispose()
      beamMaterial.dispose()
      tailGeometry.dispose()
      tailMaterial.dispose()
    },
  }
}

export interface LampSpot {
  /** The pool's middle, on the road */
  readonly x: number
  readonly z: number
  readonly y: number
  /** Where its post stands, beside the road */
  readonly postX: number
  readonly postZ: number
  /** Which way the lamp head reaches, radians about y (towards the road) */
  readonly facing: number
}

/** Where the street lamps go: every LAMP_SPACING metres along the road, one side then the other */
export function lampSpots(road: Track['road'], spacing = LAMP_SPACING): LampSpot[] {
  const spots: LampSpot[] = []
  let travelled = spacing / 2
  let side = 1
  for (let index = 0; index < road.length; index++) {
    const a = road[index]!
    const b = road[(index + 1) % road.length]!
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length === 0) continue
    const dx = (b.x - a.x) / length
    const dz = (b.z - a.z) / length
    while (travelled <= length) {
      const share = travelled / length
      const x = a.x + (b.x - a.x) * share
      const z = a.z + (b.z - a.z) * share
      const width = a.width + (b.width - a.width) * share
      const y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * share
      // To the right of the way is (-dz, dx)
      const nx = -dz * side
      const nz = dx * side
      const inward = Math.max(0, width / 2 - 2.5)
      const out = width / 2 + 0.9
      spots.push({
        x: x + nx * inward,
        z: z + nz * inward,
        y,
        postX: x + nx * out,
        postZ: z + nz * out,
        facing: Math.atan2(nx, nz),
      })
      side = -side
      travelled += spacing
    }
    travelled -= length
  }
  return spots
}

/**
 * The street lamps of a night track: their pools on the road, and with `posts` a post and a lamp
 * head over each (the old street has its lanterns instead)
 */
export function buildStreetLights(track: Track, kit: NightKit, posts: boolean, colour: string): { group: Group; dispose(): void } {
  const group = new Group()
  const spots = lampSpots(track.road)
  const poolGeometry = new PlaneGeometry(POOL_SIZE, POOL_SIZE)
  poolGeometry.rotateX(-Math.PI / 2)
  const poolMaterial = glowMaterial(kit.pool, colour, POOL_STRENGTH)
  const pools = new InstancedMesh(poolGeometry, poolMaterial, Math.max(1, spots.length))
  pools.count = spots.length
  pools.renderOrder = 1
  const matrix = new Matrix4()
  const place = new Object3D()
  spots.forEach((spot, index) => {
    place.position.set(spot.x, spot.y + ROAD_LIFT, spot.z)
    place.rotation.set(0, 0, 0)
    place.updateMatrix()
    pools.setMatrixAt(index, place.matrix)
  })
  pools.frustumCulled = false
  group.add(pools)
  const geometries = [poolGeometry]
  const materials: Material[] = [poolMaterial]
  if (posts && spots.length > 0) {
    const postGeometry = new BoxGeometry(0.16, POST_HEIGHT, 0.16)
    postGeometry.translate(0, POST_HEIGHT / 2, 0)
    const armGeometry = new BoxGeometry(0.1, 0.1, 1.6)
    armGeometry.translate(0, POST_HEIGHT, -0.8)
    const headGeometry = new BoxGeometry(0.34, 0.1, 0.6)
    headGeometry.translate(0, POST_HEIGHT - 0.08, -1.45)
    const postMaterial = new MeshLambertMaterial({ color: kartNight.lampPost })
    const headMaterial = new MeshBasicMaterial({ color: new Color(kartNight.lampHead).multiplyScalar(1.6), toneMapped: false })
    const postMesh = new InstancedMesh(postGeometry, postMaterial, spots.length)
    const armMesh = new InstancedMesh(armGeometry, postMaterial, spots.length)
    const headMesh = new InstancedMesh(headGeometry, headMaterial, spots.length)
    const turn = new Quaternion()
    const up = new Vector3(0, 1, 0)
    const at = new Vector3()
    const one = new Vector3(1, 1, 1)
    spots.forEach((spot, index) => {
      turn.setFromAxisAngle(up, spot.facing)
      matrix.compose(at.set(spot.postX, spot.y, spot.postZ), turn, one)
      postMesh.setMatrixAt(index, matrix)
      armMesh.setMatrixAt(index, matrix)
      headMesh.setMatrixAt(index, matrix)
    })
    for (const mesh of [postMesh, armMesh, headMesh]) {
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
    geometries.push(postGeometry, armGeometry, headGeometry)
    materials.push(headMaterial, postMaterial)
  }
  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}
