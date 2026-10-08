import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Plugin } from 'vite'

export const MEDIAPIPE_VERSION = '0.10.35'

export type AiAssetKey = 'runtimeLoader' | 'runtimeWasm' | 'face' | 'pose'

export interface AiAssetPin {
  /** Relative to the project root. */
  readonly file: string
  /** True: the build emits it as `assets/<name>-<sha256 prefix><ext>`. False: a `public/` file. */
  readonly emit: boolean
  readonly bytes: number
  readonly sha256: string
}

export interface AiAssetEntry {
  readonly url: string
  readonly bytes: number
  readonly sha256: string
}

export type AiAssetPins = Readonly<Record<AiAssetKey, AiAssetPin>>
export type AiAssetsManifest = Readonly<Record<AiAssetKey, AiAssetEntry>>

const KEYS: readonly AiAssetKey[] = ['runtimeLoader', 'runtimeWasm', 'face', 'pose']
const RUNTIME_DIR = 'node_modules/@mediapipe/tasks-vision/wasm'

export const AI_ASSET_PINS: AiAssetPins = {
  runtimeLoader: {
    file: `${RUNTIME_DIR}/vision_wasm_module_internal.js`,
    emit: true,
    bytes: 322_082,
    sha256: '1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44',
  },
  runtimeWasm: {
    file: `${RUNTIME_DIR}/vision_wasm_module_internal.wasm`,
    emit: true,
    bytes: 11_153_641,
    sha256: '617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756',
  },
  face: {
    file: 'public/models/face_landmarker-float16-1.task',
    emit: false,
    bytes: 3_758_596,
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  pose: {
    file: 'public/models/pose_landmarker_full-float16-1.task',
    emit: false,
    bytes: 9_398_198,
    sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  },
}

const VIRTUAL_ID = 'virtual:ai-assets'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
}

export function publishedPath(pin: AiAssetPin): string {
  if (!pin.emit) return pin.file.replace(/^public\//, '')
  const ext = extname(pin.file)
  return `assets/${basename(pin.file, ext)}-${pin.sha256.slice(0, 8)}${ext}`
}

export function aiAssetsManifest(
  base: string,
  pins: AiAssetPins = AI_ASSET_PINS,
): AiAssetsManifest {
  const entry = (pin: AiAssetPin): AiAssetEntry => ({
    url: `${base}${publishedPath(pin)}`,
    bytes: pin.bytes,
    sha256: pin.sha256,
  })
  return {
    runtimeLoader: entry(pins.runtimeLoader),
    runtimeWasm: entry(pins.runtimeWasm),
    face: entry(pins.face),
    pose: entry(pins.pose),
  }
}

export function aiAssetsModule(manifest: AiAssetsManifest): string {
  const entries = KEYS.map(
    (key) => `  ${key}: Object.freeze(${JSON.stringify(manifest[key])}),`,
  ).join('\n')
  return `export const AI_ASSETS = Object.freeze({\n${entries}\n})\n`
}

/** Reads every pinned file and throws, naming each file, unless its size and SHA-256 match. */
export function readPinnedAssets(
  root: string,
  pins: AiAssetPins = AI_ASSET_PINS,
): Map<AiAssetKey, Buffer> {
  const out = new Map<AiAssetKey, Buffer>()
  const problems: string[] = []
  for (const key of KEYS) {
    const pin = pins[key]
    const data = readFileSync(join(root, pin.file))
    const sha256 = createHash('sha256').update(data).digest('hex')
    if (data.length !== pin.bytes || sha256 !== pin.sha256) {
      problems.push(
        `${pin.file}: expected ${String(pin.bytes)} B, SHA-256 ${pin.sha256}; found ${String(data.length)} B, SHA-256 ${sha256}`,
      )
    }
    out.set(key, data)
  }
  if (problems.length > 0) {
    throw new Error(`AI assets differ from their pins:\n${problems.join('\n')}`)
  }
  return out
}

/** `virtual:ai-assets`: the AI runtime and models, served from this site at the same URLs in dev and build. */
export function aiAssets(pins: AiAssetPins = AI_ASSET_PINS): Plugin {
  let base = '/'
  let root = process.cwd()
  let command: 'build' | 'serve' = 'serve'
  return {
    name: 'artistica:ai-assets',
    configResolved(config) {
      base = config.base
      root = config.root
      command = config.command
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      return id === RESOLVED_ID ? aiAssetsModule(aiAssetsManifest(base, pins)) : undefined
    },
    buildStart() {
      const files = readPinnedAssets(root, pins)
      if (command !== 'build') return
      for (const key of KEYS) {
        const pin = pins[key]
        const source = files.get(key)
        if (pin.emit && source) {
          this.emitFile({ type: 'asset', fileName: publishedPath(pin), source })
        }
      }
    },
    configureServer(server) {
      const routes = new Map(
        KEYS.filter((key) => pins[key].emit).map((key) => [
          `${base}${publishedPath(pins[key])}`,
          pins[key].file,
        ]),
      )
      server.middlewares.use((req, res, next) => {
        const file = routes.get((req.url ?? '').split('?')[0] ?? '')
        if (file === undefined) {
          next()
          return
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(readFileSync(join(root, file)))
      })
    },
  }
}
