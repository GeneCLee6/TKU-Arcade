// e9-t05, e9-t06a, e9-t06b: the item race's things in the 3D scene, our own look: each item box a
// glowing amber cube stood on its corner with a pale core, bobbing and turning over the road, and a
// shield a clear blue bubble round its kart. The shots (e9-t06b): a hailstone a pale icy ball
// spinning low over the road; a thundercloud three dark puffs with a yellow bolt hanging under them,
// high up; a mud puddle a flat brown disc with a darker middle. Made once per scene; the boxes are
// shown or hidden as the room says they are there, the bubbles and shots pooled and moved every frame.
import type { ShotItem } from '../../../shared/kart/shots.ts'
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  type Scene,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'

export interface ItemBoxLook {
  readonly x: number
  readonly z: number
  /** There to be taken now; a box just taken is hidden until it is back */
  readonly shown: boolean
}

/** A shot on the road this frame (e9-t06b), where this browser puts it */
export interface ShotLook {
  readonly n: number
  readonly item: ShotItem
  readonly x: number
  readonly z: number
}

export interface ItemArt {
  update(
    boxes: readonly ItemBoxLook[],
    shields: readonly { x: number; z: number }[],
    seconds: number,
    shots?: readonly ShotLook[],
  ): void
  dispose(): void
}

const BOX_SIZE = 1.5
const BOX_HEIGHT = 1.4
const SHIELD_RADIUS = 2.1
const HAIL_RADIUS = 0.6
const HAIL_HEIGHT = 0.9
const CLOUD_HEIGHT = 4.2
const PUDDLE_RADIUS = 1.9

/** A lit material that glows a little in its own colour */
const glowing = (colour: string, glow: number) =>
  new MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: glow })

export function createItemArt(scene: Scene): ItemArt {
  const shell = new BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE)
  const core = new BoxGeometry(BOX_SIZE * 0.45, BOX_SIZE * 0.45, BOX_SIZE * 0.45)
  const bubble = new IcosahedronGeometry(SHIELD_RADIUS, 2)
  const shellMaterial = new MeshLambertMaterial({
    color: kartScene.itemBox,
    emissive: kartScene.itemBox,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.78,
  })
  const coreMaterial = new MeshLambertMaterial({
    color: kartScene.itemBoxCore,
    emissive: kartScene.itemBoxCore,
    emissiveIntensity: 0.9,
  })
  const shieldMaterial = new MeshLambertMaterial({
    color: kartScene.shield,
    emissive: kartScene.shield,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  })
  // The shots (e9-t06b)
  const hailBall = new IcosahedronGeometry(HAIL_RADIUS, 0)
  const puff = new IcosahedronGeometry(1, 1)
  const bolt = new ConeGeometry(0.35, 1.6, 4)
  const puddleDisc = new CylinderGeometry(PUDDLE_RADIUS, PUDDLE_RADIUS, 0.06, 20)
  const puddleMiddle = new CylinderGeometry(PUDDLE_RADIUS * 0.55, PUDDLE_RADIUS * 0.55, 0.08, 16)
  const hailMaterial = glowing(kartScene.hail, 0.5)
  const cloudMaterial = glowing(kartScene.cloud, 0.15)
  const boltMaterial = glowing(kartScene.bolt, 0.9)
  const puddleMaterial = glowing(kartScene.puddle, 0.05)
  const puddleDeepMaterial = glowing(kartScene.puddleDeep, 0.05)
  const makeShot = (item: ShotItem): Group => {
    const group = new Group()
    if (item === 'hail') {
      group.add(new Mesh(hailBall, hailMaterial))
    } else if (item === 'cloud') {
      const puffs: [number, number, number, number][] = [
        [-0.9, 0, 0, 1],
        [0.9, 0, 0.1, 1.05],
        [0, 0.45, -0.1, 1.25],
      ]
      for (const [x, y, z, size] of puffs) {
        const mesh = new Mesh(puff, cloudMaterial)
        mesh.position.set(x, y, z)
        mesh.scale.setScalar(size)
        group.add(mesh)
      }
      const strike = new Mesh(bolt, boltMaterial)
      strike.position.set(0, -1.5, 0)
      strike.rotation.z = Math.PI
      group.add(strike)
    } else {
      const deep = new Mesh(puddleMiddle, puddleDeepMaterial)
      deep.position.y = 0.02
      group.add(new Mesh(puddleDisc, puddleMaterial), deep)
    }
    scene.add(group)
    return group
  }
  /** The shots drawn, by their number: made when one first appears, taken away when it is gone */
  const shotGroups = new Map<number, Group>()

  const boxes: Group[] = []
  const bubbles: Mesh[] = []
  let time = 0

  return {
    update(looks, shields, seconds, shots = []) {
      time += seconds
      while (boxes.length < looks.length) {
        const group = new Group()
        const outer = new Mesh(shell, shellMaterial)
        // Stood on a corner
        outer.rotation.set(Math.PI / 4, 0, Math.atan(Math.SQRT1_2))
        group.add(outer, new Mesh(core, coreMaterial))
        scene.add(group)
        boxes.push(group)
      }
      looks.forEach((look, index) => {
        const group = boxes[index]!
        group.visible = look.shown
        if (!look.shown) return
        // Each a little out of step with the next, so a row does not move as one
        const phase = time * 1.6 + index * 0.7
        group.position.set(look.x, BOX_HEIGHT + Math.sin(phase) * 0.18, look.z)
        group.rotation.y = time * 1.4 + index
      })
      for (let i = looks.length; i < boxes.length; i++) boxes[i]!.visible = false

      while (bubbles.length < shields.length) {
        const mesh = new Mesh(bubble, shieldMaterial)
        scene.add(mesh)
        bubbles.push(mesh)
      }
      bubbles.forEach((mesh, index) => {
        const at = shields[index]
        mesh.visible = at !== undefined
        if (!at) return
        mesh.position.set(at.x, 0.9, at.z)
        mesh.rotation.y = time * 0.8
        mesh.scale.setScalar(1 + Math.sin(time * 5) * 0.03)
      })

      const live = new Set<number>()
      for (const shot of shots) {
        live.add(shot.n)
        let group = shotGroups.get(shot.n)
        if (!group) {
          group = makeShot(shot.item)
          shotGroups.set(shot.n, group)
        }
        if (shot.item === 'hail') {
          group.position.set(shot.x, HAIL_HEIGHT, shot.z)
          group.rotation.set(time * 9, time * 7, 0)
        } else if (shot.item === 'cloud') {
          group.position.set(shot.x, CLOUD_HEIGHT + Math.sin(time * 3 + shot.n) * 0.2, shot.z)
          group.rotation.y = time * 0.6
        } else {
          group.position.set(shot.x, 0.04, shot.z)
        }
      }
      for (const [n, group] of shotGroups) {
        if (live.has(n)) continue
        scene.remove(group)
        shotGroups.delete(n)
      }
    },
    dispose() {
      for (const group of boxes) scene.remove(group)
      for (const mesh of bubbles) scene.remove(mesh)
      for (const group of shotGroups.values()) scene.remove(group)
      shotGroups.clear()
      for (const geometry of [hailBall, puff, bolt, puddleDisc, puddleMiddle]) geometry.dispose()
      for (const material of [
        hailMaterial,
        cloudMaterial,
        boltMaterial,
        puddleMaterial,
        puddleDeepMaterial,
      ]) {
        material.dispose()
      }
      shell.dispose()
      core.dispose()
      bubble.dispose()
      shellMaterial.dispose()
      coreMaterial.dispose()
      shieldMaterial.dispose()
    },
  }
}
