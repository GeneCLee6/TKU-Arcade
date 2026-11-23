// 2026-11-23 (docs/ARCHITECTURE.md §4.91): the driver's limbs as skin, made in code. The arms and
// the legs are built as rigid parts on their joints (driverModel.ts), the joints being bones; this
// turns every part under them into one skinned mesh a material, all of them sharing one skeleton. A
// part follows the bone it was built on, except a sleeve or a leg (`userData.skin`), whose vertices
// go over smoothly to the next joint down it across the elbow or the knee (driverLimbs.ts's
// jointShare), so that a bent arm or leg is one smooth piece with no seam. A hand's shapes (the
// fingers round a grip, a fist, a V ...) are all there, each on a bone of its own scaled to nothing
// unless it is the one shown: no draw of their own. Fewer draws than the rigid parts were (one a
// material for all four limbs, not one a material a joint).
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Vector3,
  Vector4,
  type Material,
  type Object3D,
} from 'three'
import { jointShare } from '../driverLimbs.ts'
import type { PaintLook } from './kartParts.ts'

/** On a part that bends over a joint: the bone below, and how far down from its own bone the joint is */
export interface SkinBend {
  readonly next: Bone
  readonly joint: number
}

interface Bucket {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  bones: number[]
  weights: number[]
  castShadow: boolean
  /** Every paint drawn as one (kartParts.ts's createPaintMaterial): each vertex's own look */
  paint: { colours: number[]; rms: number[]; glows: number[]; envs: number[] } | null
}

const place = new Matrix4()
const normalMatrix = new Matrix3()
const toRoot = new Matrix4()
const vertex = new Vector3()
const inParent = new Vector3()
const normal = new Vector3()

/**
 * Every mesh under `roots` (their bones and the parts built on them) made into skin: one SkinnedMesh
 * a material, added to `root` (the driver), bound as the joints stand now (the limbs hanging
 * straight, as built); given `paint` (kartParts.ts's createPaintMaterial), every paint as one mesh of
 * it. Returns the skeleton (to dispose of), or null when there was nothing to skin
 */
export function skinLimbs(root: Object3D, roots: readonly Object3D[], paint?: Material): Skeleton | null {
  root.updateMatrixWorld(true)
  toRoot.copy(root.matrixWorld).invert()
  const bones: Bone[] = []
  const meshes: Mesh[] = []
  for (const top of roots) {
    top.traverse((object) => {
      if (object instanceof Bone) bones.push(object)
      else if (object instanceof Mesh) meshes.push(object)
    })
  }
  if (meshes.length === 0) return null
  const boneIndex = new Map<Object3D, number>(bones.map((bone, index) => [bone, index]))
  const buckets = new Map<Material, Bucket>()
  for (const mesh of meshes) {
    const parent = mesh.parent
    const bone = parent ? boneIndex.get(parent) : undefined
    if (bone === undefined || Array.isArray(mesh.material)) continue
    const own = mesh.material as Material
    const look = paint ? (own.userData.paint as PaintLook | undefined) : undefined
    const material = look && paint ? paint : own
    let bucket = buckets.get(material)
    if (!bucket) {
      bucket = {
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
        bones: [],
        weights: [],
        castShadow: mesh.castShadow,
        paint: look ? { colours: [], rms: [], glows: [], envs: [] } : null,
      }
      buckets.set(material, bucket)
    }
    const bend = mesh.userData.skin as SkinBend | undefined
    const next = bend ? boneIndex.get(bend.next) : undefined
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    const uv = geometry.getAttribute('uv')
    place.multiplyMatrices(toRoot, mesh.matrixWorld)
    normalMatrix.getNormalMatrix(place)
    const first = bucket.positions.length / 3
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i)
      // How far down the limb this vertex is: in its bone's frame (the part's own place applied)
      inParent.copy(vertex).applyMatrix4(mesh.matrix)
      vertex.applyMatrix4(place)
      bucket.positions.push(vertex.x, vertex.y, vertex.z)
      if (normals) normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize()
      else normal.set(0, 1, 0)
      bucket.normals.push(normal.x, normal.y, normal.z)
      if (uv) bucket.uvs.push(uv.getX(i), uv.getY(i))
      else bucket.uvs.push(0, 0)
      const share = bend && next !== undefined ? jointShare(inParent.y, bend.joint) : 0
      bucket.bones.push(bone, next ?? 0, 0, 0)
      if (bucket.paint && look) {
        bucket.paint.colours.push(look.color.r, look.color.g, look.color.b)
        bucket.paint.rms.push(look.roughness, look.metalness)
        bucket.paint.glows.push(look.emissive.r, look.emissive.g, look.emissive.b)
        bucket.paint.envs.push(look.env, look.woven ? 1 : 0)
      }
      bucket.weights.push(1 - share, share, 0, 0)
    }
    const index = geometry.getIndex()
    if (index) for (let i = 0; i < index.count; i++) bucket.indices.push(first + index.getX(i))
    else for (let i = 0; i < position.count; i++) bucket.indices.push(first + i)
    parent!.remove(mesh)
    geometry.dispose()
  }
  const skeleton = new Skeleton(bones)
  for (const [material, bucket] of buckets) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(bucket.positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(bucket.normals), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(bucket.uvs), 2))
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(bucket.bones), 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(bucket.weights), 4))
    if (bucket.paint) {
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(bucket.paint.colours), 3))
      geometry.setAttribute('paintRM', new BufferAttribute(new Float32Array(bucket.paint.rms), 2))
      geometry.setAttribute('paintEmissive', new BufferAttribute(new Float32Array(bucket.paint.glows), 3))
      geometry.setAttribute('paintEnv', new BufferAttribute(new Float32Array(bucket.paint.envs), 2))
    }
    const count = bucket.positions.length / 3
    geometry.setIndex(
      new BufferAttribute(count > 65535 ? new Uint32Array(bucket.indices) : new Uint16Array(bucket.indices), 1),
    )
    const skin = new SkinnedMesh(geometry, material)
    skin.castShadow = bucket.castShadow
    // Its bones go far from where it was bound (an arm raised): never culled by its bound pose's box
    skin.frustumCulled = false
    // flatten() leaves it be: it is drawn as it is
    skin.userData.live = true
    root.add(skin)
    skin.updateMatrixWorld(true)
    skin.bind(skeleton, skin.matrixWorld)
  }
  return skeleton
}

const bent = new Vector3()
const bentNormal = new Vector4()

/**
 * A skinned mesh's geometry as its bones hold it now, in its own frame and without the skin's
 * attributes: what a merged, still copy of it is made from (kartParts.ts's mergeTree)
 */
export function bakeSkinned(mesh: SkinnedMesh): BufferGeometry {
  const source = mesh.geometry
  const geometry = source.index ? source.toNonIndexed() : source.clone()
  const position = geometry.getAttribute('position') as BufferAttribute
  const normals = geometry.getAttribute('normal') as BufferAttribute | undefined
  // toNonIndexed keeps the skin's attributes alongside, vertex for vertex
  const skinned = new SkinnedMesh(geometry, mesh.material)
  skinned.skeleton = mesh.skeleton
  skinned.bindMatrix.copy(mesh.bindMatrix)
  skinned.bindMatrixInverse.copy(mesh.bindMatrixInverse)
  for (let i = 0; i < position.count; i++) {
    bent.fromBufferAttribute(position, i)
    skinned.applyBoneTransform(i, bent)
    if (normals) {
      bentNormal.set(normals.getX(i), normals.getY(i), normals.getZ(i), 0)
      skinned.applyBoneTransform(i, bentNormal)
      const length = Math.hypot(bentNormal.x, bentNormal.y, bentNormal.z) || 1
      normals.setXYZ(i, bentNormal.x / length, bentNormal.y / length, bentNormal.z / length)
    }
    position.setXYZ(i, bent.x, bent.y, bent.z)
  }
  geometry.deleteAttribute('skinIndex')
  geometry.deleteAttribute('skinWeight')
  return geometry
}
