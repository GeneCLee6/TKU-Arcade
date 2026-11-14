// 2026-11-14 (owner: "still too slow"): streaks of light rushing past the edges of the view when
// the kart goes fast, brighter in a boost. Thin lines in the camera's own space, on a ring round the
// middle of the view so that the road ahead stays clear; their far ends are dark, so with added
// light they fade in from nothing. One draw call, reused every frame; nothing for a viewer who asked
// for less motion.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  type Object3D,
} from 'three'
import { kartScene } from '../../styles/kartTokens.ts'

const LINES = 56
/** How far ahead of the camera the streaks start and where they pass it, metres */
const FAR = 34
const NEAR = 1.5
/** The ring: the middle of the view stays clear */
const INNER = 3
const OUTER = 5.5

export interface SpeedLines {
  /** `pace` is speed over the plain top speed (1 flat out, 1.4 in a boost); `seconds` the frame */
  update(pace: number, speed: number, seconds: number, reducedMotion: boolean): void
  dispose(): void
}

export function createSpeedLines(camera: Object3D): SpeedLines {
  const positions = new Float32Array(LINES * 2 * 3)
  const colours = new Float32Array(LINES * 2 * 3)
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
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
  })
  const mesh = new LineSegments(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  mesh.visible = false
  camera.add(mesh)
  const tint = new Color(kartScene.speedLine)

  return {
    update(pace, speed, seconds, reducedMotion) {
      // From just under flat out, rising through a boost
      const strength = reducedMotion ? 0 : Math.max(0, Math.min(1, (pace - 0.85) / 0.55))
      mesh.visible = strength > 0
      if (!mesh.visible) return
      lines.forEach((line, index) => {
        // Rushing past a little faster than the kart, so they read as speed
        line.z -= speed * 1.4 * seconds
        if (line.z < NEAR) {
          line.z += FAR - NEAR
          line.angle = Math.random() * Math.PI * 2
          line.radius = INNER + Math.random() * (OUTER - INNER)
          line.length = 2 + Math.random() * 4 * (0.5 + strength)
        }
        // The farther away, the nearer the middle it looks: a ring that opens out towards the camera
        const x = Math.cos(line.angle) * line.radius
        const y = Math.sin(line.angle) * line.radius * 0.6
        const at = index * 6
        positions.set([x, y, -line.z, x, y, -(line.z + line.length)], at)
        const glow = strength * 0.55 * (1 - line.z / FAR)
        colours.set([tint.r * glow, tint.g * glow, tint.b * glow, 0, 0, 0], at)
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
