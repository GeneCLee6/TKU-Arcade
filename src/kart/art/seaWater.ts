// 2026-11-22 (#115, docs/ARCHITECTURE.md §4.70): real water for the tracks by the sea and the river.
// The water used to be a flat plane with a scrolling picture on it; now, on the medium and high
// pictures, it is a lit surface: the deep water darker and bluer, the shallows by the shore lighter
// and greener with a line of foam where it meets the land, waves that catch the sun (the surface's
// normal bent by a few moving swells), and on high the swells lift the surface itself. Far off it
// fades into the scene's fog like everything else. On low it is the old flat plane (one texture, no
// shader of its own): the cheap way stays.
//
// The shore is told to the shader as a small picture of how deep the water is (0 at the shore, 1
// out at sea), painted once from a function of the track's own (`depthAt`), so that the shader
// needs no knowledge of the land. Our own shader code on three.js's standard material; no image.
import {
  BufferGeometry as Geometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
  UnsignedByteType,
  Vector4,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'

/** How much the water does, by the picture quality: 0 the flat plane, 1 lit with moving normals, 2 and swells */
export type WaterLevel = 0 | 1 | 2

export interface WaterKit {
  keep<T extends BufferGeometry>(geometry: T): T
  own<T extends Material>(material: T): T
  ownTexture<T extends Texture>(texture: T): T
}

export interface WaterOptions {
  /** The rectangle of water: its middle and size, metres; at height `y` */
  readonly x: number
  readonly z: number
  readonly width: number
  readonly depth: number
  readonly y: number
  /** How deep the water is at (x, z), 0 (the shore) to 1 (open water) */
  readonly depthAt: (x: number, z: number) => number
  readonly deep: string
  readonly shallow: string
  readonly foam: string
  /** The sky it shows at a glancing angle (the track's horizon colour) */
  readonly sky: string
  /** The flat plane's picture and its tint, for the low picture */
  readonly flatMap: Texture
  readonly flatColor?: string
  /** Metres per repeat of the flat picture */
  readonly flatRepeat?: number
  /** How high the swells stand, as a share of the open sea's (a river's are small); 1 when left out */
  readonly swell?: number
  /** Drawn over the ground it lies on (a river on the plain): pushed forward in the depth buffer */
  readonly overGround?: boolean
  /**
   * 2026-11-23 (docs/KART-PERF.md §11): where the camera goes (the track's box), world metres. On the
   * high picture the surface is cut a vertex every WAVE_VERTEX metres there and ever more coarsely
   * beyond it, where a swell of a few tens of centimetres is less than a pixel; left out, evenly
   */
  readonly near?: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
}

export interface Water {
  readonly mesh: Mesh
  update(seconds: number): void
}

/** On the high picture, a vertex about every this many metres, for the swells to lift */
export const WAVE_VERTEX = 12
/** Beyond `near` (and NEAR_MARGIN round it), each row of vertices this much further from the last ... */
const WAVE_GROWTH = 1.4
/** ... up to this far apart, metres */
const WAVE_FAR = 240
/** How far past the track's box the fine cut reaches, metres: the camera, a kart flying off a ramp */
export const NEAR_MARGIN = 150

/**
 * Where the rows of vertices go across [from, to]: every WAVE_VERTEX metres inside [nearFrom,
 * nearTo] (clipped to the span), growing by WAVE_GROWTH a row outside it; ends included, ascending
 */
export function waveTicks(from: number, to: number, nearFrom: number, nearTo: number): number[] {
  const a = Math.max(from, Math.min(to, nearFrom))
  const b = Math.max(a, Math.min(to, nearTo))
  const inside = b > a ? Math.max(1, Math.round((b - a) / WAVE_VERTEX)) : 0
  const ticks: number[] = []
  for (let i = 0; i <= inside; i++) ticks.push(inside === 0 ? a : a + ((b - a) * i) / inside)
  const outward = (start: number, end: number, sign: 1 | -1) => {
    const out: number[] = []
    let step = WAVE_VERTEX
    let at = start
    while (sign * (end - at) > 0) {
      step = Math.min(WAVE_FAR, step * WAVE_GROWTH)
      at = sign * (end - (at + sign * step)) < step * 0.5 ? end : at + sign * step
      out.push(at)
    }
    return out
  }
  return [...outward(a, from, -1).reverse(), ...ticks, ...outward(b, to, 1)]
}

/**
 * A flat grid like three.js's PlaneGeometry (in its own x and y, facing +z, rows from the top), its
 * columns at `xs` and its rows at `ys` (both ascending, centred on 0)
 */
function gradedPlane(xs: readonly number[], ys: readonly number[], width: number, height: number): Geometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const rows = [...ys].reverse()
  for (const y of rows) {
    for (const x of xs) {
      positions.push(x, y, 0)
      normals.push(0, 0, 1)
      uvs.push(x / width + 0.5, y / height + 0.5)
    }
  }
  const columns = xs.length
  const indices: number[] = []
  for (let iy = 0; iy < rows.length - 1; iy++) {
    for (let ix = 0; ix < columns - 1; ix++) {
      const a = ix + columns * iy
      const b = ix + columns * (iy + 1)
      const c = ix + 1 + columns * (iy + 1)
      const d = ix + 1 + columns * iy
      indices.push(a, b, d, b, c, d)
    }
  }
  const geometry = new Geometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  return geometry
}
/** The depth picture's size, texels a side */
const DEPTH_TEXELS = 128
/** The swells (direction x, direction z, wavelength m, height m, speed m/s): our own mix */
const SWELLS: readonly (readonly [number, number, number, number, number])[] = [
  [0.8, 0.6, 64, 0.32, 5.2],
  [-0.5, 0.86, 41, 0.22, 4.1],
  [0.2, -0.98, 23, 0.12, 3.1],
  [-0.9, -0.3, 13, 0.06, 2.3],
]

const GLSL_SWELLS = SWELLS.map(
  ([dx, dz, length, height, speed]) =>
    `wave(p, vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}), ${length.toFixed(1)}, ${height.toFixed(3)}, ${speed.toFixed(2)}, t, h, g);`,
).join('\n    ')

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uLift;
uniform float uNormal;
uniform sampler2D uDepth;
uniform vec4 uBox;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSky;
varying vec3 vWaterWorld;
void wave(vec2 p, vec2 d, float l, float a, float s, float t, inout float h, inout vec2 g) {
  float k = 6.2831853 / l;
  float f = k * (dot(d, p) - s * t);
  h += a * sin(f);
  g += a * k * cos(f) * d;
}
void swells(vec2 p, float t, out float h, out vec2 g) {
  h = 0.0;
  g = vec2(0.0);
  ${GLSL_SWELLS}
}
`

/** How deep the water is over a grid of `texels` a side, 0 (the shore) to 255 (open water), row by row from the north-west */
export function waterDepths(options: WaterOptions, texels = DEPTH_TEXELS): Uint8Array {
  const data = new Uint8Array(texels * texels)
  for (let j = 0; j < texels; j++) {
    for (let i = 0; i < texels; i++) {
      const x = options.x - options.width / 2 + ((i + 0.5) / texels) * options.width
      const z = options.z - options.depth / 2 + ((j + 0.5) / texels) * options.depth
      data[j * texels + i] = Math.round(255 * Math.max(0, Math.min(1, options.depthAt(x, z))))
    }
  }
  return data
}

/** The depths as a picture for the shader */
function depthTexture(options: WaterOptions): DataTexture {
  const texture = new DataTexture(waterDepths(options), DEPTH_TEXELS, DEPTH_TEXELS, RedFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/** The water of `options`, as `level` asks; added by the caller */
export function buildWater(kit: WaterKit, options: WaterOptions, level: WaterLevel): Water {
  if (level === 0) {
    // The cheap way, as it always was: a flat plane with the scrolling water picture
    const map = kit.ownTexture(options.flatMap.clone())
    map.needsUpdate = true
    const every = options.flatRepeat ?? 14
    map.repeat.set(options.width / every, options.depth / every)
    const mesh = new Mesh(
      kit.keep(new PlaneGeometry(options.width, options.depth)),
      kit.own(
        new MeshLambertMaterial({
          map,
          ...(options.flatColor ? { color: options.flatColor } : {}),
          ...(options.overGround ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
        }),
      ),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(options.x, options.y, options.z)
    return {
      mesh,
      update(seconds) {
        map.offset.set(seconds * 0.012, seconds * 0.04)
      },
    }
  }
  const depth = kit.ownTexture(depthTexture(options))
  const uniforms = {
    uTime: { value: 0 },
    uLift: { value: level === 2 ? (options.swell ?? 1) : 0 },
    uNormal: { value: Math.max(0.35, options.swell ?? 1) },
    uDepth: { value: depth },
    uBox: {
      value: new Vector4(
        options.x - options.width / 2,
        options.z - options.depth / 2,
        options.width,
        options.depth,
      ),
    },
    uDeep: { value: new Color(options.deep) },
    uShallow: { value: new Color(options.shallow) },
    uFoam: { value: new Color(options.foam) },
    uSky: { value: new Color(options.sky) },
  }
  const material = kit.own(
    new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.22,
      metalness: 0.05,
      ...(options.overGround ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
    }),
  )
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
  {
    vec4 world = modelMatrix * vec4(transformed, 1.0);
    float h; vec2 g;
    swells(world.xz, uTime, h, g);
    vec2 at = (world.xz - uBox.xy) / uBox.zw;
    float open = texture2D(uDepth, at).r;
    // The swells die down in the shallows, and only lift the surface on the high picture
    transformed.z += uLift * h * smoothstep(0.0, 0.35, open);
    vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec2 waterAt = (vWaterWorld.xz - uBox.xy) / uBox.zw;
  float open = texture2D(uDepth, waterAt).r;
  float wh; vec2 wg;
  swells(vWaterWorld.xz, uTime, wh, wg);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 0.6, open));
  // Foam: a broken line where the water meets the land, and on the swells' crests far out
  float ripple = 0.5 + 0.5 * sin(vWaterWorld.x * 0.9 + uTime * 1.7) * sin(vWaterWorld.z * 1.1 - uTime * 1.3);
  float edge = (1.0 - smoothstep(0.0, 0.06, open)) * (0.55 + 0.45 * ripple);
  float crest = smoothstep(0.42, 0.62, wh) * 0.25 * smoothstep(0.3, 0.8, open);
  diffuseColor.rgb = mix(water, uFoam, clamp(edge + crest, 0.0, 1.0));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
  {
    // The water lights itself a little (it is never as dark as the land in its shadow), and at a
    // glancing angle it shows the sky (a Fresnel term on the bent normal)
    float glance = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += diffuseColor.rgb * 0.45 + uSky * glance * 0.28;
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
  {
    float nh; vec2 ng;
    swells(vWaterWorld.xz, uTime, nh, ng);
    // Small ripples on top, moving the other way, for the glints near the camera
    vec2 r = vWaterWorld.xz;
    ng = ng * uNormal + 0.06 * vec2(cos(r.x * 0.7 + uTime * 2.1), cos(r.y * 0.83 - uTime * 1.9));
    vec3 wave = normalize(vec3(-ng.x, 1.0, -ng.y));
    normal = normalize((viewMatrix * vec4(wave, 0.0)).xyz);
  }`,
      )
  }
  // The high picture's swells need vertices to lift: about one every 12 m. (2026-11-23, docs/KART-PERF.md
  // §11: along each side by its own length. A river 60 m wide and 2 km long was cut 220 by 220, a
  // vertex every 27 cm across it: 97 000 triangles where 3 000 lift it the same)
  const segments = (length: number) =>
    level === 2 ? Math.min(220, Math.max(8, Math.round(length / WAVE_VERTEX))) : 1
  const { near } = options
  // Local x is world x less the middle; local y is the middle less world z (the plane is laid down)
  const geometry =
    level === 2 && near
      ? gradedPlane(
          waveTicks(
            -options.width / 2,
            options.width / 2,
            near.minX - NEAR_MARGIN - options.x,
            near.maxX + NEAR_MARGIN - options.x,
          ),
          waveTicks(
            -options.depth / 2,
            options.depth / 2,
            options.z - near.maxZ - NEAR_MARGIN,
            options.z - near.minZ + NEAR_MARGIN,
          ),
          options.width,
          options.depth,
        )
      : new PlaneGeometry(options.width, options.depth, segments(options.width), segments(options.depth))
  const mesh = new Mesh(kit.keep(geometry), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(options.x, options.y, options.z)
  return {
    mesh,
    update(seconds) {
      uniforms.uTime.value = seconds
    },
  }
}
