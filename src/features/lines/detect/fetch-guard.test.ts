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
    await expect(scope.fetch?.(new Request('https://example.com/x'))).rejects.toThrow(/refused/)
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it('passes an allowed Request object through unchanged', async () => {
    const { scope, spies } = install()
    const request = new Request(`${PREFIX}models/a.task`)
    await expect(scope.fetch?.(request)).resolves.toBe('fetched')
    expect(spies.fetch).toHaveBeenCalledWith(request)
  })

  it('checks the URL the browser would use, not a spoofed url or href', async () => {
    const { scope, spies } = install()
    const allowedUrl = `${PREFIX}models/a.task`
    class SpoofUrl extends URL {
      override get href(): string {
        return allowedUrl
      }
    }
    class SpoofRequest extends Request {
      override get url(): string {
        return allowedUrl
      }
    }
    const spoofs: unknown[] = [
      { url: allowedUrl, toString: () => 'https://example.com/a' },
      new SpoofUrl('https://example.com/b'),
      new SpoofRequest('https://example.com/c'),
    ]
    for (const spoof of spoofs) {
      await expect(scope.fetch?.(spoof as Request)).rejects.toThrow(/refused/)
    }
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it('hands the native API the exact string it checked', async () => {
    const { scope, spies } = install()
    const flip = (): string => {
      let reads = 0
      const value = {
        toString: () => (reads++ === 0 ? `${PREFIX}ok` : 'https://example.com/flip'),
      }
      return value as unknown as string
    }
    await scope.fetch?.(flip())
    new (scope.XMLHttpRequest as unknown as new () => XMLHttpRequest)().open('GET', flip())
    expect(() => scope.importScripts?.(flip())).toThrow(TypeError)
    await scope.import?.(flip())
    new (scope.WebSocket as unknown as new (u: string) => object)(flip())
    scope.navigator?.sendBeacon?.(flip())
    for (const spy of [spies.fetch, spies.importScripts, spies.importModule, spies.webSocket]) {
      expect(spy).toHaveBeenCalledWith(`${PREFIX}ok`)
    }
    expect(spies.open).toHaveBeenCalledWith('GET', `${PREFIX}ok`)
    expect(spies.sendBeacon).toHaveBeenCalledWith(`${PREFIX}ok`, undefined)
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

describe('installFetchGuard: no way around it', () => {
  function fullScope() {
    const made: string[] = []
    const ctor = (name: string) =>
      function Native(this: object, url: unknown) {
        made.push(`${name} ${String(url)}`)
      } as unknown as GuardScope['WebSocket']
    const cached: unknown[] = []
    class Cache {
      add(request: unknown): Promise<unknown> {
        cached.push(request)
        return Promise.resolve()
      }
      addAll(requests: readonly unknown[]): Promise<unknown> {
        cached.push(...requests)
        return Promise.resolve()
      }
    }
    const fetch = vi.fn<(input: unknown) => Promise<string>>(() => Promise.resolve('fetched'))
    const scope: GuardScope = {
      location: { href: `${PREFIX}assets/landmark.worker-abc.js` },
      fetch,
      WebSocket: ctor('WebSocket'),
      EventSource: ctor('EventSource'),
      WebTransport: ctor('WebTransport'),
      WebSocketStream: ctor('WebSocketStream'),
      Worker: ctor('Worker'),
      SharedWorker: ctor('SharedWorker'),
      BroadcastChannel: ctor('BroadcastChannel'),
      FontFace: function FontFace(this: object, family: string, source: unknown) {
        made.push(`FontFace ${family} ${typeof source}`)
      } as unknown as GuardScope['FontFace'],
      Cache,
    }
    const onRefused = vi.fn()
    installFetchGuard(scope, PREFIX, { onRefused })
    return { scope, made, cached, fetch, onRefused }
  }
  const make = (C: unknown, ...args: unknown[]): unknown =>
    new (C as new (...a: unknown[]) => unknown)(...args)

  it.each(['Worker', 'SharedWorker', 'BroadcastChannel'] as const)(
    'refuses every %s, even from blob:, data: or the base, since it would run unguarded',
    (name) => {
      const { scope, made, onRefused } = fullScope()
      for (const url of ['blob:https://app.test/x', 'data:text/javascript,1', `${PREFIX}w.js`]) {
        expect(() => make(scope[name], url)).toThrow(/refused/)
      }
      expect(made).toEqual([])
      expect(onRefused).toHaveBeenCalledTimes(3)
    },
  )

  it.each(['WebSocket', 'EventSource', 'WebTransport', 'WebSocketStream'] as const)(
    'refuses %s to another origin, also through its prototype constructor',
    (name) => {
      const { scope, made } = fullScope()
      const Guarded = scope[name] as unknown as { prototype: { constructor: unknown } }
      expect(() => make(Guarded, 'https://example.com/s')).toThrow(/refused/)
      expect(Guarded.prototype.constructor).toBe(Guarded)
      expect(() => make(Guarded.prototype.constructor, 'https://example.com/s')).toThrow(/refused/)
      make(Guarded, `${PREFIX}s`, { x: 1 })
      expect(made).toEqual([`${name} ${PREFIX}s`])
    },
  )

  it('refuses a FontFace with a CSS source, which can name any URL, and keeps byte sources', () => {
    const { scope, made } = fullScope()
    expect(() => make(scope.FontFace, 'f', 'url(https://example.com/f.woff2)')).toThrow(/refused/)
    make(scope.FontFace, 'f', new ArrayBuffer(4))
    expect(made).toEqual(['FontFace f object'])
  })

  it('refuses Cache.add and Cache.addAll to another origin', async () => {
    const { scope, cached } = fullScope()
    const cache = new (
      scope.Cache as unknown as new () => {
        add(r: unknown): Promise<unknown>
        addAll(r: unknown[]): Promise<unknown>
      }
    )()
    await expect(cache.add('https://example.com/a')).rejects.toThrow(/refused/)
    await expect(cache.add(new Request('https://example.com/b'))).rejects.toThrow(/refused/)
    await expect(cache.addAll([`${PREFIX}ok`, 'https://example.com/c'])).rejects.toThrow(/refused/)
    expect(cached).toEqual([])
    await cache.addAll([`${PREFIX}ok`])
    expect(cached).toEqual([`${PREFIX}ok`])
  })

  const RealURL = URL
  const tamper = (o: object, k: string, d: PropertyDescriptor): (() => void) => {
    const saved = Object.getOwnPropertyDescriptor(o, k)
    Object.defineProperty(o, k, { ...d, configurable: true })
    return () => {
      if (saved) Object.defineProperty(o, k, saved)
    }
  }
  const g = globalThis as { URL: unknown }
  const replaceUrl = (): (() => void) => {
    g.URL = class extends RealURL {
      constructor() {
        super(`${PREFIX}ok`)
      }
    }
    return () => {
      g.URL = RealURL
    }
  }

  it.each([
    ['the global URL', 'https://example.com/x', replaceUrl],
    [
      'URL.prototype.protocol',
      'https://example.com/x',
      () => tamper(RealURL.prototype, 'protocol', { get: () => 'blob:' }),
    ],
    [
      'URL.prototype.origin',
      'https://example.com/artistica/x',
      () => tamper(RealURL.prototype, 'origin', { get: () => 'https://app.test' }),
    ],
    [
      'URL.prototype.pathname',
      'https://app.test/other/x',
      () => tamper(RealURL.prototype, 'pathname', { get: () => '/artistica/x' }),
    ],
    [
      'String.prototype.startsWith',
      'https://app.test/other/x',
      () => tamper(String.prototype, 'startsWith', { value: () => true, writable: true }),
    ],
  ] as const)('keeps refusing after %s is replaced', async (_, url, replace) => {
    const { scope, fetch } = fullScope()
    const restore = replace()
    let outcome: Promise<unknown> | undefined
    try {
      outcome = scope.fetch?.(url)
    } finally {
      restore()
    }
    await expect(outcome).rejects.toThrow(/refused/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never hands the native fetch to a replaced Function.prototype.call', async () => {
    const { scope, fetch } = fullScope()
    const stolen: unknown[] = []
    const restore = tamper(Function.prototype, 'call', {
      writable: true,
      value: function (this: unknown, ...args: unknown[]) {
        if (this === fetch) stolen.push(this)
        return Reflect.apply(this as (...a: unknown[]) => unknown, args[0], args.slice(1))
      },
    })
    let outcome: Promise<unknown> | undefined
    try {
      outcome = scope.fetch?.(`${PREFIX}ok`)
    } finally {
      restore()
    }
    await expect(outcome).resolves.toBe('fetched')
    expect(stolen).toEqual([])
  })
})
