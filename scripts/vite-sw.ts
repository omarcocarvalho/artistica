import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { build, type Plugin } from 'vite'
import { AI_ASSET_PINS, publishedPath } from './vite-ai-assets.ts'

export const SW_FILE = 'sw.js'
const NEVER_PRECACHED = new Set([SW_FILE, 'og-image.png'])
const ENTRY_ID = 'virtual:artistica-sw'
const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`

export interface ShellConfig {
  readonly cache: string
  readonly base: string
  readonly shell: readonly string[]
  readonly bypass: readonly string[]
}

export function aiAssetPaths(): string[] {
  return [
    AI_ASSET_PINS.runtimeLoader,
    AI_ASSET_PINS.runtimeWasm,
    AI_ASSET_PINS.face,
    AI_ASSET_PINS.pose,
  ].map(publishedPath)
}

/** Paths relative to the output directory. */
export function shellPaths(files: Iterable<string>, bypass: readonly string[]): string[] {
  const skip = new Set(bypass)
  return [...files]
    .filter((f) => !NEVER_PRECACHED.has(f) && !f.endsWith('.map') && !skip.has(f))
    .sort()
}

export function shellBuildId(files: ReadonlyMap<string, Uint8Array>): string {
  const hash = createHash('sha256')
  for (const path of [...files.keys()].sort()) {
    const content = files.get(path) ?? new Uint8Array()
    hash.update(`${path}\0${createHash('sha256').update(content).digest('hex')}\n`)
  }
  return hash.digest('hex').slice(0, 16)
}

export function shellConfig(
  base: string,
  files: ReadonlyMap<string, Uint8Array>,
  bypass: readonly string[],
): ShellConfig {
  const shell = shellPaths(files.keys(), bypass)
  return {
    cache: `artistica-shell-${shellBuildId(new Map(shell.map((p) => [p, files.get(p) ?? new Uint8Array()])))}`,
    base,
    shell: shell.map((p) => `${base}${p}`),
    bypass: bypass.map((p) => `${base}${p}`),
  }
}

function readTree(dir: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files.set(relative(dir, path).split(sep).join('/'), readFileSync(path))
  }
  return files
}

async function bundleWorker(root: string, entry: string, config: ShellConfig): Promise<string> {
  const output = await build({
    root,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    publicDir: false,
    plugins: [
      {
        name: 'artistica:sw-entry',
        resolveId: (id) => (id === ENTRY_ID ? RESOLVED_ENTRY_ID : undefined),
        load: (id) =>
          id === RESOLVED_ENTRY_ID
            ? `import { startShellWorker } from ${JSON.stringify(entry)}\nstartShellWorker(self, ${JSON.stringify(config)})\n`
            : undefined,
      },
    ],
    build: {
      write: false,
      copyPublicDir: false,
      modulePreload: false,
      sourcemap: false,
      rolldownOptions: { input: ENTRY_ID, output: { format: 'iife', entryFileNames: SW_FILE } },
    },
  })
  const results = Array.isArray(output) ? output : [output]
  for (const result of results) {
    if (!('output' in result)) continue
    for (const file of result.output) {
      if (file.type === 'chunk' && file.fileName === SW_FILE) return file.code
    }
  }
  throw new Error(`service worker: the bundle has no ${SW_FILE}`)
}

/** Builds `entry` to `<outDir>/sw.js` with the shell list of the finished build. */
export function serviceWorker(
  options: { entry?: string; bypass?: readonly string[] } = {},
): Plugin {
  const bypass = options.bypass ?? aiAssetPaths()
  let root = process.cwd()
  let base = '/'
  let outDir = 'dist'
  return {
    name: 'artistica:service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      base = config.base
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const config = shellConfig(base, readTree(outDir), bypass)
      const entry = options.entry ?? resolve(root, 'src/sw/sw.ts')
      writeFileSync(join(outDir, SW_FILE), await bundleWorker(root, entry, config))
    },
  }
}
