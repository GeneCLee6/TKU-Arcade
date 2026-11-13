// e8-t04: node --experimental-strip-types scripts/kart/build-track.ts <scene.gltf> --id <id>
//   --name-en <name> --name-zh <名稱> [--laps 3] [--out <track.json>]
// A Blender scene exported as glTF (.gltf with JSON, "Custom Properties" on) becomes a track JSON,
// checked with the game's own parseTrack. The naming convention is in scripts/kart/gltfTrack.ts and
// docs/ARCHITECTURE.md §4.3. Prints every problem and exits 1 when the scene does not make a track.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseTrack } from '../../shared/kart/track.ts'
import { trackFromGltf, type Gltf } from './gltfTrack.ts'

const args = process.argv.slice(2)
const options = new Map<string, string>()
const files: string[] = []
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!
  if (arg.startsWith('--')) options.set(arg.slice(2), args[++index] ?? '')
  else files.push(arg)
}

const [file] = files
const id = options.get('id')
const en = options.get('name-en')
const zh = options.get('name-zh')
if (!file || !id || !en || !zh) {
  console.error(
    'usage: build-track.ts <scene.gltf> --id <id> --name-en <name> --name-zh <name> [--laps 3] [--out <file>]',
  )
  process.exit(2)
}
if (file.endsWith('.glb')) {
  console.error('export as .gltf (JSON), not .glb: only the empties are read, never the meshes')
  process.exit(2)
}

const gltf = JSON.parse(readFileSync(file, 'utf8')) as Gltf
const json = trackFromGltf(gltf, {
  id,
  name: { en, 'zh-TW': zh },
  laps: Number(options.get('laps') ?? 3),
})
const parsed = parseTrack(json)
if ('problems' in parsed) {
  for (const problem of parsed.problems) console.error(`  ${problem}`)
  console.error(`${file}: not a track (${parsed.problems.length} problems)`)
  process.exit(1)
}
const text = `${JSON.stringify(json, null, 2)}\n`
const out = options.get('out')
if (out) {
  writeFileSync(out, text)
  console.log(
    `${out}: ${json.road.length} road points, ${json.gates.length} gates, ${json.grid.length} on the grid`,
  )
} else {
  process.stdout.write(text)
}
