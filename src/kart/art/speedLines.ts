// 2026-11-14 (owner: "still too slow"): streaks of light rushing past the edges of the view when
// the kart goes fast, brighter in a boost. In the camera's own space, on a ring round the middle of
// the view so that the road ahead stays clear; their far ends are dark, so with added light they
// fade in from nothing. One draw call, reused every frame; nothing for a viewer who asked for less
// motion. 2026-11-17 (owner: "a perfect start has to feel like a launch"): thin ribbons instead of
// one-pixel lines, so that they show on any screen, and they come with any boost, a start from a
// standstill included, not only near the top speed.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'

const LINES = 72
/** How far ahead of the camera the streaks start and where they pass it, metres */
const FAR = 34
const NEAR = 1.5
/** The ring: the middle of the view stays clear */
const INNER = 3
const OUTER = 5.5
/** A streak's width, metres, at no strength and how much more at full */
const WIDTH = 0.012
const WIDTH_MORE = 0.03
/** In a boost the streaks rush by at least this fast, m/s, even from a standstill */
const BOOST_RUSH = 60

/** How strong the streaks are, 0 to 1: from just under flat out, or with any boost */
export const speedLineStrength = (pace: number, boost: number): number =>
  Math.max(0, Math.min(1, Math.max((pace - 0.92) / 0.5, boost * 0.85)))

export interface SpeedLines {
  /**
   * `pace` is speed over the plain top speed (1 flat out, 1.3 in a boost); `seconds` the frame;
   * `boost` 0 to 1, how far into a boost the view is (the camera's own easing), plus its kick
   */
  update(pace: number, speed: number, seconds: number, reducedMotion: boolean, boost?: number): void
  dispose(): void
}

export function createSpeedLines(camera: Object3D): SpeedLines {
  const positions = new Float32Array(LINES * 4 * 3)
  const colours = new Float32Array(LINES * 4 * 3)
  const indices = new Uint16Array(LINES * 6)
  for (let line = 0; line < LINES; line++) {
    const a = line * 4
    indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], line * 6)
  }
  const lines = Array.from({ length: LINES }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: INNER + Math.random() * (OUTER - INNER),
    z: NEAR + Math.random() * (FAR - NEAR),
    length: 2 + Math.random() * 4,
  }))
  const geometry = new BufferGeometry()
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
  const colourAttribute = new BufferAttribute(colours, 3).setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colourAttribute)
  geometry.setIndex(new BufferAttribute(indices, 1))
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  mesh.visible = false
  camera.add(mesh)
  const tint = new Color(kartScene.speedLine)

  return {
    update(pace, speed, seconds, reducedMotion, boost = 0) {
      const strength = reducedMotion ? 0 : speedLineStrength(pace, boost)
      mesh.visible = strength > 0
      if (!mesh.visible) return
      const rush = Math.max(speed, BOOST_RUSH * Math.min(1, boost))
      const half = (WIDTH + WIDTH_MORE * strength) / 2
      lines.forEach((line, index) => {
        // Rushing past a little faster than the kart, so they read as speed
        line.z -= rush * 1.4 * seconds
        if (line.z < NEAR) {
          line.z += FAR - NEAR
          line.angle = Math.random() * Math.PI * 2
          line.radius = INNER + Math.random() * (OUTER - INNER)
          line.length = 2 + Math.random() * 5 * (0.5 + strength)
        }
        // The farther away, the nearer the middle it looks: a ring that opens out towards the camera
        const cos = Math.cos(line.angle)
        const sin = Math.sin(line.angle)
        const x = cos * line.radius
        const y = sin * line.radius * 0.6
        // Across the ring: the ribbon faces the middle of the view
        const wx = -sin * half
        const wy = cos * half
        const near = -line.z
        const far = -(line.z + line.length)
        const at = index * 12
        positions.set([x - wx, y - wy, near, x + wx, y + wy, near, x, y, far, x, y, far], at)
        const glow = strength * 0.5 * (1 - line.z / FAR)
        const r = tint.r * glow
        const g = tint.g * glow
        const b = tint.b * glow
        colours.set([r, g, b, r, g, b, 0, 0, 0, 0, 0, 0], at)
      })
      positionAttribute.needsUpdate = true
      colourAttribute.needsUpdate = true
    },
    dispose() {
      camera.remove(mesh)
      geometry.dispose()
      material.dispose()
    },
  }
}
