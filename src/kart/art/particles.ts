// 2026-11-20 (docs/KART-PERF.md): many small camera-facing quads in one draw. The karts' smoke, sparks
// and boost fire (effects.ts) and a hit's bits (hitArt.ts) were a three.js Sprite each, a draw call
// each: a grid of eight drifting karts drew three to four hundred of them a frame, and the scene held
// over a thousand objects to walk every frame. A batch is one instanced quad drawn once, each
// particle an instance written in this frame; it is drawn as a Sprite is (the same placement, size,
// turn, tint, texture, fog and colour handling), so the picture does not change.
import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Color,
  type Object3D,
  type Texture,
} from 'three'

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 offset;
attribute vec4 tint;
attribute float spin;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vUv = uv;
  vTint = tint;
  // As three.js's sprite: the centre into the view, then the quad laid flat across it
  vec4 mvPosition = modelViewMatrix * vec4(offset.xyz, 1.0);
  vec2 corner = position.xy * offset.w;
  float c = cos(spin);
  float s = sin(spin);
  mvPosition.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vec4 diffuseColor = vTint * texture2D(map, vUv);
  gl_FragColor = diffuseColor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

export interface ParticleBatch {
  readonly mesh: Mesh
  /** Room for this many at once */
  readonly capacity: number
  /** Starts this frame's particles: none */
  begin(): void
  /**
   * One particle this frame: its centre in the world, its size (metres across), its colour and
   * opacity, and how far it is turned on the screen (radians). Past the capacity, left out
   */
  add(x: number, y: number, z: number, size: number, color: Color, opacity: number, spin?: number): void
  /** Hands this frame's particles to the GPU; drawn not at all when there are none */
  end(): void
  dispose(): void
}

export interface ParticleOptions {
  readonly capacity: number
  readonly map: Texture
  /** Added light (sparks, fire, glows) or see-through (smoke) */
  readonly additive: boolean
}

/** A batch added to `world`; its texture stays the caller's */
export function createParticleBatch(world: Object3D, options: ParticleOptions): ParticleBatch {
  const { capacity } = options
  const quad = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('uv', quad.getAttribute('uv'))
  const offsets = new Float32Array(capacity * 4)
  const tints = new Float32Array(capacity * 4)
  const spins = new Float32Array(capacity)
  const offset = new InstancedBufferAttribute(offsets, 4).setUsage(DynamicDrawUsage)
  const tint = new InstancedBufferAttribute(tints, 4).setUsage(DynamicDrawUsage)
  const spin = new InstancedBufferAttribute(spins, 1).setUsage(DynamicDrawUsage)
  geometry.setAttribute('offset', offset)
  geometry.setAttribute('tint', tint)
  geometry.setAttribute('spin', spin)
  geometry.instanceCount = 0
  const uniforms = UniformsUtils.merge([UniformsLib.fog])
  uniforms.map = { value: options.map }
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: options.additive ? AdditiveBlending : NormalBlending,
    fog: true,
  })
  const mesh = new Mesh(geometry, material)
  // Its particles are anywhere; each is too small to be worth culling on its own
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.matrixAutoUpdate = false
  world.add(mesh)
  let count = 0
  // Turned particles (a hit's stars): their turns go up every frame once there have been any
  let spinning = false

  return {
    mesh,
    capacity,
    begin() {
      count = 0
    },
    add(x, y, z, size, color, opacity, turn = 0) {
      if (count >= capacity) return
      const at = count * 4
      offsets[at] = x
      offsets[at + 1] = y
      offsets[at + 2] = z
      offsets[at + 3] = size
      tints[at] = color.r
      tints[at + 1] = color.g
      tints[at + 2] = color.b
      tints[at + 3] = opacity
      spins[count] = turn
      if (turn !== 0) spinning = true
      count++
    },
    end() {
      geometry.instanceCount = count
      mesh.visible = count > 0
      if (count === 0) return
      offset.clearUpdateRanges()
      offset.addUpdateRange(0, count * 4)
      offset.needsUpdate = true
      tint.clearUpdateRanges()
      tint.addUpdateRange(0, count * 4)
      tint.needsUpdate = true
      if (spinning) {
        spin.clearUpdateRanges()
        spin.addUpdateRange(0, count)
        spin.needsUpdate = true
      }
    },
    dispose() {
      world.remove(mesh)
      quad.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
