type Ctor = new (url: string | URL, ...rest: never[]) => unknown

export interface GuardScope {
  readonly location: { readonly href: string }
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>
  XMLHttpRequest?: {
    prototype: { open: (method: string, url: string | URL, ...rest: never[]) => void }
  }
  importScripts?: (...urls: (string | URL)[]) => void
  import?: (url: string) => Promise<unknown>
  WebSocket?: Ctor
  EventSource?: Ctor
  WebTransport?: Ctor
  WebSocketStream?: Ctor
  Worker?: Ctor
  SharedWorker?: Ctor
  BroadcastChannel?: Ctor
  FontFace?: new (family: string, source: unknown, ...rest: never[]) => unknown
  Cache?: {
    prototype: {
      add: (request: RequestInfo | URL) => Promise<unknown>
      addAll: (requests: readonly (RequestInfo | URL)[]) => Promise<unknown>
    }
  }
  navigator?: { sendBeacon?: (url: string | URL, data?: unknown) => boolean }
}

export interface FetchGuardOptions {
  readonly onRefused?: (api: string, url: string) => void
  readonly importModule?: (url: string) => Promise<unknown>
}

function refused(api: string, url: string): Error {
  const e = new Error(`fetch-guard: refused ${api} ${url}`)
  e.name = 'FetchGuardError'
  return e
}

type Getter = (this: unknown) => unknown

function getter(proto: object | undefined, name: string): Getter | undefined {
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, name) : undefined
  const get: unknown = descriptor ? Reflect.get(descriptor, 'get') : undefined
  return typeof get === 'function' ? (get as Getter) : undefined
}

/**
 * Lets the scope's network APIs reach only `blob:` URLs of the scope's own origin (M4-R4).
 * Each guarded API replaces the native on its holder and on every prototype above it,
 * read-only and not configurable, so no native stays reachable from the scope.
 */
export function installFetchGuard(scope: GuardScope, options: FetchGuardOptions = {}): void {
  const apply = Reflect.apply
  const construct = Reflect.construct
  const defineProperty = Object.defineProperty
  const ownDescriptor = Object.getOwnPropertyDescriptor
  const prototypeOf = Object.getPrototypeOf
  const nullObject = Object.create as (proto: null) => Record<PropertyKey, unknown>
  const iteratorKey = Symbol.iterator
  const NativeURL = URL
  const toText = String
  const urlProtocol = getter(URL.prototype, 'protocol')
  const urlOrigin = getter(URL.prototype, 'origin')
  const requestUrl = getter(
    (globalThis as { Request?: { prototype: object } }).Request?.prototype,
    'url',
  )
  if (!urlProtocol || !urlOrigin) throw new Error('fetch-guard: no URL getters')
  const read = (url: URL, get: Getter): string => toText(apply(get, url, []))
  const origin = read(new NativeURL(scope.location.href), urlOrigin)

  const allowed = (raw: string): boolean => {
    try {
      const url = new NativeURL(raw)
      return read(url, urlProtocol) === 'blob:' && read(url, urlOrigin) === origin
    } catch {
      return false
    }
  }
  const lock = (holder: object, name: string, value: unknown): void => {
    for (let o: object | null = holder; o !== null; o = prototypeOf(o) as object | null) {
      const own = ownDescriptor(o, name)
      if (o !== holder && !own) continue
      defineProperty(o, name, {
        value,
        writable: false,
        enumerable: own?.enumerable ?? false,
        configurable: false,
      })
    }
  }
  const nativeRequestUrl = (input: unknown): string | null => {
    if (!requestUrl || typeof input !== 'object' || input === null) return null
    try {
      return toText(apply(requestUrl, input, []))
    } catch {
      return null
    }
  }
  const refusal = (api: string, url: string): Error | null => {
    if (allowed(url)) return null
    options.onRefused?.(api, url)
    return refused(api, url)
  }
  const check = (api: string, url: string): void => {
    const error = refusal(api, url)
    if (error) throw error
  }
  const refuseAlways = (api: string, url: string): never => {
    options.onRefused?.(api, url)
    throw refused(api, url)
  }
  // An argument list for a native: own elements only, so an index accessor or iterator added
  // to Array.prototype later can neither drop a checked URL nor put another one in its place.
  const put = (target: object, key: PropertyKey, value: unknown): void => {
    const descriptor = nullObject(null)
    descriptor.value = value
    descriptor.writable = true
    descriptor.enumerable = true
    descriptor.configurable = true
    defineProperty(target, key, descriptor)
  }
  const ownIterable = (list: unknown[]): unknown[] => {
    let next = 0
    const iterator = nullObject(null)
    iterator.next = () => {
      const step = nullObject(null)
      step.done = next >= list.length
      step.value = step.done ? undefined : list[next++]
      return step
    }
    put(list, iteratorKey, () => iterator)
    return list
  }
  const withFirst = (first: unknown, args: readonly unknown[], from = 1): unknown[] => {
    const list: unknown[] = []
    for (let i = 0; i < args.length || i < from; i++) put(list, i, i === from - 1 ? first : args[i])
    return list
  }
  const replaceCtor = (name: keyof GuardScope, Original: object, Guarded: object): void => {
    const proto = (Original as { prototype?: object }).prototype
    defineProperty(Guarded, 'prototype', { value: proto })
    if (proto) {
      defineProperty(proto, 'constructor', {
        value: Guarded,
        writable: false,
        enumerable: false,
        configurable: false,
      })
    }
    lock(scope, name, Guarded)
  }

  const fetch = scope.fetch
  if (fetch) {
    const guarded: typeof fetch = async (input, init) => {
      const requestHref = nativeRequestUrl(input)
      const target = requestHref === null ? toText(input) : input
      check('fetch', requestHref ?? toText(target))
      const response: unknown = await apply(
        fetch,
        scope,
        init === undefined ? [target] : [target, init],
      )
      return response
    }
    lock(scope, 'fetch', guarded)
  }

  const xhr = scope.XMLHttpRequest?.prototype
  if (xhr) {
    const open = xhr.open
    const guarded = function (this: unknown, ...args: unknown[]) {
      const href = toText(args[1])
      check('XMLHttpRequest', href)
      apply(open, this, withFirst(href, args, 2))
    } as typeof open
    lock(xhr, 'open', guarded)
  }

  const importScripts = scope.importScripts
  if (importScripts) {
    const guarded: typeof importScripts = (...urls) => {
      const hrefs: string[] = []
      for (let i = 0; i < urls.length; i++) {
        const href = toText(urls[i])
        check('importScripts', href)
        put(hrefs, i, href)
      }
      apply(importScripts, scope, hrefs)
    }
    lock(scope, 'importScripts', guarded)
  }

  const importModule = options.importModule ?? ((url: string) => import(/* @vite-ignore */ url))
  const guardedImport = (url: string): Promise<unknown> => {
    const href = toText(url)
    const error = refusal('import', href)
    if (error) return Promise.reject(error)
    return importModule(href)
  }
  lock(scope, 'import', guardedImport)

  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'WebSocketStream'] as const) {
    const Original = scope[name]
    if (!Original) continue
    replaceCtor(name, Original, function (...args: unknown[]) {
      const href = toText(args[0])
      check(name, href)
      return construct(Original, withFirst(href, args)) as unknown
    })
  }

  for (const name of ['Worker', 'SharedWorker', 'BroadcastChannel'] as const) {
    const Original = scope[name]
    if (!Original) continue
    replaceCtor(name, Original, function (...args: unknown[]) {
      return refuseAlways(name, toText(args[0]))
    })
  }

  const FontFace = scope.FontFace
  if (FontFace) {
    replaceCtor('FontFace', FontFace, function (...args: unknown[]) {
      const source = args[1]
      if (typeof source === 'string') refuseAlways('FontFace', source)
      return construct(FontFace, withFirst(source, args, 2)) as unknown
    })
  }

  const cache = scope.Cache?.prototype
  if (cache) {
    const add = cache.add
    const addAll = cache.addAll
    const cacheTarget = (input: unknown): unknown => {
      const requestHref = nativeRequestUrl(input)
      const target = requestHref === null ? toText(input) : input
      check('Cache', requestHref ?? toText(target))
      return target
    }
    const guardedAdd: typeof add = async function (this: unknown, request) {
      return (await apply(add, this, [cacheTarget(request)])) as unknown
    }
    const guardedAddAll: typeof addAll = async function (this: unknown, requests) {
      const targets: unknown[] = []
      for (let i = 0; i < requests.length; i++) put(targets, i, cacheTarget(requests[i]))
      return (await apply(addAll, this, [ownIterable(targets)])) as unknown
    }
    lock(cache, 'add', guardedAdd)
    lock(cache, 'addAll', guardedAddAll)
  }

  const navigator = scope.navigator
  const sendBeacon = navigator?.sendBeacon
  if (navigator && sendBeacon) {
    const guarded: typeof sendBeacon = (url, data) => {
      const href = toText(url)
      check('sendBeacon', href)
      return apply(sendBeacon, navigator, [href, data])
    }
    lock(navigator, 'sendBeacon', guarded)
  }
}
