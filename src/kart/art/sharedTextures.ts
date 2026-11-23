// 2026-11-23 (docs/KART-PERF.md §11): what keeps a renderer alive after it is gone. Every renderer
// that uploads a texture hangs a listener on it (three.js frees its copy when the texture is
// disposed); a texture that lives as long as the page holds every renderer that ever drew it, every
// buffer and closure of it. Two do: our bodies' detail tiles (bodyDetail.ts), and three.js's own
// lighting table for the standard material (its "DFG LUT", made once for the page and not exported).
// A race, its podium, the garage and the waiting room each made a renderer: about 0.35 MB of heap
// and a few DOM nodes stayed behind with every race (scripts/kart-fps.mjs `--scene soak`).
//
// Disposing a texture only frees its copies on the GPU and drops the listeners: the texture itself
// stays usable, and a renderer still drawing uploads it again on its next frame.
import { Texture, type Material, type Object3D, type WebGLRenderer } from 'three'
import { releaseBodyDetail } from './bodyDetail.ts'

/** three.js's table, once found (it is the same object for every renderer) */
let lut: Texture | null = null

/** Finds three.js's lighting table among what `renderer` drew of `root` */
function findLut(renderer: WebGLRenderer, root: Object3D): Texture | null {
  let found: Texture | null = null
  root.traverse((object) => {
    if (found) return
    const material = (object as { material?: Material | Material[] }).material
    for (const one of Array.isArray(material) ? material : material ? [material] : []) {
      const uniforms = (renderer.properties.get(one) as { uniforms?: Record<string, { value: unknown }> }).uniforms
      const value = uniforms?.dfgLUT?.value
      if (value instanceof Texture) {
        found = value
        return
      }
    }
  })
  return found
}

/**
 * Called by a renderer's owner as it goes, before its materials are disposed (they say where the
 * table is): the textures shared by the page let go of `renderer`
 */
export function releaseSharedTextures(renderer: WebGLRenderer, root: Object3D): void {
  lut ??= findLut(renderer, root)
  lut?.dispose()
  releaseBodyDetail()
}
