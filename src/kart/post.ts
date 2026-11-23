// 2026-11-18 (owner: "the picture is not good-looking enough yet ... more and more real"): how the
// picture is developed after the scene is drawn, at medium and high quality (quality.ts; low draws
// straight to the screen, as before, for an old phone). Our own small chain, written here rather
// than taken from three.js's examples, so that it costs a few kilobytes and one pass more than it
// needs:
//
// 1. the scene, into a buffer that keeps light brighter than white (the lit strips, the thruster
//    mouths and the flames are drawn brighter than white on purpose);
// 2. bloom: what is brighter than white, halved in size a few times and added back up, so that
//    lights glow;
// 3. one last pass: the glow added, heat shimmer behind the thrusters and a streak towards the edges
//    while a boost runs (high only), a gentle tone curve that leaves colours as they were and rolls
//    the highlights off, a slight vignette, and the screen's colour space.
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'

/** `bloom` is the glow and the tone curve; `full` adds the vignette, the shimmer and the streak */
export type PostLevel = 'off' | 'bloom' | 'full'

/** What the last pass is told each frame */
export interface PostFrame {
  /** 0 to 1: how far into a boost the view is (camera.ts's rig): the streak towards the edges */
  readonly boost: number
  /**
   * Heat shimmer: where on the screen (0 to 1 from the bottom left), how far it reaches (as a share
   * of the screen's height) and how strong, 0 to 1. Up to two; none while nothing burns
   */
  readonly heat: readonly { readonly x: number; readonly y: number; readonly reach: number; readonly strength: number }[]
  /** Seconds, for the shimmer's wobble */
  readonly time: number
}

export interface Post {
  /** How much brighter than white a lit part may be drawn (kartModel.ts's KartFinish.glow) */
  readonly glow: number
  render(scene: Scene, camera: Camera, frame: PostFrame): void
  /** After the renderer's size changes */
  resize(): void
  /**
   * 2026-11-23 (resolution.ts's `starved`): stops smoothing the scene's edges (its buffer's
   * multisampling), for a phone that cannot keep up even with fewer pixels
   */
  shed(): void
  /** Whether the scene's edges are still smoothed */
  readonly smoothed: boolean
  dispose(): void
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

// What is brighter than `threshold` (with a soft knee), a quarter of the pixels
const BRIGHT = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
vec3 bright(vec2 uv) {
  vec3 c = clamp(texture2D(map, uv).rgb, vec3(0.0), vec3(24.0));
  float peak = max(c.r, max(c.g, c.b));
  float soft = clamp(peak - threshold + 0.35, 0.0, 0.7);
  float keep = max(peak - threshold, soft * soft / 1.4) / max(peak, 1e-4);
  return c * keep;
}
void main() {
  vec3 sum = bright(vUv + texel * vec2(-1.0, -1.0)) + bright(vUv + texel * vec2(1.0, -1.0))
    + bright(vUv + texel * vec2(-1.0, 1.0)) + bright(vUv + texel * vec2(1.0, 1.0));
  gl_FragColor = vec4(sum * 0.25, 1.0);
}`

const DOWN = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(map, vUv).rgb * 4.0
    + texture2D(map, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(map, vUv + texel * vec2(1.0, -1.0)).rgb
    + texture2D(map, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(map, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(sum / 8.0, 1.0);
}`

// The smaller level, spread with a tent, added to the level above it
const UP = /* glsl */ `
uniform sampler2D map;
uniform sampler2D above;
uniform vec2 texel;
uniform float spread;
varying vec2 vUv;
void main() {
  vec2 d = texel * spread;
  vec3 sum = texture2D(map, vUv).rgb * 4.0
    + (texture2D(map, vUv + vec2(d.x, 0.0)).rgb + texture2D(map, vUv - vec2(d.x, 0.0)).rgb
     + texture2D(map, vUv + vec2(0.0, d.y)).rgb + texture2D(map, vUv - vec2(0.0, d.y)).rgb) * 2.0
    + texture2D(map, vUv + d).rgb + texture2D(map, vUv - d).rgb
    + texture2D(map, vUv + vec2(d.x, -d.y)).rgb + texture2D(map, vUv + vec2(-d.x, d.y)).rgb;
  gl_FragColor = vec4(sum / 16.0 + texture2D(above, vUv).rgb, 1.0);
}`

const FINAL = /* glsl */ `
uniform sampler2D map;
uniform sampler2D bloom;
uniform float strength;
uniform float vignette;
uniform float streak;
uniform float aspect;
uniform float time;
uniform vec4 heatA;
uniform vec4 heatB;
varying vec2 vUv;

// 2026-11-18 (owner: "more esports"): a broadcast's grade before the curve. A little more contrast
// about a mid grey and a little more colour, so that blacks are black and the neon is neon
vec3 grade(vec3 c) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.14);
  return max((c - 0.2) * 1.1 + 0.2, vec3(0.0));
}

// A neutral tone curve: colours below the shoulder are left as they are, highlights roll off
vec3 develop(vec3 c) {
  const float shoulder = 0.76;
  const float desaturate = 0.15;
  float low = min(c.r, min(c.g, c.b));
  float offset = low < 0.08 ? low - 6.25 * low * low : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < shoulder) return c;
  float d = 1.0 - shoulder;
  float rolled = 1.0 - d * d / (peak + d - shoulder);
  c *= rolled / peak;
  float g = 1.0 - 1.0 / (desaturate * (peak - rolled) + 1.0);
  return mix(c, vec3(rolled), g);
}

vec2 shimmer(vec2 uv, vec4 heat) {
  if (heat.w <= 0.0) return vec2(0.0);
  vec2 away = (uv - heat.xy) * vec2(aspect, 1.0);
  float near = 1.0 - smoothstep(0.0, heat.z, length(away));
  float wave = sin(uv.y * 190.0 - time * 31.0) + sin(uv.x * 140.0 + uv.y * 90.0 + time * 23.0);
  return vec2(wave, wave * 0.6) * near * heat.w * 0.0022;
}

void main() {
  vec2 uv = vUv;
#ifdef FULL
  uv += shimmer(uv, heatA) + shimmer(uv, heatB);
#endif
  vec3 colour = texture2D(map, uv).rgb;
#ifdef FULL
  // A boost streaks the picture away from its middle, most at the edges
  vec2 out_ = uv - vec2(0.5, 0.45);
  float far = dot(out_, out_);
  float pull = streak * smoothstep(0.04, 0.4, far) * 0.008;
  if (pull > 0.0002) {
    // Six steps towards the middle, started at a different place in each pixel so that the steps
    // do not show as copies of the picture
    float start = fract(sin(dot(gl_FragCoord.xy, vec2(41.31, 289.17))) * 9431.73);
    vec3 sum = colour;
    for (int tap = 0; tap < 6; tap++) {
      sum += texture2D(map, uv - out_ * pull * (float(tap) + start)).rgb;
    }
    colour = sum / 7.0;
  }
#endif
  colour += texture2D(bloom, uv).rgb * strength;
  colour = develop(grade(colour));
#ifdef FULL
  vec2 edge = (vUv - 0.5) * vec2(1.0, 1.15);
  colour *= 1.0 - vignette * smoothstep(0.18, 0.75, dot(edge, edge) * 1.6);
#endif
  // To the screen's colour space, with a little noise against banding
  colour = mix(colour * 12.92, 1.055 * pow(max(colour, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, colour));
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(colour + (grain - 0.5) / 255.0, 1.0);
}`

/** How many times the glow is halved, and how strong it is added back */
const LEVELS: Record<Exclude<PostLevel, 'off'>, number> = { bloom: 4, full: 5 }
// 2026-11-18: a tighter glow, from a little dimmer up: lit lines read as lines, not as fog
const STRENGTH = 0.48
/** How much of the light at the corners the vignette takes */
const VIGNETTE = 0.36

/**
 * The chain for `renderer`, or null where `level` is off. `samples` smooths the scene's edges (the
 * buffer's own multisampling: the canvas's does not reach a buffer)
 */
export function createPost(renderer: WebGLRenderer, level: PostLevel, samples: number): Post | null {
  if (level === 'off') return null
  // Light brighter than white needs a buffer that can hold it; without one, glow from white up
  const hdr =
    renderer.capabilities.isWebGL2 &&
    (renderer.extensions.has('EXT_color_buffer_half_float') ||
      renderer.extensions.has('EXT_color_buffer_float'))
  const type = hdr ? HalfFloatType : UnsignedByteType
  const size = renderer.getDrawingBufferSize(new Vector2())
  const target = (width: number, height: number, depth: boolean, msaa: number) =>
    new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      type,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: depth,
      samples: msaa,
    })
  const sceneTarget = target(size.x, size.y, true, samples)
  const levels = LEVELS[level]
  const downs: WebGLRenderTarget[] = []
  const ups: WebGLRenderTarget[] = []
  for (let index = 0; index < levels; index++) {
    downs.push(target(1, 1, false, 0))
    if (index < levels - 1) ups.push(target(1, 1, false, 0))
  }

  const pass = (fragment: string, uniforms: Record<string, { value: unknown }>, full = false) =>
    new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: fragment,
      uniforms,
      defines: full ? { FULL: '' } : {},
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
  const bright = pass(BRIGHT, {
    map: { value: null },
    texel: { value: new Vector2() },
    threshold: { value: hdr ? 1.3 : 0.9 },
  })
  const down = pass(DOWN, { map: { value: null }, texel: { value: new Vector2() } })
  const up = pass(UP, {
    map: { value: null },
    above: { value: null },
    texel: { value: new Vector2() },
    spread: { value: 0.85 },
  })
  const final = pass(
    FINAL,
    {
      map: { value: sceneTarget.texture },
      bloom: { value: null },
      strength: { value: STRENGTH },
      vignette: { value: VIGNETTE },
      streak: { value: 0 },
      aspect: { value: 1 },
      time: { value: 0 },
      heatA: { value: new Vector4() },
      heatB: { value: new Vector4() },
    },
    level === 'full',
  )
  const quadGeometry = new PlaneGeometry(2, 2)
  const quad = new Mesh(quadGeometry, bright)
  quad.frustumCulled = false
  const flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const resize = () => {
    renderer.getDrawingBufferSize(size)
    sceneTarget.setSize(size.x, size.y)
    let width = size.x
    let height = size.y
    for (let index = 0; index < levels; index++) {
      width = Math.max(1, Math.round(width / 2))
      height = Math.max(1, Math.round(height / 2))
      downs[index]!.setSize(width, height)
      ups[index]?.setSize(width, height)
    }
    final.uniforms.aspect!.value = size.x / Math.max(1, size.y)
  }
  resize()

  const draw = (material: ShaderMaterial, to: WebGLRenderTarget | null) => {
    quad.material = material
    renderer.setRenderTarget(to)
    renderer.render(quad, flat)
  }
  const texelOf = (of: WebGLRenderTarget, into: { value: unknown }) =>
    (into.value as Vector2).set(1 / of.width, 1 / of.height)

  return {
    glow: hdr ? 2.4 : 1,
    render(scene, camera, frame) {
      renderer.setRenderTarget(sceneTarget)
      renderer.render(scene, camera)

      // Down: the bright parts at half size, then halved again and again
      bright.uniforms.map!.value = sceneTarget.texture
      ;(bright.uniforms.texel!.value as Vector2).set(0.5 / size.x, 0.5 / size.y)
      draw(bright, downs[0]!)
      for (let index = 1; index < levels; index++) {
        down.uniforms.map!.value = downs[index - 1]!.texture
        texelOf(downs[index - 1]!, down.uniforms.texel!)
        draw(down, downs[index]!)
      }
      // Up: each level spread and added to the one above
      let smaller: Texture = downs[levels - 1]!.texture
      let smallerTarget = downs[levels - 1]!
      for (let index = levels - 2; index >= 0; index--) {
        up.uniforms.map!.value = smaller
        up.uniforms.above!.value = downs[index]!.texture
        texelOf(smallerTarget, up.uniforms.texel!)
        draw(up, ups[index]!)
        smaller = ups[index]!.texture
        smallerTarget = ups[index]!
      }

      final.uniforms.bloom!.value = smaller
      final.uniforms.streak!.value = frame.boost
      final.uniforms.time!.value = frame.time % 1000
      const [a, b] = frame.heat
      ;(final.uniforms.heatA!.value as Vector4).set(a?.x ?? 0, a?.y ?? 0, a?.reach ?? 0, a?.strength ?? 0)
      ;(final.uniforms.heatB!.value as Vector4).set(b?.x ?? 0, b?.y ?? 0, b?.reach ?? 0, b?.strength ?? 0)
      draw(final, null)
    },
    resize,
    shed() {
      if (sceneTarget.samples === 0) return
      sceneTarget.samples = 0
      // Made again on its next use, without the multisampled buffers (the texture stays the same)
      sceneTarget.dispose()
    },
    get smoothed() {
      return sceneTarget.samples > 0
    },
    dispose() {
      sceneTarget.dispose()
      for (const one of [...downs, ...ups]) one.dispose()
      for (const material of [bright, down, up, final]) material.dispose()
      quadGeometry.dispose()
    },
  }
}
