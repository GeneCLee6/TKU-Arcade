// e12-t08: node --experimental-strip-types scripts/assets/upload.ts <file>… [--apply]
// Puts asset files (models, textures, sounds: never in the repository, docs/ASSETS.md) into the R2
// bucket under content-hashed names, cached for good: a changed file gets a new name, so nothing
// stale is ever served. Prints the commands and each file's published name; runs them only with
// --apply (needs `wrangler login`). List every file in ASSETS.md afterwards, with its hashed name.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

export const BUCKET = 'tku-arcade-assets'
export const CACHE = 'public, max-age=31536000, immutable'

const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

/** `track-riverside.3f2a9c1b04de.glb`: the name, 12 hex of its SHA-256, the extension */
export function hashedName(file: string, bytes: Uint8Array): string {
  const extension = extname(file).toLowerCase()
  const stem = basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  return `${stem}.${hash}${extension}`
}

export function uploadCommand(file: string, name: string): string[] {
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  return [
    'wrangler',
    'r2',
    'object',
    'put',
    `${BUCKET}/${name}`,
    '--file',
    file,
    '--content-type',
    type,
    '--cache-control',
    CACHE,
    '--remote',
  ]
}

if (process.argv[1]?.endsWith('upload.ts')) {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const files = args.filter((arg) => !arg.startsWith('--'))
  if (files.length === 0) {
    console.error('usage: upload.ts <file>… [--apply]')
    process.exit(2)
  }
  for (const file of files) {
    const name = hashedName(file, readFileSync(file))
    const command = uploadCommand(file, name)
    console.log(`${file} -> ${name}`)
    if (apply)
      execFileSync('npx', command, { stdio: 'inherit', shell: process.platform === 'win32' })
    else console.log(`  npx ${command.join(' ')}`)
  }
  if (!apply) console.log('dry run: add --apply to upload')
}
