// Writes /sw.js at build time (2026-11-21, docs/ARCHITECTURE.md §4.56): scripts/pwa/sw.js with this
// build's version and the app's shell filled in. A new build is a new worker, so a phone that opens
// the app finds the new version (and offers to reload, src/lib/installApp.ts); an unchanged build
// gives the same file, and nothing happens. The shell is what every first screen loads: the entry
// chunk, the chunks it imports, their styles and the two language chunks (src/i18n/messages.*.ts).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** What of a bundled file the shell needs (Rollup's OutputChunk and OutputAsset, cut down) */
export type BundleFile =
  | {
      type: 'chunk'
      fileName: string
      isEntry: boolean
      imports: readonly string[]
      facadeModuleId: string | null
      viteMetadata?: { importedCss: ReadonlySet<string> }
    }
  | { type: 'asset'; fileName: string }

const TEMPLATE = new URL('./sw.js', import.meta.url)
const LANGUAGE = /\/src\/i18n\/messages\.(en|zh-TW)\.ts$/

/** The shell's files, as the site serves them, in a stable order */
export function shellFiles(bundle: Readonly<Record<string, BundleFile>>): string[] {
  const files = new Set<string>()
  const add = (fileName: string) => {
    const file = bundle[fileName]
    if (!file || files.has(fileName)) return
    files.add(fileName)
    if (file.type !== 'chunk') return
    for (const css of file.viteMetadata?.importedCss ?? []) files.add(css)
    for (const imported of file.imports) add(imported)
  }
  for (const file of Object.values(bundle)) {
    const language = file.type === 'chunk' && LANGUAGE.test(file.facadeModuleId?.replaceAll('\\', '/') ?? '')
    if (file.type === 'chunk' && (file.isEntry || language)) add(file.fileName)
  }
  return [...files].sort().map((file) => `/${file}`)
}

/**
 * The worker's source: the template with `version` and `shell` in place of its placeholders. Throws
 * when the template has moved on from them, so a build never ships a worker that caches nothing new
 */
export function serviceWorkerSource(template: string, version: string, shell: readonly string[]): string {
  const VERSION = "const VERSION = 'dev'"
  const SHELL = 'const SHELL = []'
  if (!template.includes(VERSION) || !template.includes(SHELL)) {
    throw new Error('service-worker: scripts/pwa/sw.js no longer has its placeholders')
  }
  return template
    .replace(VERSION, `const VERSION = ${JSON.stringify(version)}`)
    .replace(SHELL, `const SHELL = ${JSON.stringify(shell)}`)
}

/** A short name for the build: a hash of every file name in it (each carries its own content hash) */
export function buildVersion(fileNames: readonly string[]): string {
  return createHash('sha256').update([...fileNames].sort().join('\n')).digest('hex').slice(0, 12)
}

/** The plugin: emits sw.js next to index.html in the client build */
export const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  generateBundle(_options, bundle) {
    if (this.environment.name !== 'client') return
    const files = bundle as unknown as Record<string, BundleFile>
    const shell = shellFiles(files)
    const version = buildVersion(Object.keys(files))
    const source = serviceWorkerSource(readFileSync(TEMPLATE, 'utf8'), version, shell)
    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
})
