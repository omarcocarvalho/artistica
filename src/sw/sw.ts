import { SHELL_CACHE_PREFIX, type ShellConfig } from './config'

export const NAVIGATION_TIMEOUT_MS = 5000

const ignore = () => undefined

export interface ExtendableEventLike {
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

  const navigate = async (request: Request, page: string | undefined): Promise<Response> => {
    const network = scope.fetch(request)
    if (page === undefined) return network
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<Response>((resolve) => {
      timer = setTimeout(() => {
        void cached(page).then((hit) => {
          if (hit !== undefined) resolve(hit)
        }, ignore)
      }, NAVIGATION_TIMEOUT_MS)
    })
    try {
      return await Promise.race([network, stalled])
    } catch (error) {
      const hit = await cached(page).catch(ignore)
      if (hit === undefined) throw error
      return hit
    } finally {
      clearTimeout(timer)
    }
  }

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
      event.respondWith(navigate(request, pageFor(url.pathname)))
      return
    }

    if (url.search === '' && shell.has(url.pathname)) {
      event.respondWith(cached(url.pathname).then((hit) => hit ?? scope.fetch(request)))
    }
  })
}
