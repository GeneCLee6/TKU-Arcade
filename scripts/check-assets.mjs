// e12-t08 (AC-12.6): every asset file in the repository is listed in docs/ASSETS.md, and none is a
// model or texture that belongs in R2. `npm run check-assets`, in CI. An asset is an image, model,
// sound or font file (ASSET below). Listed means its path appears in ASSETS.md, in backticks
// (`public/favicon.svg`). Exempt: the visual regression baselines, which are screenshots of the
// site's own screens (ASSETS.md says so).
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

const ASSET =
  /\.(png|jpe?g|webp|gif|avif|svg|ico|glb|gltf|bin|ktx2|hdr|mp3|ogg|opus|wav|m4a|flac|woff2?|ttf|otf|blend|fbx|obj)$/i
/** These belong in R2 (ASSETS.md): never in the repository */
const R2_ONLY = /\.(glb|gltf|bin|ktx2|hdr|blend|fbx|obj|mp3|ogg|opus|wav|m4a|flac)$/i
const EXEMPT = [/^e2e-visual\/__screenshots__\//]
/** Small icons may live in the repository; anything bigger goes to R2 */
const MAX_BYTES = 100 * 1024

export function checkAssets(files, listing, sizeOf) {
  const problems = []
  for (const file of files) {
    if (!ASSET.test(file) || EXEMPT.some((pattern) => pattern.test(file))) continue
    if (R2_ONLY.test(file)) {
      problems.push(
        `${file}: models, textures and sounds go to R2, not the repository (docs/ASSETS.md)`,
      )
      continue
    }
    if (!listing.includes(`\`${file}\``)) problems.push(`${file}: not listed in docs/ASSETS.md`)
    const size = sizeOf(file)
    if (size > MAX_BYTES)
      problems.push(
        `${file}: ${Math.round(size / 1024)} kB, more than ${MAX_BYTES / 1024} kB in the repository`,
      )
  }
  return problems
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const listing = readFileSync('docs/ASSETS.md', 'utf8')
  const problems = checkAssets(files, listing, (file) => statSync(file).size)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(`FAIL check-assets: ${problems.length} problem(s)`)
    process.exit(1)
  }
  console.log(`ok   check-assets: every asset file is listed`)
}
