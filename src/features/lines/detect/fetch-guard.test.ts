import { describe, expect, it, vi, type Mock } from 'vitest'
import { installFetchGuard, type GuardScope } from './fetch-guard'

const PREFIX = 'https://app.test/artistica/'

type Spy = Mock<(...args: unknown[]) => unknown>

interface Spies {
  fetch: Spy
  open: Spy
  importScripts: Spy
  importModule: Mock<(url: string) => Promise<unknown>>
  webSocket: Spy
  eventSource: Spy
  worker: Spy
  sendBeacon: Spy
}

function moduleWorkerScope(): { scope: GuardScope; spies: Spies } {
  const spies: Spies = {
    fetch: vi.fn<(...args: unknown[]) => unknown>(() => Promise.resolve('fetched')),
    open: vi.fn<(...args: unknown[]) => unknown>(),
    importScripts: vi.fn<(...args: unknown[]) => unknown>(() => {
      throw new TypeError('Module scripts do not support importScripts().')
    }),
    importModule: vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve({ default: 'module' }),
    ),
    webSocket: vi.fn<(...args: unknown[]) => unknown>(),
    eventSource: vi.fn<(...args: unknown[]) => unknown>(),
    worker: vi.fn<(...args: unknown[]) => unknown>(),
    sendBeacon: vi.fn<(...args: unknown[]) => unknown>(() => true),
  }
  class Xhr {
    open(...args: unknown[]): void {
      spies.open(...args)
    }
  }
  const scope: GuardScope = {
    location: { href: `${PREFIX}assets/landmark.worker-abc.js` },
    fetch: spies.fetch as unknown as GuardScope['fetch'],
    XMLHttpRequest: Xhr,
    importScripts: spies.importScripts,
    WebSocket: function WebSocket(url: string | URL) {
      spies.webSocket(url)
    } as unknown as GuardScope['WebSocket'],
    EventSource: function EventSource(url: string | URL) {
      spies.eventSource(url)
    } as unknown as GuardScope['EventSource'],
    Worker: function Worker(url: string | URL) {
      spies.worker(url)
    } as unknown as GuardScope['Worker'],
    navigator: { sendBeacon: spies.sendBeacon as unknown as (url: string | URL) => boolean },
  }
  return { scope, spies }
}

function install(onRefused = vi.fn()) {
  const { scope, spies } = moduleWorkerScope()
  installFetchGuard(scope, PREFIX, { onRefused, importModule: spies.importModule })
  return { scope, spies, onRefused }
}

const FOREIGN = [
  'https://example.com/x',
  'https://odml.pa.googleapis.com/v1/log',
  'http://app.test/artistica/models/a.task',
  'https://app.test/other/',
  'https://app.test/artistica',
  '//example.com/x',
  'wss://example.com/s',
  '/elsewhere',
  '../../elsewhere',
]

describe('installFetchGuard (M4-R4)', () => {
  it.each(FOREIGN)(
    'refuses fetch, XHR open, importScripts, self.import, WebSocket, EventSource, Worker and sendBeacon to %s',
    async (url) => {
      const { scope, spies } = install()
      await expect(scope.fetch?.(url)).rejects.toThrow(/refused/)
      await expect(scope.fetch?.(new URL(url, PREFIX))).rejects.toThrow(/refused/)
      expect(() => {
        new (scope.XMLHttpRequest as unknown as new () => XMLHttpRequest)().open('GET', url)
      }).toThrow(/refused/)
      expect(() => scope.importScripts?.(url)).toThrow(/refused/)
      await expect(scope.import?.(url)).rejects.toThrow(/refused/)
      expect(() => new (scope.WebSocket as unknown as new (u: string) => object)(url)).toThrow(
        /refused/,
      )
      expect(() => new (scope.EventSource as unknown as new (u: string) => object)(url)).toThrow(
        /refused/,
      )
      expect(() => new (scope.Worker as unknown as new (u: string) => object)(url)).toThrow(
        /refused/,
      )
      expect(() => scope.navigator?.sendBeacon?.(url)).toThrow(/refused/)
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled()
    },
  )

  it('refuses a Request object to another origin', async () => {
    const { scope, spies } = install()
    const request = { url: 'https://example.com/x' } as Request
    await expect(scope.fetch?.(request)).rejects.toThrow(/refused/)
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it.each([
    'blob:https://app.test/0b5e3c7c-1111-2222-3333-444455556666',
    'data:application/octet-stream;base64,AAAA',
    `${PREFIX}models/face_landmarker-float16-1.task`,
    '/artistica/assets/vision_wasm_module_internal-1f1d6215.wasm',
    './vision_bundle-x.js',
  ])('allows blob:, data: and same-origin under the base: %s', async (url) => {
    const { scope, spies, onRefused } = install()
    await expect(scope.fetch?.(url, { method: 'GET' })).resolves.toBe('fetched')
    expect(spies.fetch).toHaveBeenCalledWith(url, { method: 'GET' })
    new (scope.XMLHttpRequest as unknown as new () => XMLHttpRequest)().open('GET', url)
    expect(spies.open).toHaveBeenCalledWith('GET', url)
    await expect(scope.import?.(url)).resolves.toEqual({ default: 'module' })
    expect(spies.importModule).toHaveBeenCalledWith(url)
    new (scope.WebSocket as unknown as new (u: string) => object)(url)
    expect(spies.webSocket).toHaveBeenCalledWith(url)
    expect(scope.navigator?.sendBeacon?.(url)).toBe(true)
    expect(onRefused).not.toHaveBeenCalled()
  })

  it('importScripts in a module worker still throws TypeError for an allowed blob: URL', () => {
    const { scope, spies } = install()
    const url = 'blob:https://app.test/0b5e3c7c-1111-2222-3333-444455556666'
    expect(() => scope.importScripts?.(url)).toThrow(TypeError)
    expect(spies.importScripts).toHaveBeenCalledWith(url)
  })

  it('a refused importScripts throws an error that is not a TypeError, so MediaPipe does not fall back', () => {
    const { scope } = install()
    let error: unknown
    try {
      scope.importScripts?.('https://example.com/loader.js')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect((error as Error).name).toBe('FetchGuardError')
  })

  it('importScripts checks every URL before loading any', () => {
    const { scope, spies } = install()
    expect(() => scope.importScripts?.('blob:https://app.test/a', 'https://example.com/b')).toThrow(
      /refused/,
    )
    expect(spies.importScripts).not.toHaveBeenCalled()
  })

  it('guards self.import as well, defining it when the scope has none', async () => {
    const { scope, spies } = moduleWorkerScope()
    expect(scope.import).toBeUndefined()
    installFetchGuard(scope, PREFIX, { importModule: spies.importModule })
    expect(typeof scope.import).toBe('function')
    await expect(scope.import?.('https://example.com/m.js')).rejects.toThrow(/refused/)
    expect(spies.importModule).not.toHaveBeenCalled()
  })

  it('reports each refusal through the callback with the API and the URL', async () => {
    const { scope, onRefused } = install()
    await scope.fetch?.('https://example.com/a').catch(() => undefined)
    try {
      scope.navigator?.sendBeacon?.('https://example.com/b')
    } catch {
      /* refused */
    }
    expect(onRefused.mock.calls).toEqual([
      ['fetch', 'https://example.com/a'],
      ['sendBeacon', 'https://example.com/b'],
    ])
  })

  it('skips the APIs a scope does not have', () => {
    const scope: GuardScope = { location: { href: PREFIX } }
    installFetchGuard(scope, PREFIX)
    expect(scope.fetch).toBeUndefined()
    expect(scope.importScripts).toBeUndefined()
    expect(typeof scope.import).toBe('function')
  })

  it('rejects a prefix that is not an absolute URL ending in /', () => {
    expect(() => {
      installFetchGuard({ location: { href: PREFIX } }, '/artistica/')
    }).toThrow()
    expect(() => {
      installFetchGuard({ location: { href: PREFIX } }, 'https://app.test/artistica')
    }).toThrow()
  })
})
