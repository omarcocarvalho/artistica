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

function own(proto: object | undefined, name: string, key: 'get' | 'value'): unknown {
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, name) : undefined
  return descriptor ? Reflect.get(descriptor, key) : undefined
}

function getter(proto: object | undefined, name: string): Getter | undefined {
  const get = own(proto, name, 'get')
  return typeof get === 'function' ? (get as Getter) : undefined
}

export function installFetchGuard(
  scope: GuardScope,
  allowedPrefix: string,
  options: FetchGuardOptions = {},
): void {
  const apply = Reflect.apply
  const construct = Reflect.construct
  const NativeURL = URL
  const toText = String
  const startsWith = own(String.prototype, 'startsWith', 'value') as Getter
  const urlProtocol = getter(URL.prototype, 'protocol')
  const urlOrigin = getter(URL.prototype, 'origin')
  const urlPathname = getter(URL.prototype, 'pathname')
  const requestUrl = getter(
    (globalThis as { Request?: { prototype: object } }).Request?.prototype,
    'url',
  )
  if (!urlProtocol || !urlOrigin || !urlPathname) throw new Error('fetch-guard: no URL getters')
  const read = (url: URL, get: Getter): string => toText(apply(get, url, []))

  const prefix = new NativeURL(allowedPrefix)
  if (prefix.href !== allowedPrefix || !allowedPrefix.endsWith('/')) {
    throw new Error(`fetch-guard: the prefix must be an absolute URL ending in /: ${allowedPrefix}`)
  }
  const prefixOrigin = prefix.origin
  const prefixPath = prefix.pathname

  const allowed = (raw: string): boolean => {
    try {
      const url = new NativeURL(raw, scope.location.href)
      const protocol = read(url, urlProtocol)
      if (protocol === 'blob:' || protocol === 'data:') return true
      const underPrefix: unknown = apply(startsWith, read(url, urlPathname), [prefixPath])
      return read(url, urlOrigin) === prefixOrigin && underPrefix === true
    } catch {
      return false
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
  const withFirst = (first: unknown, args: readonly unknown[], from = 1): unknown[] => {
    const list: unknown[] = []
    for (let i = 0; i < from; i++) list[i] = args[i]
    list[from - 1] = first
    for (let i = from; i < args.length; i++) list[i] = args[i]
    return list
  }
  const replaceCtor = (name: keyof GuardScope, Original: object, Guarded: object): void => {
    const proto = (Original as { prototype?: object }).prototype
    Object.defineProperty(Guarded, 'prototype', { value: proto })
    if (proto) {
      Object.defineProperty(proto, 'constructor', {
        value: Guarded,
        writable: true,
        configurable: true,
      })
    }
    ;(scope as unknown as Record<string, unknown>)[name] = Guarded
  }

  const fetch = scope.fetch
  if (fetch) {
    scope.fetch = async (input, init) => {
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
  }

  const xhr = scope.XMLHttpRequest?.prototype
  if (xhr) {
    const open = xhr.open
    xhr.open = function (this: unknown, method, url, ...rest) {
      const href = toText(url)
      check('XMLHttpRequest', href)
      apply(open, this, withFirst(href, [method, url, ...rest], 2))
    }
  }

  const importScripts = scope.importScripts
  if (importScripts) {
    scope.importScripts = (...urls) => {
      const hrefs: string[] = []
      for (let i = 0; i < urls.length; i++) {
        const href = toText(urls[i])
        check('importScripts', href)
        hrefs[i] = href
      }
      apply(importScripts, scope, hrefs)
    }
  }

  const importModule = options.importModule ?? ((url: string) => import(/* @vite-ignore */ url))
  scope.import = (url) => {
    const href = toText(url)
    const error = refusal('import', href)
    if (error) return Promise.reject(error)
    return importModule(href)
  }

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
    cache.add = async function (this: unknown, request) {
      return (await apply(add, this, [cacheTarget(request)])) as unknown
    }
    cache.addAll = async function (this: unknown, requests) {
      const targets: unknown[] = []
      for (let i = 0; i < requests.length; i++) targets[i] = cacheTarget(requests[i])
      return (await apply(addAll, this, [targets])) as unknown
    }
  }

  const navigator = scope.navigator
  const sendBeacon = navigator?.sendBeacon
  if (navigator && sendBeacon) {
    navigator.sendBeacon = (url, data) => {
      const href = toText(url)
      check('sendBeacon', href)
      return apply(sendBeacon, navigator, [href, data])
    }
  }
}
