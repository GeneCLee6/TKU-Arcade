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
  /** The parts going into it, and how many vertices and indices they make */
  parts: Mesh[]
  vertices: number
  indices: number
  castShadow: boolean
  /** Every paint drawn as one (kartParts.ts's createPaintMaterial): each vertex carries its own look */
  painted: boolean
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
 * it. Returns the skeleton (to dispose of), or null when there was nothing to skin. Counted first and
 * written straight into typed arrays: a race builds eight of these at once
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
    if (!mesh.parent || !boneIndex.has(mesh.parent) || Array.isArray(mesh.material)) continue
    const own = mesh.material as Material
    const painted = paint !== undefined && own.userData.paint !== undefined
    const material = painted ? paint : own
    let bucket = buckets.get(material)
    if (!bucket) {
      bucket = { parts: [], vertices: 0, indices: 0, castShadow: mesh.castShadow, painted }
      buckets.set(material, bucket)
    }
    bucket.parts.push(mesh)
    const count = mesh.geometry.getAttribute('position').count
    bucket.vertices += count
    bucket.indices += mesh.geometry.getIndex()?.count ?? count
  }
  const skeleton = new Skeleton(bones)
  for (const [material, bucket] of buckets) {
    const n = bucket.vertices
    const positions = new Float32Array(n * 3)
    const normals = new Float32Array(n * 3)
    const uvs = new Float32Array(n * 2)
    const skinIndex = new Uint16Array(n * 4)
    const skinWeight = new Float32Array(n * 4)
    const indices = n > 65535 ? new Uint32Array(bucket.indices) : new Uint16Array(bucket.indices)
    const colours = bucket.painted ? new Float32Array(n * 3) : null
    const rms = bucket.painted ? new Float32Array(n * 2) : null
    const glows = bucket.painted ? new Float32Array(n * 3) : null
    const envs = bucket.painted ? new Float32Array(n * 2) : null
    let at = 0
    let indexAt = 0
    for (const mesh of bucket.parts) {
      const bone = boneIndex.get(mesh.parent!)!
      const look = bucket.painted ? ((mesh.material as Material).userData.paint as PaintLook) : null
      const bend = mesh.userData.skin as SkinBend | undefined
      const next = bend ? boneIndex.get(bend.next) : undefined
      const geometry = mesh.geometry
      const position = geometry.getAttribute('position')
      const normalOf = geometry.getAttribute('normal')
      const uv = geometry.getAttribute('uv')
      place.multiplyMatrices(toRoot, mesh.matrixWorld)
      normalMatrix.getNormalMatrix(place)
      const first = at
      for (let i = 0; i < position.count; i++, at++) {
        vertex.fromBufferAttribute(position, i)
        // How far down the limb this vertex is: in its bone's frame (the part's own place applied)
        inParent.copy(vertex).applyMatrix4(mesh.matrix)
        vertex.applyMatrix4(place)
        positions.set([vertex.x, vertex.y, vertex.z], at * 3)
        if (normalOf) normal.fromBufferAttribute(normalOf, i).applyMatrix3(normalMatrix).normalize()
        else normal.set(0, 1, 0)
        normals.set([normal.x, normal.y, normal.z], at * 3)
        if (uv) uvs.set([uv.getX(i), uv.getY(i)], at * 2)
        const share = bend && next !== undefined ? jointShare(inParent.y, bend.joint) : 0
        skinIndex[at * 4] = bone
        skinIndex[at * 4 + 1] = next ?? 0
        skinWeight[at * 4] = 1 - share
        skinWeight[at * 4 + 1] = share
        if (look && colours && rms && glows && envs) {
          colours.set([look.color.r, look.color.g, look.color.b], at * 3)
          rms.set([look.roughness, look.metalness], at * 2)
          glows.set([look.emissive.r, look.emissive.g, look.emissive.b], at * 3)
          envs.set([look.env, look.woven ? 1 : 0], at * 2)
        }
      }
      const index = geometry.getIndex()
      if (index) for (let i = 0; i < index.count; i++) indices[indexAt++] = first + index.getX(i)
      else for (let i = 0; i < position.count; i++) indices[indexAt++] = first + i
      mesh.parent!.remove(mesh)
      geometry.dispose()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
    if (colours && rms && glows && envs) {
      geometry.setAttribute('color', new BufferAttribute(colours, 3))
      geometry.setAttribute('paintRM', new BufferAttribute(rms, 2))
      geometry.setAttribute('paintEmissive', new BufferAttribute(glows, 3))
      geometry.setAttribute('paintEnv', new BufferAttribute(envs, 2))
    }
    geometry.setIndex(new BufferAttribute(indices, 1))
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
 * attributes: what a merged, still copy of it is made from (kartParts.ts's mergeTree). The hand
 * shapes not shown (their bones at no size) are left out
 */
export function bakeSkinned(mesh: SkinnedMesh): BufferGeometry {
  const source = mesh.geometry
  const position = source.getAttribute('position')
  const normals = source.getAttribute('normal')
  const skinIndex = source.getAttribute('skinIndex')
  const bones = mesh.skeleton.bones
  const shown = (i: number) => bones[skinIndex.getX(i)]!.scale.x !== 0
  const index = source.getIndex()
  const corners: number[] = []
  const total = index ? index.count : position.count
  for (let i = 0; i < total; i += 3) {
    const a = index ? index.getX(i) : i
    const b = index ? index.getX(i + 1) : i + 1
    const c = index ? index.getX(i + 2) : i + 2
    if (shown(a) && shown(b) && shown(c)) corners.push(a, b, c)
  }
  // The vertices as the bones hold them, each once
  const placed = new Float32Array(position.count * 3)
  const turned = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    bent.fromBufferAttribute(position, i)
    mesh.applyBoneTransform(i, bent)
    placed.set([bent.x, bent.y, bent.z], i * 3)
    bentNormal.set(normals.getX(i), normals.getY(i), normals.getZ(i), 0)
    mesh.applyBoneTransform(i, bentNormal)
    const length = Math.hypot(bentNormal.x, bentNormal.y, bentNormal.z) || 1
    turned.set([bentNormal.x / length, bentNormal.y / length, bentNormal.z / length], i * 3)
  }
  const geometry = new BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    if (name === 'skinIndex' || name === 'skinWeight') continue
    const from = source.getAttribute(name)
    const size = from.itemSize
    const values = name === 'position' ? placed : name === 'normal' ? turned : (from.array as Float32Array)
    const out = new Float32Array(corners.length * size)
    for (const [at, corner] of corners.entries()) {
      for (let k = 0; k < size; k++) out[at * size + k] = values[corner * size + k]!
    }
    geometry.setAttribute(name, new BufferAttribute(out, size))
  }
  return geometry
}
