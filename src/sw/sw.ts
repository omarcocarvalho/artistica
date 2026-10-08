export interface ShellConfig {
  readonly cache: string
  readonly base: string
  readonly shell: readonly string[]
  readonly bypass: readonly string[]
}

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEventLike {
  readonly request: Request
  respondWith(response: Promise<Response>): void
}

export interface ShellScope {
  readonly location: { readonly origin: string }
  readonly caches: CacheStorage
  fetch(request: Request): Promise<Response>
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: ExtendableEventLike) => void,
  ): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
}

export const SHELL_CACHE_PREFIX = 'artistica-shell-'

export function startShellWorker(scope: ShellScope, config: ShellConfig): void {
  const shell = new Set(config.shell)
  const bypass = new Set(config.bypass)
  const href = (path: string) => new URL(path, scope.location.origin).href
  const cached = async (path: string) => {
    const cache = await scope.caches.open(config.cache)
    return cache.match(href(path))
  }
  const pageFor = (path: string) =>
    [path, path.endsWith('/') ? `${path}index.html` : `${path}/index.html`].find((p) =>
      shell.has(p),
    )

  scope.addEventListener('install', (event) => {
    event.waitUntil(
      scope.caches
        .open(config.cache)
        .then((cache) =>
          cache.addAll(config.shell.map((path) => new Request(href(path), { cache: 'reload' }))),
        ),
    )
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      scope.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== config.cache)
              .map((key) => scope.caches.delete(key)),
          ),
        ),
    )
  })

  scope.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== scope.location.origin || !url.pathname.startsWith(config.base)) return
    if (bypass.has(url.pathname)) return

    if (request.mode === 'navigate') {
      const page = pageFor(url.pathname)
      event.respondWith(
        scope.fetch(request).catch(async (error: unknown) => {
          const fallback = page === undefined ? undefined : await cached(page)
          if (fallback === undefined) throw error
          return fallback
        }),
      )
      return
    }

    if (url.search === '' && shell.has(url.pathname)) {
      event.respondWith(cached(url.pathname).then((hit) => hit ?? scope.fetch(request)))
    }
  })
}
