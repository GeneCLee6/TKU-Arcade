// A design aid (2026-11-18): draws a built-in track from above as an SVG, its road points numbered,
// and prints its shape and whatever is wrong with it (the checks of tests/kart/technical.test.ts).
// Run: node --experimental-strip-types scripts/kart/track-svg.ts <id> <out.svg> ["minX,minZ,maxX,maxZ;..."]
import { writeFileSync } from 'node:fs'
import { kerbs, parseTrack } from '../../shared/kart/track.ts'
import { acrossRoad } from '../../shared/kart/tracks/guide.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { RACE_TRACKS } from '../../shared/kart/tracks/registry.ts'
import { curvatures, roadShape, STRAIGHT_RADIUS } from './shape.ts'

const [id, out, extra] = process.argv.slice(2)
const json = RACE_TRACKS[id as keyof typeof RACE_TRACKS]
const parsed = parseTrack(json)
if ('problems' in parsed) {
  console.log(parsed.problems.join('\n'))
  process.exit(1)
}
const { track } = parsed
const { road } = track
const xs = road.map((p) => p.x)
const zs = road.map((p) => p.z)
const pad = 80
const minX = Math.min(...xs) - pad
const minZ = Math.min(...zs) - pad
const w = Math.max(...xs) + pad - minX
const h = Math.max(...zs) + pad - minZ
const { curve, step } = curvatures(road)
const k = kerbs(road)
const half = k.length / 2
const poly = (walls: typeof k) => walls.map((s) => `${s.ax},${s.az}`).join(' ')
const scale = Math.min(1.6, 1500 / Math.max(w, h))
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${w} ${h}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}"><rect x="${minX}" y="${minZ}" width="${w}" height="${h}" fill="#f4f1e8"/>`
for (let gx = Math.ceil(minX / 100) * 100; gx < minX + w; gx += 100)
  svg += `<line x1="${gx}" y1="${minZ}" x2="${gx}" y2="${minZ + h}" stroke="#ccc" stroke-width="1"/><text x="${gx + 2}" y="${minZ + 14}" font-size="12" fill="#888">${gx}</text>`
for (let gz = Math.ceil(minZ / 100) * 100; gz < minZ + h; gz += 100)
  svg += `<line x1="${minX}" y1="${gz}" x2="${minX + w}" y2="${gz}" stroke="#ccc" stroke-width="1"/><text x="${minX + 2}" y="${gz - 2}" font-size="12" fill="#888">${gz}</text>`
road.forEach((p, i) => {
  const q = road[(i + 1) % road.length]!
  const straight = Math.abs(curve[i]!) < 1 / STRAIGHT_RADIUS
  const shade = Math.max(0, Math.min(255, Math.round(120 + (p.y ?? 0) * 6)))
  const colour = straight
    ? `rgb(${shade},${shade},255)`
    : `rgb(255,${shade},${Math.round(shade / 2)})`
  svg += `<line x1="${p.x}" y1="${p.z}" x2="${q.x}" y2="${q.z}" stroke="${colour}" stroke-width="${p.width}" stroke-linecap="round" opacity="0.75"/>`
})
svg += `<polyline points="${poly(k.slice(0, half))} ${k[0]!.ax},${k[0]!.az}" fill="none" stroke="#333" stroke-width="1.2"/>`
svg += `<polyline points="${poly(k.slice(half))} ${k[half]!.ax},${k[half]!.az}" fill="none" stroke="#333" stroke-width="1.2"/>`
for (const wall of track.walls)
  svg += `<line x1="${wall.ax}" y1="${wall.az}" x2="${wall.bx}" y2="${wall.bz}" stroke="${wall.top !== undefined && wall.top < 4 ? '#f80' : '#a0f'}" stroke-width="2"/>`
// The guide's two lines (2026-11-19): the safe one green, the technical one red
const guide = trackGuide(track.id)
if (guide) {
  for (const [offsets, colour] of [
    [guide.safe, '#0a0'],
    [guide.tech, '#d00'],
  ] as const) {
    const points = offsets.map((across, index) => acrossRoad(road, index, across))
    svg += `<polyline points="${points.map((p) => `${p.x},${p.z}`).join(' ')} ${points[0]!.x},${points[0]!.z}" fill="none" stroke="${colour}" stroke-width="1.5"/>`
  }
}
for (const j of track.jumps ?? [])
  svg += `<circle cx="${road[j]!.x}" cy="${road[j]!.z}" r="9" fill="none" stroke="#080" stroke-width="4"/>`
for (const b of track.itemBoxes)
  svg += `<rect x="${b.x - 2}" y="${b.z - 2}" width="4" height="4" fill="#06c"/>`
for (const b of track.boostPads) svg += `<circle cx="${b.x}" cy="${b.z}" r="4" fill="#fa0"/>`
for (const g of track.grid) svg += `<circle cx="${g.x}" cy="${g.z}" r="1.5" fill="#000"/>`
road.forEach((p, i) => {
  if (i % 10 === 0)
    svg += `<text x="${p.x}" y="${p.z}" font-size="13" text-anchor="middle" fill="#000">${i}${p.y ? `/${p.y.toFixed(0)}` : ''}</text>`
})
if (extra) {
  for (const box of extra.split(';')) {
    const [a, b, c, d] = box.split(',').map(Number)
    svg += `<rect x="${a}" y="${b}" width="${c! - a!}" height="${d! - b!}" fill="none" stroke="#c00" stroke-width="2"/>`
  }
}
svg += '</svg>'
writeFileSync(out!, svg)
const shape = roadShape(road)
console.log(
  `${id}: ${road.length} pts, ${shape.length.toFixed(0)} m, straight ${(shape.straightShare * 100).toFixed(0)}%, longest ${shape.longestStraight.toFixed(0)} m, flips ${shape.flips}, width ${Math.min(...road.map((p) => p.width))}-${Math.max(...road.map((p) => p.width))}`,
)

// ── What is wrong with it ──
const at: number[] = []
let total = 0
step.forEach((s) => {
  at.push(total)
  total += s
})
const along = (i: number, j: number) => {
  const forward = Math.abs(at[j]! - at[i]!)
  return Math.min(forward, total - forward)
}
const seen = new Set<string>()
for (let i = 0; i < road.length; i++) {
  for (let j = i + 1; j < road.length; j++) {
    if (along(i, j) < Math.max(90, (road[i]!.width + road[j]!.width) * 1.2)) continue
    const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
    const need = (road[i]!.width + road[j]!.width) / 2 + 4
    const key = `${Math.floor(i / 8)}:${Math.floor(j / 8)}`
    if (gap <= need && !seen.has(key)) {
      seen.add(key)
      console.log(`  crosses: ${i} and ${j}, ${gap.toFixed(1)} m apart (need ${need.toFixed(0)})`)
    }
  }
}
for (let index = 0; index < road.length; index++) {
  const a = road[(index - 2 + road.length) % road.length]!
  const b = road[index]!
  const c = road[(index + 2) % road.length]!
  const ab = Math.hypot(b.x - a.x, b.z - a.z)
  const bc = Math.hypot(c.x - b.x, c.z - b.z)
  const ca = Math.hypot(a.x - c.x, a.z - c.z)
  const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
  const radius = cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross)
  if (radius <= b.width / 2 + 3)
    console.log(`  folds: ${index} radius ${radius.toFixed(1)} width ${b.width} (${b.x}, ${b.z})`)
}
