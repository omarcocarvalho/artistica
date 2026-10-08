import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AI_ASSET_PINS,
  type AiAssetPin,
  aiAssets,
  aiAssetsManifest,
  aiAssetsModule,
  MEDIAPIPE_VERSION,
  publishedPath,
  readPinnedAssets,
} from './vite-ai-assets.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = '/artistica/'
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

describe('the committed manifest', () => {
  it('the manifest lists the runtime loader, the runtime wasm and both models with their byte sizes and SHA-256', () => {
    const m = aiAssetsManifest(BASE)
    expect(Object.keys(m)).toEqual(['runtimeLoader', 'runtimeWasm', 'face', 'pose'])
    expect(m.runtimeLoader).toEqual({
      url: '/artistica/assets/vision_wasm_module_internal-1f1d6215.js',
      bytes: 322_082,
      sha256: '1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44',
    })
    expect(m.runtimeWasm).toEqual({
      url: '/artistica/assets/vision_wasm_module_internal-617b8e02.wasm',
      bytes: 11_153_641,
      sha256: '617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756',
    })
    expect(m.face).toEqual({
      url: '/artistica/models/face_landmarker-float16-1.task',
      bytes: 3_758_596,
      sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    })
    expect(m.pose).toEqual({
      url: '/artistica/models/pose_landmarker_full-float16-1.task',
      bytes: 9_398_198,
      sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
    })
  })

  it("the committed models' SHA-256 equal the manifest's", () => {
    for (const key of ['face', 'pose'] as const) {
      const pin = AI_ASSET_PINS[key]
      const data = readFileSync(join(ROOT, pin.file))
      expect(pin.file).toMatch(/^public\/models\//)
      expect(data.length, pin.file).toBe(pin.bytes)
      expect(sha256(data), pin.file).toBe(pin.sha256)
    }
  })

  it('URLs are under the base and versioned', () => {
    for (const base of [BASE, '/']) {
      const m = aiAssetsManifest(base)
      expect(m.runtimeLoader.url).toMatch(
        new RegExp(`^${base}assets/vision_wasm_module_internal-[0-9a-f]{8}\\.js$`),
      )
      expect(m.runtimeWasm.url).toMatch(
        new RegExp(`^${base}assets/vision_wasm_module_internal-[0-9a-f]{8}\\.wasm$`),
      )
      expect(m.face.url).toBe(`${base}models/face_landmarker-float16-1.task`)
      expect(m.pose.url).toBe(`${base}models/pose_landmarker_full-float16-1.task`)
    }
    expect(aiAssetsManifest(BASE).runtimeLoader.url).toContain(
      AI_ASSET_PINS.runtimeLoader.sha256.slice(0, 8),
    )
    expect(aiAssetsManifest(BASE).runtimeWasm.url).toContain(
      AI_ASSET_PINS.runtimeWasm.sha256.slice(0, 8),
    )
  })

  it('the runtime files come from the installed package version', () => {
    const installed = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8'),
    ) as { version: string }
    const app = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(installed.version).toBe('0.10.35')
    expect(MEDIAPIPE_VERSION).toBe('0.10.35')
    expect(app.dependencies['@mediapipe/tasks-vision']).toBe(MEDIAPIPE_VERSION)
    for (const key of ['runtimeLoader', 'runtimeWasm'] as const) {
      const pin = AI_ASSET_PINS[key]
      expect(pin.file).toMatch(/^node_modules\/@mediapipe\/tasks-vision\/wasm\//)
      const data = readFileSync(join(ROOT, pin.file))
      expect(data.length, pin.file).toBe(pin.bytes)
      expect(sha256(data), pin.file).toBe(pin.sha256)
    }
  })

  it('readPinnedAssets accepts the files in this repo', () => {
    const files = readPinnedAssets(ROOT)
    expect([...files.keys()]).toEqual(['runtimeLoader', 'runtimeWasm', 'face', 'pose'])
  })
})

describe('the generated module', () => {
  it('exports AI_ASSETS exactly as the manifest', async () => {
    const manifest = aiAssetsManifest(BASE)
    const code = aiAssetsModule(manifest)
    const mod = (await import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    )) as { AI_ASSETS: unknown }
    expect(mod.AI_ASSETS).toEqual(manifest)
    expect(Object.isFrozen(mod.AI_ASSETS)).toBe(true)
  })
})

describe('the plugin against a fixture project', () => {
  let root: string
  let pins: Record<'runtimeLoader' | 'runtimeWasm' | 'face' | 'pose', AiAssetPin>
  const loader = Buffer.from('export default function ModuleFactory() {}\n')
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
  const face = Buffer.from('face model bytes')
  const pose = Buffer.from('pose model bytes, longer')

  const put = (rel: string, data: Uint8Array) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), data)
  }
  const pin = (file: string, data: Uint8Array, emit: boolean): AiAssetPin => ({
    file,
    emit,
    bytes: data.length,
    sha256: sha256(data),
  })

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ai-assets-'))
    put('node_modules/rt/wasm/runtime.js', loader)
    put('node_modules/rt/wasm/runtime.wasm', wasm)
    put('public/models/face-1.task', face)
    put('public/models/pose-1.task', pose)
    pins = {
      runtimeLoader: pin('node_modules/rt/wasm/runtime.js', loader, true),
      runtimeWasm: pin('node_modules/rt/wasm/runtime.wasm', wasm, true),
      face: pin('public/models/face-1.task', face, false),
      pose: pin('public/models/pose-1.task', pose, false),
    }
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('readPinnedAssets rejects a file whose size or SHA-256 differs from its pin, naming it', () => {
    expect(() =>
      readPinnedAssets(root, { ...pins, face: { ...pins.face, bytes: pins.face.bytes + 1 } }),
    ).toThrow(/public\/models\/face-1\.task/)
    expect(() =>
      readPinnedAssets(root, {
        ...pins,
        runtimeWasm: { ...pins.runtimeWasm, sha256: '0'.repeat(64) },
      }),
    ).toThrow(/node_modules\/rt\/wasm\/runtime\.wasm/)
  })

  it('the build emits the runtime under its hashed name even when nothing imports the module', async () => {
    put('src/main.js', Buffer.from('console.log("app")\n'))
    const outDir = join(root, 'dist-plain')
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [aiAssets(pins)],
      build: { outDir, rolldownOptions: { input: join(root, 'src/main.js') } },
    })
    for (const key of ['runtimeLoader', 'runtimeWasm', 'face', 'pose'] as const) {
      const data = readFileSync(join(outDir, publishedPath(pins[key])))
      expect(sha256(data), key).toBe(pins[key].sha256)
    }
  })

  it('a build that fails the pins stops', async () => {
    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        base: BASE,
        plugins: [aiAssets({ ...pins, pose: { ...pins.pose, sha256: 'f'.repeat(64) } })],
        build: {
          outDir: join(root, 'dist-bad'),
          rolldownOptions: { input: join(root, 'src/main.js') },
        },
      }),
    ).rejects.toThrow(/public\/models\/pose-1\.task/)
  })

  it('the dev server does not start when a file fails its pin', async () => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [aiAssets({ ...pins, runtimeLoader: { ...pins.runtimeLoader, bytes: 1 } })],
      server: { port: 0, host: '127.0.0.1', ws: false },
    })
    try {
      await expect(server.listen()).rejects.toThrow(/node_modules\/rt\/wasm\/runtime\.js/)
    } finally {
      await server.close()
    }
  })

  it('an importing chunk carries the URLs, not the runtime bytes', async () => {
    put(
      'src/uses.js',
      Buffer.from(
        'import { AI_ASSETS } from "virtual:ai-assets"\nconsole.log(JSON.stringify(AI_ASSETS))\n',
      ),
    )
    const outDir = join(root, 'dist-uses')
    const out = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [aiAssets(pins)],
      build: { outDir, rolldownOptions: { input: join(root, 'src/uses.js') } },
    })
    const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) =>
      'output' in o ? o.output : [],
    )
    const chunks = outputs.flatMap((o) => (o.type === 'chunk' ? [o.code] : []))
    expect(chunks).toHaveLength(1)
    const code = chunks[0] ?? ''
    const manifest = aiAssetsManifest(BASE, pins)
    for (const a of Object.values(manifest)) {
      expect(code).toContain(a.url)
      expect(code).toContain(a.sha256)
    }
    expect(code).not.toContain('ModuleFactory')
  })

  it('the dev server serves the module and every asset at the same URLs as the build', async () => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [aiAssets(pins)],
      server: { port: 0, host: '127.0.0.1', ws: false },
    })
    try {
      await server.listen()
      const { port } = server.httpServer?.address() as AddressInfo
      const manifest = aiAssetsManifest(BASE, pins)
      const mod = (await server.ssrLoadModule('virtual:ai-assets')) as { AI_ASSETS: unknown }
      expect(mod.AI_ASSETS).toEqual(manifest)
      const types = {
        runtimeLoader: 'text/javascript',
        runtimeWasm: 'application/wasm',
      } as const
      for (const key of ['runtimeLoader', 'runtimeWasm', 'face', 'pose'] as const) {
        const res = await fetch(`http://127.0.0.1:${String(port)}${manifest[key].url}`)
        expect(res.status, key).toBe(200)
        expect(sha256(new Uint8Array(await res.arrayBuffer())), key).toBe(pins[key].sha256)
        if (key === 'runtimeLoader' || key === 'runtimeWasm') {
          expect(res.headers.get('content-type'), key).toContain(types[key])
        }
      }
    } finally {
      await server.close()
    }
  })
})
