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
  Worker?: Ctor
  SharedWorker?: Ctor
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

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (typeof input === 'object' && input !== null && 'url' in input) return String(input.url)
  return String(input)
}

export function installFetchGuard(
  scope: GuardScope,
  allowedPrefix: string,
  options: FetchGuardOptions = {},
): void {
  const prefix = new URL(allowedPrefix)
  if (prefix.href !== allowedPrefix || !allowedPrefix.endsWith('/')) {
    throw new Error(`fetch-guard: the prefix must be an absolute URL ending in /: ${allowedPrefix}`)
  }

  const allowed = (raw: string): boolean => {
    try {
      const url = new URL(raw, scope.location.href)
      if (url.protocol === 'blob:' || url.protocol === 'data:') return true
      return url.origin === prefix.origin && url.pathname.startsWith(prefix.pathname)
    } catch {
      return false
    }
  }
  const refusal = (api: string, input: unknown): Error | null => {
    const url = urlOf(input)
    if (allowed(url)) return null
    options.onRefused?.(api, url)
    return refused(api, url)
  }
  const check = (api: string, input: unknown): void => {
    const error = refusal(api, input)
    if (error) throw error
  }

  const fetch = scope.fetch
  if (fetch) {
    scope.fetch = (input, init) => {
      const error = refusal('fetch', input)
      if (error) return Promise.reject(error)
      return init === undefined ? fetch.call(scope, input) : fetch.call(scope, input, init)
    }
  }

  const xhr = scope.XMLHttpRequest?.prototype
  if (xhr) {
    const open = xhr.open
    xhr.open = function (this: unknown, method, url, ...rest) {
      check('XMLHttpRequest', url)
      open.call(this, method, url, ...rest)
    }
  }

  const importScripts = scope.importScripts
  if (importScripts) {
    scope.importScripts = (...urls) => {
      for (const url of urls) check('importScripts', url)
      importScripts.apply(scope, urls)
    }
  }

  const importModule = options.importModule ?? ((url: string) => import(/* @vite-ignore */ url))
  scope.import = (url) => {
    const error = refusal('import', url)
    if (error) return Promise.reject(error)
    return importModule(url)
  }

  for (const name of ['WebSocket', 'EventSource', 'Worker', 'SharedWorker'] as const) {
    const Original = scope[name]
    if (!Original) continue
    const Guarded = function (url: string | URL, ...rest: never[]) {
      check(name, url)
      return new Original(url, ...rest)
    }
    Guarded.prototype = Original.prototype as object
    scope[name] = Guarded as unknown as Ctor
  }

  const navigator = scope.navigator
  const sendBeacon = navigator?.sendBeacon
  if (navigator && sendBeacon) {
    navigator.sendBeacon = (url, data) => {
      check('sendBeacon', url)
      return sendBeacon.call(navigator, url, data)
    }
  }
}
