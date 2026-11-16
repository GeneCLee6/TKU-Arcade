// e9-t05, e9-t06a: the item race's things in the 3D scene, our own look: each item box a glowing
// amber cube stood on its corner with a pale core, bobbing and turning over the road, and a shield a
// clear blue bubble round its kart. Made once per scene; the boxes are shown or hidden as the room
// says they are there, the bubbles pooled and moved every frame.
import {
  BoxGeometry,
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

export interface ItemArt {
  update(
    boxes: readonly ItemBoxLook[],
    shields: readonly { x: number; z: number }[],
    seconds: number,
  ): void
  dispose(): void
}

const BOX_SIZE = 1.5
const BOX_HEIGHT = 1.4
const SHIELD_RADIUS = 2.1

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
  const boxes: Group[] = []
  const bubbles: Mesh[] = []
  let time = 0

  return {
    update(looks, shields, seconds) {
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
    },
    dispose() {
      for (const group of boxes) scene.remove(group)
      for (const mesh of bubbles) scene.remove(mesh)
      shell.dispose()
      core.dispose()
      bubble.dispose()
      shellMaterial.dispose()
      coreMaterial.dispose()
      shieldMaterial.dispose()
    },
  }
}
