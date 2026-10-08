import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { build, type Plugin } from 'vite'
import { SHELL_CACHE_PREFIX, type ShellConfig } from '../src/sw/config.ts'
import { AI_ASSET_PINS, publishedPath } from './vite-ai-assets.ts'

export const SW_FILE = 'sw.js'
const NEVER_PRECACHED = new Set([SW_FILE, 'og-image.png'])
const ENTRY_ID = 'virtual:artistica-sw'
const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`

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
    cache: `${SHELL_CACHE_PREFIX}${shellBuildId(new Map(shell.map((p) => [p, files.get(p) ?? new Uint8Array()])))}`,
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

async function bundleWorker(root: string, source: string): Promise<string> {
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
        load: (id) => (id === RESOLVED_ENTRY_ID ? source : undefined),
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

/**
 * Builds `<sources>/sw.ts` to `<outDir>/sw.js` with the shell list of the finished build.
 * `killSwitch` builds `<sources>/kill.ts` instead: a worker that removes the shell caches and
 * unregisters itself (HANDOVER, "Service worker recovery").
 */
export function serviceWorker(
  options: { sources?: string; bypass?: readonly string[]; killSwitch?: boolean } = {},
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
      const sources = options.sources ?? resolve(root, 'src/sw')
      const source = options.killSwitch
        ? `import { startKillSwitch } from ${JSON.stringify(join(sources, 'kill.ts'))}\nstartKillSwitch(self)\n`
        : `import { startShellWorker } from ${JSON.stringify(join(sources, 'sw.ts'))}\nstartShellWorker(self, ${JSON.stringify(shellConfig(base, readTree(outDir), bypass))})\n`
      writeFileSync(join(outDir, SW_FILE), await bundleWorker(root, source))
    },
  }
}
