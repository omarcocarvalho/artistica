import { describe, expect, it, vi, type Mock } from 'vitest'
import { installFetchGuard, type GuardScope } from './fetch-guard'

const PREFIX = 'https://app.test/artistica/'
const BLOB = 'blob:https://app.test/0b5e3c7c-1111-2222-3333-444455556666'

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
  installFetchGuard(scope, { onRefused, importModule: spies.importModule })
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
  `${PREFIX}models/face_landmarker-float16-1.task`,
  '/artistica/assets/vision_wasm_module_internal-1f1d6215.wasm',
  './vision_bundle-x.js',
  `${PREFIX}x?photo=AAAA`,
  'data:application/octet-stream;base64,AAAA',
  'data:text/javascript,import "https://example.com/x.js"',
  'blob:https://example.com/0b5e3c7c-1111-2222-3333-444455556666',
  'blob:null/0b5e3c7c-1111-2222-3333-444455556666',
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
    const request = new Request(BLOB)
    await expect(scope.fetch?.(request)).resolves.toBe('fetched')
    expect(spies.fetch).toHaveBeenCalledWith(request)
  })

  it('checks the URL the browser would use, not a spoofed url or href', async () => {
    const { scope, spies } = install()
    const allowedUrl = BLOB
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
        toString: () => (reads++ === 0 ? BLOB : 'https://example.com/flip'),
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
      expect(spy).toHaveBeenCalledWith(BLOB)
    }
    expect(spies.open).toHaveBeenCalledWith('GET', BLOB)
    expect(spies.sendBeacon).toHaveBeenCalledWith(BLOB, undefined)
  })

  it.each([BLOB, 'blob:https://app.test/another-object-url'])(
    'allows only blob: URLs of its own origin: %s',
    async (url) => {
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
    },
  )

  it('refuses same-origin requests whatever their method, body or query', async () => {
    const { scope, spies } = install()
    await expect(
      scope.fetch?.(`${PREFIX}__post`, { method: 'POST', body: new Uint8Array([1, 2, 3]) }),
    ).rejects.toThrow(/refused/)
    await expect(scope.fetch?.(`${PREFIX}robots.txt?photo=AAAA`)).rejects.toThrow(/refused/)
    await expect(scope.fetch?.(`${PREFIX}models/a.task`, { method: 'GET' })).rejects.toThrow(
      /refused/,
    )
    expect(spies.fetch).not.toHaveBeenCalled()
  })

  it('refuses a data: module in self.import, whose own imports could reach any origin', async () => {
    const { scope, spies } = install()
    for (const url of [
      'data:text/javascript,import "https://example.com/static.js"',
      'data:text/javascript,await import("https://example.com/dynamic.js")',
      'data:text/javascript,export default 1',
    ]) {
      await expect(scope.import?.(url)).rejects.toThrow(/refused/)
    }
    expect(spies.importModule).not.toHaveBeenCalled()
  })

  it('judges the origin from the location at install time, not a location shadowed later', async () => {
    const { scope, spies } = install()
    Object.defineProperty(scope, 'location', { value: { href: 'https://example.com/artistica/' } })
    await expect(
      scope.fetch?.('blob:https://example.com/0b5e3c7c-1111-2222-3333-444455556666'),
    ).rejects.toThrow(/refused/)
    await expect(scope.fetch?.(BLOB)).resolves.toBe('fetched')
    expect(spies.fetch).toHaveBeenCalledTimes(1)
  })

  it('importScripts in a module worker still throws TypeError for an allowed blob: URL', () => {
    const { scope, spies } = install()
    const url = BLOB
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
    installFetchGuard(scope, { importModule: spies.importModule })
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
    installFetchGuard(scope)
    expect(scope.fetch).toBeUndefined()
    expect(scope.importScripts).toBeUndefined()
    expect(typeof scope.import).toBe('function')
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
    installFetchGuard(scope, { onRefused })
    return { scope, made, cached, fetch, onRefused }
  }
  const make = (C: unknown, ...args: unknown[]): unknown =>
    new (C as new (...a: unknown[]) => unknown)(...args)

  it.each(['Worker', 'SharedWorker', 'BroadcastChannel'] as const)(
    'refuses every %s, even from blob:, data: or the base, since it would run unguarded',
    (name) => {
      const { scope, made, onRefused } = fullScope()
      for (const url of [BLOB, 'data:text/javascript,1', `${PREFIX}w.js`]) {
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
      make(Guarded, BLOB, { x: 1 })
      expect(made).toEqual([`${name} ${BLOB}`])
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
    await expect(cache.addAll([BLOB, 'https://example.com/c'])).rejects.toThrow(/refused/)
    expect(cached).toEqual([])
    await cache.addAll([BLOB])
    expect(cached).toEqual([BLOB])
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
        super(BLOB)
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
      'blob:https://example.com/0b5e3c7c-1111-2222-3333-444455556666',
      () => tamper(RealURL.prototype, 'origin', { get: () => 'https://app.test' }),
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
      outcome = scope.fetch?.(BLOB)
    } finally {
      restore()
    }
    await expect(outcome).resolves.toBe('fetched')
    expect(stolen).toEqual([])
  })
})

describe('installFetchGuard: the natives on the prototype chain', () => {
  const EVIL = 'https://example.com/x'

  // A worker keeps fetch and importScripts on WorkerGlobalScope.prototype, two levels up, and
  // the interface objects as own properties of the scope.
  function protoScope() {
    const natives = {
      fetch: vi.fn<(...args: unknown[]) => unknown>(() => Promise.resolve('fetched')),
      upperFetch: vi.fn<(...args: unknown[]) => unknown>(() => Promise.resolve('upper')),
      importScripts: vi.fn<(...args: unknown[]) => unknown>(),
      open: vi.fn<(...args: unknown[]) => unknown>(),
      add: vi.fn<(...args: unknown[]) => unknown>(() => Promise.resolve()),
      addAll: vi.fn<(...args: unknown[]) => unknown>(() => Promise.resolve()),
      sendBeacon: vi.fn<(...args: unknown[]) => unknown>(() => true),
      webSocket: vi.fn<(...args: unknown[]) => unknown>(),
    }
    const upper = { fetch: natives.upperFetch }
    const workerGlobalScope = Object.create(upper) as Record<string, unknown>
    workerGlobalScope.fetch = natives.fetch
    workerGlobalScope.importScripts = natives.importScripts
    const dedicated = Object.create(workerGlobalScope) as object
    class Xhr {
      open(...args: unknown[]): void {
        natives.open(...args)
      }
    }
    class Cache {
      add(...args: unknown[]): unknown {
        return natives.add(...args)
      }
      addAll(...args: unknown[]): unknown {
        return natives.addAll(...args)
      }
    }
    const navigatorProto = { sendBeacon: natives.sendBeacon }
    const scope = Object.create(dedicated) as GuardScope & Record<string, unknown>
    Object.assign(scope, {
      location: { href: `${PREFIX}assets/landmark.worker-abc.js` },
      XMLHttpRequest: Xhr,
      Cache,
      WebSocket: function WebSocket(url: unknown) {
        natives.webSocket(url)
      },
      navigator: Object.create(navigatorProto) as object,
    })
    installFetchGuard(scope)
    const chain = (start: object): object[] => {
      const list: object[] = []
      for (let o: object | null = start; o !== null; o = Object.getPrototypeOf(o) as object | null)
        list.push(o)
      return list
    }
    return { scope, natives, upper, workerGlobalScope, chain }
  }

  const holders = (s: ReturnType<typeof protoScope>) =>
    [
      [s.scope, 'fetch'],
      [s.scope, 'importScripts'],
      [s.scope, 'import'],
      [s.scope, 'WebSocket'],
      [(s.scope.XMLHttpRequest as { prototype: object }).prototype, 'open'],
      [(s.scope.Cache as { prototype: object }).prototype, 'add'],
      [(s.scope.Cache as { prototype: object }).prototype, 'addAll'],
      [s.scope.navigator as object, 'sendBeacon'],
    ] as const

  it('a native reached through the prototype chain is the guard', async () => {
    const s = protoScope()
    for (const proto of [s.workerGlobalScope, s.upper]) {
      const native = Object.getOwnPropertyDescriptor(proto, 'fetch')?.value as typeof fetch
      await expect(Reflect.apply(native, s.scope, [EVIL])).rejects.toThrow(/refused/)
    }
    const importScripts = Object.getOwnPropertyDescriptor(s.workerGlobalScope, 'importScripts')
      ?.value as (u: string) => void
    expect(() => {
      Reflect.apply(importScripts, s.scope, [EVIL])
    }).toThrow(/refused/)
    const beacon = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(s.scope.navigator) as object,
      'sendBeacon',
    )?.value as (u: string) => boolean
    expect(() => Reflect.apply(beacon, s.scope.navigator, [EVIL])).toThrow(/refused/)
    for (const spy of Object.values(s.natives)) expect(spy).not.toHaveBeenCalled()
  })

  it('every guarded API is the guard on each object of its chain, read-only and not configurable', () => {
    const s = protoScope()
    for (const [holder, name] of holders(s)) {
      const guard = (holder as Record<string, unknown>)[name]
      expect(Object.getOwnPropertyDescriptor(holder, name), name).toMatchObject({
        value: guard,
        writable: false,
        configurable: false,
      })
      for (const o of s.chain(holder)) {
        const d = Object.getOwnPropertyDescriptor(o, name)
        if (!d) continue
        expect(d, name).toMatchObject({ value: guard, writable: false, configurable: false })
      }
    }
  })

  it('a guard cannot be deleted or overwritten to expose the native below it', async () => {
    const s = protoScope()
    for (const [holder, name] of holders(s)) {
      const target = holder as Record<string, unknown>
      const guard = target[name]
      expect(Reflect.deleteProperty(target, name), name).toBe(false)
      expect(() => {
        target[name] = () => 'replaced'
      }, name).toThrow(TypeError)
      expect(() => {
        Object.defineProperty(holder, name, { value: () => 'replaced' })
      }, name).toThrow(TypeError)
      expect(target[name], name).toBe(guard)
    }
    await expect(s.scope.fetch?.(EVIL)).rejects.toThrow(/refused/)
    expect(s.natives.fetch).not.toHaveBeenCalled()
  })

  it("a guarded constructor's prototype keeps pointing at the guard", () => {
    const s = protoScope()
    const Guarded = s.scope.WebSocket as unknown as { prototype: object }
    expect(Object.getOwnPropertyDescriptor(Guarded.prototype, 'constructor')).toMatchObject({
      value: Guarded,
      writable: false,
      configurable: false,
    })
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'constructor')).toMatchObject({
      value: Object,
      writable: true,
      configurable: true,
    })
  })

  it('still calls the nearest native for an allowed URL', async () => {
    const s = protoScope()
    await expect(s.scope.fetch?.(BLOB)).resolves.toBe('fetched')
    expect(s.natives.fetch).toHaveBeenCalledWith(BLOB)
    expect(s.natives.upperFetch).not.toHaveBeenCalled()
  })
})
