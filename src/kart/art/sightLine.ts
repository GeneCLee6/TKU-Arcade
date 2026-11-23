// 2026-11-23 (docs/ARCHITECTURE.md §4.96; #176's known limit): whether anything solid in a track's
// art stands between two points, for the group shot before the start (director.ts's
// `pickGroupAngle`) to stand where it sees every kart. Asked of the art as it is drawn (a building,
// a wall, a landmark, a tree, a hill), so it holds for every track, a reversed one and one made in
// the editor alike. Three.js alone, no canvas: tests/kart/groupShotSight.test.ts asks it of every
// track in Node.
import { Raycaster, Vector3, type Material, type Mesh, type Object3D } from 'three'
import type { Point3, SightBlocked } from '../director.ts'

/** Hits this close to either end do not count: the road under the kart, the camera's own spot */
export const SIGHT_SLACK_NEAR = 0.3
export const SIGHT_SLACK_FAR = 1.0

/** A material that hides what is behind it: not a see-through beam, glow or decal */
function solidMaterial(material: Material | readonly Material[]): boolean {
  const list = Array.isArray(material) ? material : [material as Material]
  return list.some(
    (one) => one.visible && one.colorWrite !== false && !(one.transparent && one.opacity < 0.6) && one.depthWrite,
  )
}

/** Every mesh shown under `root` that hides what is behind it */
function solidMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  const visit = (node: Object3D) => {
    if (!node.visible) return
    const mesh = node as Mesh
    if (mesh.isMesh && mesh.geometry && solidMaterial(mesh.material)) meshes.push(mesh)
    for (const child of node.children) visit(child)
  }
  root.updateMatrixWorld(true)
  visit(root)
  return meshes
}

/**
 * A test of the line between two points against what is drawn under `root`, both ways along it (a
 * wall or a hill drawn one-sided is seen from its front alone). The meshes are gathered the first
 * time it is asked
 */
export function createSightTest(root: Object3D): SightBlocked {
  let meshes: Mesh[] | null = null
  const ray = new Raycaster()
  const from = new Vector3()
  const to = new Vector3()
  const way = new Vector3()
  const hitBetween = (a: Point3, b: Point3, nearSlack: number, farSlack: number): boolean => {
    from.set(a.x, a.y, a.z)
    to.set(b.x, b.y, b.z)
    const length = way.subVectors(to, from).length()
    if (length <= nearSlack + farSlack) return false
    ray.set(from, way.normalize())
    ray.near = nearSlack
    ray.far = length - farSlack
    meshes ??= solidMeshes(root)
    return ray.intersectObjects(meshes, false).length > 0
  }
  return (eye, point) =>
    hitBetween(eye, point, SIGHT_SLACK_NEAR, SIGHT_SLACK_FAR) ||
    hitBetween(point, eye, SIGHT_SLACK_FAR, SIGHT_SLACK_NEAR)
}
