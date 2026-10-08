import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AI_ASSET_PINS, publishedPath } from './vite-ai-assets.ts'
import { aiAssetPaths, serviceWorker, shellBuildId, shellConfig, shellPaths } from './vite-sw.ts'

const BASE = '/artistica/'
const SOURCES = fileURLToPath(new URL('../src/sw', import.meta.url))
const bytes = (text: string) => new TextEncoder().encode(text)

const DIST = [
  'index.html',
  'app/index.html',
  'assets/app-CxwVuhDN.js',
  'assets/app-DM_oOe8g.css',
  'assets/heic-to-CuP2Qlsw.js',
  'assets/layout.worker-CMtAEX-K.js',
  'assets/fraunces-latin-wght-normal-ukD16Tqj.woff2',
  'assets/app-CxwVuhDN.js.map',
  'assets/vision_wasm_module_internal-1f1d6215.js',
  'assets/vision_wasm_module_internal-617b8e02.wasm',
  'models/face_landmarker-float16-1.task',
  'models/pose_landmarker_full-float16-1.task',
  'models/NOTICE.md',
  'favicon.svg',
  'og-image.png',
  'robots.txt',
  'sw.js',
]

describe('the build list', () => {
  it('the build list has the app and landing pages, every asset, fonts, favicon; and no AI runtime, model, og-image or map', () => {
    expect(shellPaths(DIST, aiAssetPaths())).toEqual([
      'app/index.html',
      'assets/app-CxwVuhDN.js',
      'assets/app-DM_oOe8g.css',
      'assets/fraunces-latin-wght-normal-ukD16Tqj.woff2',
      'assets/heic-to-CuP2Qlsw.js',
      'assets/layout.worker-CMtAEX-K.js',
      'favicon.svg',
      'index.html',
      'models/NOTICE.md',
      'robots.txt',
    ])
  })

  it('the AI paths are the four pinned files', () => {
    expect(aiAssetPaths()).toEqual(
      [
        AI_ASSET_PINS.runtimeLoader,
        AI_ASSET_PINS.runtimeWasm,
        AI_ASSET_PINS.face,
        AI_ASSET_PINS.pose,
      ].map(publishedPath),
    )
  })

  it('the build id changes with any file name or content and not with the order', () => {
    const a = new Map([
      ['index.html', bytes('<p>a</p>')],
      ['assets/x.js', bytes('x')],
    ])
    const reordered = new Map([...a].reverse())
    const edited = new Map([...a, ['assets/x.js', bytes('y')]])
    const renamed = new Map([
      ['index.html', bytes('<p>a</p>')],
      ['assets/z.js', bytes('x')],
    ])
    expect(shellBuildId(a)).toMatch(/^[0-9a-f]{16}$/)
    expect(shellBuildId(reordered)).toBe(shellBuildId(a))
    expect(shellBuildId(edited)).not.toBe(shellBuildId(a))
    expect(shellBuildId(renamed)).not.toBe(shellBuildId(a))
  })

  it('the config names the shell cache by the shell files and lists URLs under the base', () => {
    const shell = new Map([['index.html', bytes('landing')]])
    const files = new Map([
      ...shell,
      ['assets/vision_wasm_module_internal-1f1d6215.js', bytes('runtime')],
    ])
    const config = shellConfig(BASE, files, aiAssetPaths())
    expect(config).toEqual({
      cache: `artistica-shell-${shellBuildId(shell)}`,
      base: BASE,
      shell: ['/artistica/index.html'],
      bypass: aiAssetPaths().map((path) => `${BASE}${path}`),
    })
  })
})

describe('the service worker build', () => {
  let root: string
  let outDir: string
  let installed: string[] = []
  let cacheName = ''
  const listeners: string[] = []

  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const filesUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((d) => d.isFile())
      .map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join('/'))

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'artistica-sw-'))
    outDir = join(root, 'dist')
    put('index.html', '<script type="module" src="./main.js"></script>')
    put('app/index.html', '<script type="module" src="../main.js"></script>')
    put('main.js', 'import("./lazy.js").then((m) => m.run())\n')
    put('lazy.js', 'export const run = () => 1\n')
    put('public/favicon.svg', '<svg/>')
    put('public/og-image.png', 'png')
    put('public/models/face_landmarker-float16-1.task', 'model')
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [
        serviceWorker({ sources: SOURCES, bypass: ['models/face_landmarker-float16-1.task'] }),
      ],
      build: {
        outDir,
        sourcemap: true,
        rolldownOptions: {
          input: { landing: join(root, 'index.html'), app: join(root, 'app/index.html') },
        },
      },
    })

    const code = readFileSync(join(outDir, 'sw.js'), 'utf8')
    const scope = {
      location: { origin: 'https://example.com' },
      fetch: () => Promise.resolve(new Response('')),
      caches: {
        open: (name: string) => {
          cacheName = name
          return Promise.resolve({
            addAll: (requests: Request[]) => {
              installed = requests.map((r) => new URL(r.url).pathname)
              return Promise.resolve()
            },
          })
        },
      },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners.push(type)
        if (type === 'install') {
          listener({ waitUntil: () => undefined })
        }
      },
    }
    runInNewContext(code, { self: scope, URL, Request })
    await Promise.resolve()
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('emits dist/sw.js as a classic script that starts the worker', () => {
    const code = readFileSync(join(outDir, 'sw.js'), 'utf8')
    expect(code).not.toMatch(/^\s*(import|export)\b/m)
    expect(listeners).toEqual(['install', 'activate', 'fetch'])
    expect(cacheName).toMatch(/^artistica-shell-[0-9a-f]{16}$/)
  })

  it('precaches every built file except itself, source maps, og-image.png and the bypassed files', () => {
    const expected = filesUnder(outDir)
      .filter(
        (f) =>
          f !== 'sw.js' &&
          !f.endsWith('.map') &&
          f !== 'og-image.png' &&
          f !== 'models/face_landmarker-float16-1.task',
      )
      .map((f) => `${BASE}${f}`)
      .sort()
    expect(expected.some((f) => /\/assets\/lazy-.*\.js$/.test(f))).toBe(true)
    expect(filesUnder(outDir).some((f) => f.endsWith('.map'))).toBe(true)
    expect(installed).toEqual(expected)
  })
})

describe('the kill switch build', () => {
  let root: string
  const events: string[] = []
  const calls: string[] = []

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'artistica-sw-kill-'))
    writeFileSync(join(root, 'index.html'), '<p>kill</p>')
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: BASE,
      plugins: [serviceWorker({ sources: SOURCES, killSwitch: true })],
      build: { outDir: join(root, 'dist') },
    })
    const listeners = new Map<string, (event: unknown) => void>()
    const scope = {
      caches: {
        keys: () => Promise.resolve(['artistica-shell-abc', 'artistica-ai-v1']),
        delete: (key: string) => {
          calls.push(`delete ${key}`)
          return Promise.resolve(true)
        },
      },
      registration: {
        unregister: () => {
          calls.push('unregister')
          return Promise.resolve(true)
        },
      },
      skipWaiting: () => {
        calls.push('skipWaiting')
        return Promise.resolve()
      },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        events.push(type)
        listeners.set(type, listener)
      },
    }
    runInNewContext(readFileSync(join(root, 'dist', 'sw.js'), 'utf8'), { self: scope })
    for (const type of ['install', 'activate']) {
      let pending: unknown
      listeners.get(type)?.({ waitUntil: (p: unknown) => (pending = p) })
      await pending
    }
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('emits a sw.js that takes over, deletes the shell caches and unregisters, with no fetch handler', () => {
    expect(events).toEqual(['install', 'activate'])
    expect(calls).toEqual(['skipWaiting', 'delete artistica-shell-abc', 'unregister'])
  })
})
