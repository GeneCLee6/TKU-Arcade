// What the browser's WebGL can do, asked without three.js (2026-11-21: apart from Scene.ts, so that a
// page can ask before the engine's chunk is here, docs/ARCHITECTURE.md §4.52)

/** Asks for a throwaway context, so that a browser without WebGL 2 never reaches three.js */
export function supportsWebGL2(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) return false
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  return true
}

/**
 * Whether WebGL here is drawn by the processor rather than a graphics card (a browser with its
 * hardware acceleration off, a virtual machine, the browser tests): the picture is then drawn
 * straight to the screen whatever the quality and the karts' paint reflects nothing, since
 * developing the picture (post.ts) and making the environment map cost such a renderer dearly
 */
export function softwareRenderer(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) return false
  const info = probe.getExtension('WEBGL_debug_renderer_info')
  const name = info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
}
