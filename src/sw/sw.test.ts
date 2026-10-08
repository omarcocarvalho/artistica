import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShellConfig } from './config.ts'
import { NAVIGATION_TIMEOUT_MS, type ShellScope, startShellWorker } from './sw.ts'

const ORIGIN = 'https://omarcocarvalho.github.io'
const CONFIG: ShellConfig = {
  cache: 'artistica-shell-new',
  base: '/artistica/',
  shell: [
    '/artistica/index.html',
    '/artistica/app/index.html',
    '/artistica/assets/app-abc.js',
    '/artistica/favicon.svg',
  ],
  bypass: [
    '/artistica/assets/vision_wasm_module_internal-1f1d6215.js',
    '/artistica/models/face_landmarker-float16-1.task',
  ],
}

class FakeCache {
  readonly entries = new Map<string, Response>()
  private readonly fetcher: (request: Request) => Promise<Response>
  constructor(fetcher: (request: Request) => Promise<Response>) {
    this.fetcher = fetcher
  }
  async addAll(requests: Request[]): Promise<void> {
    const responses = await Promise.all(requests.map((r) => this.fetcher(r)))
    requests.forEach((r, i) => {
      const response = responses[i]
      if (response) this.entries.set(r.url, response)
    })
  }
  match(url: string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(url)?.clone())
  }
}

function setup(config: ShellConfig = CONFIG, existing: string[] = []) {
  const online = { value: true }
  const stalled = { value: false }
  const release = { value: 'A' }
  const fetched: Request[] = []
  const held: { resolve: (r: Response) => void; reject: (e: unknown) => void }[] = []
  const fetch = vi.fn((request: Request) => {
    fetched.push(request)
    if (stalled.value)
      return new Promise<Response>((resolve, reject) => held.push({ resolve, reject }))
    if (!online.value) return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(new Response(`${release.value} ${request.url}`))
  })
  const stores = new Map<string, FakeCache>(existing.map((name) => [name, new FakeCache(fetch)]))
  const caches = {
    open: vi.fn((name: string) => {
      const store = stores.get(name) ?? new FakeCache(fetch)
      stores.set(name, store)
      return Promise.resolve(store)
    }),
    keys: vi.fn(() => Promise.resolve([...stores.keys()])),
    delete: vi.fn((name: string) => Promise.resolve(stores.delete(name))),
  }
  const listeners = new Map<string, (event: unknown) => void>()
  const skipWaiting = vi.fn()
  const claim = vi.fn()
  const scope = {
    location: { origin: ORIGIN },
    caches,
    fetch,
    skipWaiting,
    clients: { claim },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener)
    },
  }
  startShellWorker(scope as unknown as ShellScope, config)

  const lifecycle = async (type: 'install' | 'activate') => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners.get(type)?.({
      waitUntil: (p: Promise<unknown>) => {
        pending = p
      },
    })
    await pending
  }
  const request = (url: string, init: { method?: string; mode?: string } = {}) =>
    ({ url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }) as unknown as Request
  const dispatch = (req: Request): Promise<Response> | undefined => {
    let response: Promise<Response> | undefined
    listeners.get('fetch')?.({
      request: req,
      respondWith: (r: Promise<Response>) => {
        response = r
      },
    })
    return response
  }
  return {
    online,
    stalled,
    held,
    release,
    fetch,
    fetched,
    stores,
    caches,
    lifecycle,
    request,
    dispatch,
    skipWaiting,
    claim,
  }
}

describe('service worker', () => {
  it('install precaches every file of the build list into artistica-shell-<build>', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    expect(sw.caches.open).toHaveBeenCalledWith('artistica-shell-new')
    expect([...(sw.stores.get('artistica-shell-new')?.entries.keys() ?? [])]).toEqual(
      CONFIG.shell.map((path) => `${ORIGIN}${path}`),
    )
    expect(sw.fetched.map((r) => r.cache)).toEqual(CONFIG.shell.map(() => 'reload'))
  })

  it('navigations are network-first and fall back to the cached page offline', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    sw.fetched.length = 0

    const online = await sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' }))
    expect(await online?.text()).toBe(`A ${ORIGIN}/artistica/app/`)
    expect(sw.fetched).toHaveLength(1)

    sw.online.value = false
    const pages: [string, string][] = [
      ['/artistica/app/', '/artistica/app/index.html'],
      ['/artistica/app', '/artistica/app/index.html'],
      ['/artistica/app/?from=landing', '/artistica/app/index.html'],
      ['/artistica/app/index.html', '/artistica/app/index.html'],
      ['/artistica/', '/artistica/index.html'],
    ]
    for (const [path, page] of pages) {
      const offline = await sw.dispatch(sw.request(`${ORIGIN}${path}`, { mode: 'navigate' }))
      expect(await offline?.text()).toBe(`A ${ORIGIN}${page}`)
    }
  })

  it('an offline navigation to a page outside the shell fails as it would without the worker', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    sw.online.value = false
    const response = sw.dispatch(sw.request(`${ORIGIN}/artistica/nope/`, { mode: 'navigate' }))
    await expect(response).rejects.toThrow('Failed to fetch')
  })

  it('an offline navigation to a shell page that is not cached fails', async () => {
    const sw = setup()
    sw.online.value = false
    const response = sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' }))
    await expect(response).rejects.toThrow('Failed to fetch')
  })

  it('an online navigation never writes the network page into the cache', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    sw.release.value = 'B'
    const online = await sw.dispatch(
      sw.request(`${ORIGIN}/artistica/app/index.html`, { mode: 'navigate' }),
    )
    expect(await online?.text()).toBe(`B ${ORIGIN}/artistica/app/index.html`)
    sw.online.value = false
    const offline = await sw.dispatch(
      sw.request(`${ORIGIN}/artistica/app/index.html`, { mode: 'navigate' }),
    )
    expect(await offline?.text()).toBe(`A ${ORIGIN}/artistica/app/index.html`)
    expect(sw.stores.get('artistica-shell-new')?.entries.size).toBe(CONFIG.shell.length)
  })

  describe('a navigation on a stalled network', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const track = (response: Promise<Response> | undefined) => {
      const state: { text?: string; error?: unknown } = {}
      response?.then(
        async (r) => (state.text = await r.text()),
        (e: unknown) => (state.error = e),
      )
      return state
    }

    it('serves the cached page after 5 s, not before', async () => {
      expect(NAVIGATION_TIMEOUT_MS).toBe(5000)
      const sw = setup()
      await sw.lifecycle('install')
      vi.useFakeTimers()
      sw.stalled.value = true
      const state = track(sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' })))
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1)
      expect(state).toEqual({})
      await vi.advanceTimersByTimeAsync(1)
      expect(state).toEqual({ text: `A ${ORIGIN}/artistica/app/index.html` })

      sw.release.value = 'B'
      sw.held[0]?.resolve(new Response('late network page'))
      await vi.advanceTimersByTimeAsync(0)
      expect(state).toEqual({ text: `A ${ORIGIN}/artistica/app/index.html` })
    })

    it('a network answer before the timeout wins and the cache is never read', async () => {
      const sw = setup()
      await sw.lifecycle('install')
      vi.useFakeTimers()
      sw.stalled.value = true
      sw.caches.open.mockClear()
      const state = track(sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' })))
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1)
      sw.held[0]?.resolve(new Response('network page'))
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 2)
      expect(state).toEqual({ text: 'network page' })
      expect(sw.caches.open).not.toHaveBeenCalled()
    })

    it('without a cached page it keeps waiting for the network', async () => {
      const sw = setup()
      vi.useFakeTimers()
      sw.stalled.value = true
      const inShell = track(
        sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' })),
      )
      const outside = track(
        sw.dispatch(sw.request(`${ORIGIN}/artistica/nope/`, { mode: 'navigate' })),
      )
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 10)
      expect(inShell).toEqual({})
      expect(outside).toEqual({})
      sw.held[0]?.resolve(new Response('app page'))
      sw.held[1]?.reject(new TypeError('Failed to fetch'))
      await vi.advanceTimersByTimeAsync(0)
      expect(inShell).toEqual({ text: 'app page' })
      expect(outside.error).toBeInstanceOf(TypeError)
    })

    it('a network failure after the timeout fell back changes nothing', async () => {
      const sw = setup()
      await sw.lifecycle('install')
      vi.useFakeTimers()
      sw.stalled.value = true
      const state = track(sw.dispatch(sw.request(`${ORIGIN}/artistica/`, { mode: 'navigate' })))
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS)
      sw.held[0]?.reject(new TypeError('Failed to fetch'))
      await vi.advanceTimersByTimeAsync(0)
      expect(state).toEqual({ text: `A ${ORIGIN}/artistica/index.html` })
    })
  })

  it('hashed assets are cache-first', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    const cache = sw.stores.get('artistica-shell-new')
    cache?.entries.set(`${ORIGIN}/artistica/assets/app-abc.js`, new Response('cached app'))
    sw.fetched.length = 0

    const hit = await sw.dispatch(sw.request(`${ORIGIN}/artistica/assets/app-abc.js`))
    expect(await hit?.text()).toBe('cached app')
    expect(sw.fetched).toHaveLength(0)

    cache?.entries.delete(`${ORIGIN}/artistica/assets/app-abc.js`)
    const miss = await sw.dispatch(sw.request(`${ORIGIN}/artistica/assets/app-abc.js`))
    expect(await miss?.text()).toBe(`A ${ORIGIN}/artistica/assets/app-abc.js`)
  })

  it('ignores non-GET, other origins, blob: and AI asset requests (no respondWith)', async () => {
    const sw = setup()
    await sw.lifecycle('install')
    const ignored = [
      sw.request(`${ORIGIN}/artistica/assets/app-abc.js`, { method: 'POST' }),
      sw.request(`${ORIGIN}/artistica/assets/app-abc.js`, { method: 'HEAD' }),
      sw.request('https://example.com/photo.jpg'),
      sw.request('https://example.com/artistica/assets/app-abc.js'),
      sw.request(`blob:${ORIGIN}/0b6c1b1e-7f4e-4f5b-9a77-1d1f6a1c0e3a`),
      sw.request(`blob:${ORIGIN}/artistica/assets/app-abc.js`),
      sw.request(`${ORIGIN}/artistica/assets/vision_wasm_module_internal-1f1d6215.js`),
      sw.request(`${ORIGIN}/artistica/models/face_landmarker-float16-1.task`),
      sw.request(`${ORIGIN}/artistica/models/face_landmarker-float16-1.task`, {
        mode: 'navigate',
      }),
      sw.request(`${ORIGIN}/artistica/assets/app-abc.js?v=2`),
      sw.request(`${ORIGIN}/artistica/assets/not-in-the-build.js`),
      sw.request(`${ORIGIN}/other/app/`, { mode: 'navigate' }),
    ]
    for (const req of ignored) expect(sw.dispatch(req), req.url).toBeUndefined()
  })

  it('activate deletes older artistica-shell-* caches and never artistica-ai-*', async () => {
    const sw = setup(CONFIG, [
      'artistica-shell-old',
      'artistica-shell-older',
      'artistica-ai-v1',
      'artistica-ai-v2',
      'other',
    ])
    await sw.lifecycle('install')
    await sw.lifecycle('activate')
    expect([...sw.stores.keys()].sort()).toEqual([
      'artistica-ai-v1',
      'artistica-ai-v2',
      'artistica-shell-new',
      'other',
    ])
  })

  it('never calls skipWaiting or clients.claim', async () => {
    const sw = setup(CONFIG, ['artistica-shell-old'])
    await sw.lifecycle('install')
    await sw.lifecycle('activate')
    await sw.dispatch(sw.request(`${ORIGIN}/artistica/app/`, { mode: 'navigate' }))
    await sw.dispatch(sw.request(`${ORIGIN}/artistica/assets/app-abc.js`))
    expect(sw.skipWaiting).not.toHaveBeenCalled()
    expect(sw.claim).not.toHaveBeenCalled()
  })

  it('a failed precache fails the install, so the previous worker stays', async () => {
    const sw = setup()
    sw.online.value = false
    await expect(sw.lifecycle('install')).rejects.toThrow('Failed to fetch')
    expect(sw.stores.get('artistica-shell-new')?.entries.size ?? 0).toBe(0)
  })
})
