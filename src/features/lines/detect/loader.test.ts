import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_ASSETS } from 'virtual:ai-assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CACHE,
  type AiLoaderDeps,
  bytesToDownload,
  createAiLoader,
  isCached,
  loadAiAsset,
} from './loader'
import type { AiAsset, AiAssets, Progress } from './schedule'

const ORIGIN = 'http://localhost'

function bytesOf(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) out[i] = (i * 31 + seed * 7) & 0xff
  return out
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

const BODIES = {
  runtimeLoader: bytesOf(1_000, 1),
  runtimeWasm: bytesOf(10_000, 2),
  face: bytesOf(3_000, 3),
  pose: bytesOf(9_000, 4),
}

const assetFor = (url: string, body: Uint8Array): AiAsset => ({
  url,
  bytes: body.length,
  sha256: sha256(body),
})

const ASSETS: AiAssets = {
  runtimeLoader: assetFor('/assets/vision_wasm_module_internal-aaaaaaaa.js', BODIES.runtimeLoader),
  runtimeWasm: assetFor('/assets/vision_wasm_module_internal-bbbbbbbb.wasm', BODIES.runtimeWasm),
  face: assetFor('/models/face_landmarker-float16-1.task', BODIES.face),
  pose: assetFor('/models/pose_landmarker_full-float16-1.task', BODIES.pose),
}

const KEYS = ['runtimeLoader', 'runtimeWasm', 'face', 'pose'] as const
const bodyAt = (url: string): Uint8Array | undefined => {
  const key = KEYS.find((k) => ASSETS[k].url === url)
  return key ? BODIES[key] : undefined
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing')
  return value
}

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const href = (url: string | URL | Request) =>
  new URL(typeof url === 'string' || url instanceof URL ? url : url.url, ORIGIN).href

class FakeCache {
  readonly entries = new Map<string, { body: Uint8Array; type: string | null }>()
  readonly puts: string[] = []
  readonly unreadable = new Map<string, 'match' | 'body'>()
  failPut = false
  match(url: string | Request): Promise<Response | undefined> {
    const broken = this.unreadable.get(href(url))
    if (broken === 'match') return Promise.reject(new DOMException('gone', 'NotFoundError'))
    if (broken === 'body') {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new TypeError('entry body missing'))
        },
      })
      return Promise.resolve(new Response(body))
    }
    const e = this.entries.get(href(url))
    return Promise.resolve(
      e
        ? new Response(e.body.slice(), { headers: e.type ? { 'content-type': e.type } : {} })
        : undefined,
    )
  }
  async put(url: string | Request, res: Response): Promise<void> {
    if (this.failPut) throw new DOMException('quota', 'QuotaExceededError')
    const body = new Uint8Array(await res.arrayBuffer())
    this.puts.push(href(url))
    this.entries.set(href(url), { body, type: res.headers.get('content-type') })
  }
  delete(url: string | Request): Promise<boolean> {
    this.unreadable.delete(href(url))
    return Promise.resolve(this.entries.delete(href(url)))
  }
  keys(): Promise<Request[]> {
    return Promise.resolve([...this.entries.keys()].map((k) => new Request(k)))
  }
  seed(url: string, body: Uint8Array): void {
    this.entries.set(href(url), { body, type: 'application/octet-stream' })
  }
}

class FakeCaches {
  readonly stores = new Map<string, FakeCache>()
  failOpen = false
  opened: string[] = []
  open(name: string): Promise<FakeCache> {
    if (this.failOpen) return Promise.reject(new DOMException('blocked', 'SecurityError'))
    this.opened.push(name)
    let c = this.stores.get(name)
    if (!c) {
      c = new FakeCache()
      this.stores.set(name, c)
    }
    return Promise.resolve(c)
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.delete(name))
  }
  ai(): FakeCache {
    let c = this.stores.get(AI_CACHE)
    if (!c) {
      c = new FakeCache()
      this.stores.set(AI_CACHE, c)
    }
    return c
  }
}

interface Gate {
  readonly reached: Promise<void>
  release(): void
}

interface Served {
  status?: number
  body?: Uint8Array
  chunk?: number
  /** Pause before the chunk with this index until released. */
  gateAt?: number
  /** Error the stream before the chunk with this index. */
  failAt?: number
  reject?: Error
  ignoreAbort?: boolean
}

function fakeFetch(serve: (url: string) => Served = () => ({})) {
  const gates: Gate[] = []
  const cancelled: string[] = []
  const fn = vi.fn<typeof fetch>((input, init) => {
    const url = urlOf(input)
    const s = serve(url)
    if (s.reject) return Promise.reject(s.reject)
    const body = s.body ?? bodyAt(url) ?? new Uint8Array(0)
    const chunk = s.chunk ?? 400
    const signal = init?.signal ?? undefined
    let release!: () => void
    let reach!: () => void
    const reached = new Promise<void>((r) => (reach = r))
    const released = new Promise<void>((r) => (release = r))
    if (s.gateAt !== undefined) gates.push({ reached, release })
    let offset = 0
    let index = 0
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled.push(url)
      },
      start(controller) {
        if (s.ignoreAbort) return
        signal?.addEventListener('abort', () => {
          try {
            controller.error(signal.reason)
          } catch {
            /* closed */
          }
        })
      },
      async pull(controller) {
        if (index === s.gateAt) {
          reach()
          await released
        }
        if (signal?.aborted && !s.ignoreAbort) return
        if (index === s.failAt) {
          controller.error(new TypeError('network error'))
          return
        }
        if (offset >= body.length) {
          controller.close()
          return
        }
        controller.enqueue(body.slice(offset, offset + chunk))
        offset += chunk
        index++
      },
    })
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    return Promise.resolve(new Response(stream, { status: s.status ?? 200 }))
  })
  return { fn, gates, cancelled }
}

function setup(opts: { caches?: FakeCaches | null; serve?: (url: string) => Served } = {}) {
  const given = opts.caches === undefined ? new FakeCaches() : opts.caches
  const storage = given ?? new FakeCaches()
  const net = fakeFetch(opts.serve)
  const deps: AiLoaderDeps = {
    assets: ASSETS,
    caches: () => (given ?? undefined) as CacheStorage | undefined,
    fetch: net.fn,
  }
  const gate = async (i: number): Promise<Gate> => {
    await vi.waitFor(() => {
      expect(net.gates[i]).toBeDefined()
    })
    const g = must(net.gates[i])
    await g.reached
    return g
  }
  return { loader: createAiLoader(deps), storage, fetch: net.fn, gate, cancelled: net.cancelled }
}

function bytesEqual(buf: ArrayBuffer, body: Uint8Array): void {
  expect(Buffer.from(new Uint8Array(buf)).equals(Buffer.from(body))).toBe(true)
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadAiAsset', () => {
  it('a cached asset is returned without a fetch', async () => {
    const { loader, storage, fetch } = setup()
    storage.ai().seed(ASSETS.face.url, BODIES.face)
    const progress = vi.fn()
    bytesEqual(await loader.loadAiAsset(ASSETS.face, progress), BODIES.face)
    expect(fetch).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
  })

  it('a missing asset is fetched once with GET, no body, no query, no credentials, and the URL from the manifest', async () => {
    const { loader, storage, fetch } = setup()
    bytesEqual(await loader.loadAiAsset(ASSETS.pose), BODIES.pose)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = must(fetch.mock.calls[0])
    expect(url).toBe(ASSETS.pose.url)
    expect(urlOf(url)).not.toContain('?')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    expect(init?.credentials).toBe('omit')
    expect(init?.redirect).toBe('error')
    expect(init?.headers).toBeUndefined()
    expect(init?.mode).toBeUndefined()
    expect(Object.keys(init ?? {}).sort()).toEqual(['credentials', 'method', 'redirect', 'signal'])
    const stored = must(storage.ai().entries.get(href(ASSETS.pose.url)))
    expect(stored.type).toBe('application/octet-stream')
    expect(Buffer.from(stored.body).equals(Buffer.from(BODIES.pose))).toBe(true)
    bytesEqual(await loader.loadAiAsset(ASSETS.pose), BODIES.pose)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports progress as bytes arrive, ending at the manifest size', async () => {
    const { loader } = setup({ serve: () => ({ chunk: 4_000 }) })
    const seen: Progress[] = []
    await loader.loadAiAsset(ASSETS.runtimeWasm, (p) => seen.push(p))
    expect(seen.map((p) => p.loaded)).toEqual([4_000, 8_000, 10_000])
    expect(seen.every((p) => p.total === ASSETS.runtimeWasm.bytes)).toBe(true)
  })

  it('per-asset progress of one model sums to bytesToDownload, cached assets adding nothing', async () => {
    const { loader, storage } = setup({ serve: () => ({ chunk: 700 }) })
    storage.ai().seed(ASSETS.runtimeLoader.url, BODIES.runtimeLoader)
    const total = await loader.bytesToDownload('face')
    expect(total).toBe(ASSETS.runtimeWasm.bytes + ASSETS.face.bytes)
    const assets = [ASSETS.runtimeLoader, ASSETS.runtimeWasm, ASSETS.face]
    const last = assets.map(() => 0)
    const sums: number[] = []
    await Promise.all(
      assets.map((a, i) =>
        loader.loadAiAsset(a, (p) => {
          last[i] = p.loaded
          sums.push(last.reduce((x, y) => x + y, 0))
        }),
      ),
    )
    expect(last[0]).toBe(0)
    expect(sums.at(-1)).toBe(total)
    expect(Math.max(...sums)).toBe(total)
    expect(sums).toEqual([...sums].sort((a, b) => a - b))
  })

  it('a wrong SHA-256 rejects with AiIntegrityError and stores nothing', async () => {
    const tampered = BODIES.face.slice()
    tampered[17] = (tampered[17] ?? 0) ^ 1
    const { loader, storage } = setup({ serve: () => ({ body: tampered }) })
    await expect(loader.loadAiAsset(ASSETS.face)).rejects.toMatchObject({
      name: 'AiIntegrityError',
    })
    expect(storage.ai().entries.size).toBe(0)
    expect(await loader.isCached('face')).toBe(false)
  })

  it('a short or long body rejects with AiIntegrityError and stores nothing', async () => {
    for (const body of [BODIES.face.slice(0, 2_999), new Uint8Array([...BODIES.face, 0])]) {
      const { loader, storage } = setup({ serve: () => ({ body }) })
      await expect(loader.loadAiAsset(ASSETS.face)).rejects.toMatchObject({
        name: 'AiIntegrityError',
      })
      expect(storage.ai().entries.size).toBe(0)
    }
  })

  it('a network failure or non-200 rejects with AiDownloadError and stores nothing', async () => {
    const cases: Served[] = [
      { reject: new TypeError('Failed to fetch') },
      { status: 404 },
      { status: 500 },
      { status: 206 },
      { failAt: 2 },
    ]
    for (const served of cases) {
      const { loader, storage } = setup({ serve: () => served })
      await expect(loader.loadAiAsset(ASSETS.face)).rejects.toMatchObject({
        name: 'AiDownloadError',
      })
      expect(storage.ai().puts).toEqual([])
    }
  })

  it('aborting stops the download and stores nothing', async () => {
    const { loader, storage, fetch, gate } = setup({ serve: () => ({ gateAt: 3 }) })
    const controller = new AbortController()
    const seen: number[] = []
    const load = loader.loadAiAsset(ASSETS.face, (p) => seen.push(p.loaded), controller.signal)
    const g = await gate(0)
    controller.abort()
    g.release()
    await expect(load).rejects.toMatchObject({ name: 'AbortError' })
    const init = must(fetch.mock.calls[0])[1]
    expect(init?.signal?.aborted).toBe(true)
    await flush()
    expect(seen).toEqual([400, 800, 1_200])
    expect(storage.ai().entries.size).toBe(0)
    expect(await loader.bytesToDownload('face')).toBe(
      ASSETS.runtimeLoader.bytes + ASSETS.runtimeWasm.bytes + ASSETS.face.bytes,
    )
  })

  it('aborting stops reading a body that keeps arriving, and stores nothing', async () => {
    const { loader, storage, gate, cancelled } = setup({
      serve: () => ({ gateAt: 1, ignoreAbort: true }),
    })
    const controller = new AbortController()
    const load = loader.loadAiAsset(ASSETS.face, undefined, controller.signal)
    const g = await gate(0)
    controller.abort()
    g.release()
    await expect(load).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(cancelled).toEqual([ASSETS.face.url])
    expect(storage.ai().puts).toEqual([])
  })

  it('an already aborted signal rejects with its reason, without a fetch', async () => {
    const { loader, fetch } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(
      loader.loadAiAsset(ASSETS.face, undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    const reason = new Error('panel closed')
    const custom = new AbortController()
    custom.abort(reason)
    await expect(loader.loadAiAsset(ASSETS.face, undefined, custom.signal)).rejects.toBe(reason)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborting while a cached entry is checked makes no request', async () => {
    const { loader, storage, fetch } = setup()
    const tampered = BODIES.face.slice()
    tampered[0] = (tampered[0] ?? 0) ^ 1
    storage.ai().seed(ASSETS.face.url, tampered)
    const controller = new AbortController()
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce((alg, data) => {
      controller.abort()
      return digest(alg, data)
    })
    try {
      await expect(
        loader.loadAiAsset(ASSETS.face, undefined, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' })
      await flush()
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('a settled load lets go of the caller signal and progress callback', async () => {
    const { loader } = setup()
    const controller = new AbortController()
    const removed = vi.spyOn(controller.signal, 'removeEventListener')
    const progress = vi.fn()
    await loader.loadAiAsset(ASSETS.face, progress, controller.signal)
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
    const calls = progress.mock.calls.length
    controller.abort()
    await loader.loadAiAsset(ASSETS.pose)
    expect(progress).toHaveBeenCalledTimes(calls)
  })

  it('two calls for the same asset share one download', async () => {
    const { loader, fetch } = setup({ serve: () => ({ chunk: 1_000 }) })
    const a: number[] = []
    const b: number[] = []
    const [x, y] = await Promise.all([
      loader.loadAiAsset(ASSETS.face, (p) => a.push(p.loaded)),
      loader.loadAiAsset(ASSETS.face, (p) => b.push(p.loaded)),
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    bytesEqual(x, BODIES.face)
    bytesEqual(y, BODIES.face)
    expect(a).toEqual([1_000, 2_000, 3_000])
    expect(b).toEqual([1_000, 2_000, 3_000])
  })

  it('one caller aborting a shared download leaves the other running; both aborting stops it', async () => {
    const { loader, fetch, gate, storage } = setup({ serve: () => ({ gateAt: 1 }) })
    const first = new AbortController()
    const p1 = loader.loadAiAsset(ASSETS.face, undefined, first.signal)
    const p2 = loader.loadAiAsset(ASSETS.face)
    const g0 = await gate(0)
    first.abort()
    g0.release()
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' })
    bytesEqual(await p2, BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(must(fetch.mock.calls[0])[1]?.signal?.aborted).toBe(false)

    const c3 = new AbortController()
    const c4 = new AbortController()
    const p3 = loader.loadAiAsset(ASSETS.pose, undefined, c3.signal)
    const p4 = loader.loadAiAsset(ASSETS.pose, undefined, c4.signal)
    const g1 = await gate(1)
    c3.abort()
    expect(must(fetch.mock.calls[1])[1]?.signal?.aborted).toBe(false)
    c4.abort()
    expect(must(fetch.mock.calls[1])[1]?.signal?.aborted).toBe(true)
    g1.release()
    await expect(p3).rejects.toMatchObject({ name: 'AbortError' })
    await expect(p4).rejects.toMatchObject({ name: 'AbortError' })
    expect(storage.ai().entries.has(href(ASSETS.pose.url))).toBe(false)
  })

  it('a call after a failure downloads again', async () => {
    let calls = 0
    const { loader, fetch, storage } = setup({
      serve: () => (calls++ === 0 ? { status: 503 } : {}),
    })
    await expect(loader.loadAiAsset(ASSETS.face)).rejects.toMatchObject({ name: 'AiDownloadError' })
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(storage.ai().entries.has(href(ASSETS.face.url))).toBe(true)
  })

  it('a call after an abort downloads again', async () => {
    let calls = 0
    const { loader, fetch, gate } = setup({
      serve: () => (calls++ === 0 ? { gateAt: 1 } : {}),
    })
    const controller = new AbortController()
    const first = loader.loadAiAsset(ASSETS.face, undefined, controller.signal)
    const g = await gate(0)
    controller.abort()
    const second = loader.loadAiAsset(ASSETS.face)
    g.release()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    bytesEqual(await second, BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a cache evicted between isCached and the load is downloaded again', async () => {
    const { loader, storage, fetch } = setup()
    for (const k of ['runtimeLoader', 'runtimeWasm', 'face'] as const)
      storage.ai().seed(ASSETS[k].url, BODIES[k])
    expect(await loader.isCached('face')).toBe(true)
    await storage.delete(AI_CACHE)
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(storage.ai().entries.has(href(ASSETS.face.url))).toBe(true)
  })

  it('a cached entry whose bytes no longer match the manifest is replaced by a download', async () => {
    const { loader, storage, fetch } = setup()
    storage.ai().seed(ASSETS.face.url, BODIES.pose)
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
    const stored = must(storage.ai().entries.get(href(ASSETS.face.url)))
    expect(Buffer.from(stored.body).equals(Buffer.from(BODIES.face))).toBe(true)
  })

  it('an unreadable cached entry is deleted and downloaded again', async () => {
    for (const broken of ['match', 'body'] as const) {
      const { loader, storage, fetch } = setup()
      storage.ai().seed(ASSETS.face.url, BODIES.face)
      storage.ai().unreadable.set(href(ASSETS.face.url), broken)
      bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(storage.ai().unreadable.size).toBe(0)
      bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('aborting while the download is hashed stores nothing', async () => {
    const { loader, storage } = setup()
    const controller = new AbortController()
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce((alg, data) => {
      controller.abort()
      return digest(alg, data)
    })
    try {
      await expect(
        loader.loadAiAsset(ASSETS.face, undefined, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' })
      await flush()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(storage.ai().puts).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })

  it('callers sharing one progress callback keep it when one of them aborts', async () => {
    const { loader, gate } = setup({ serve: () => ({ gateAt: 1, chunk: 1_000 }) })
    const seen: number[] = []
    const report = (p: Progress) => seen.push(p.loaded)
    const first = new AbortController()
    const p1 = loader.loadAiAsset(ASSETS.face, report, first.signal)
    const p2 = loader.loadAiAsset(ASSETS.face, report)
    const g = await gate(0)
    first.abort()
    g.release()
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' })
    bytesEqual(await p2, BODIES.face)
    expect(seen).toEqual([1_000, 1_000, 2_000, 3_000])
  })

  it('a failed store still resolves, and the bytes stay in memory for the session', async () => {
    const storage = new FakeCaches()
    storage.ai().failPut = true
    const { loader, fetch } = setup({ caches: storage })
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('loadAiAsset without the network (every load but a click, Q10)', () => {
  const CACHE_ONLY = { network: false } as const
  const notCached = { name: 'AiNotCachedError' }

  it('a cached asset is read and verified without a fetch', async () => {
    const { loader, storage, fetch } = setup()
    storage.ai().seed(ASSETS.face.url, BODIES.face)
    bytesEqual(await loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY), BODIES.face)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a corrupt cached entry rejects with AiNotCachedError, is deleted, and nothing is fetched', async () => {
    const { loader, storage, fetch } = setup()
    for (const k of ['runtimeLoader', 'runtimeWasm', 'face'] as const)
      storage.ai().seed(ASSETS[k].url, BODIES[k])
    const flipped = BODIES.face.slice()
    flipped[100] = (flipped[100] ?? 0) ^ 0xff
    storage.ai().seed(ASSETS.face.url, flipped)
    expect(await loader.bytesToDownload('face')).toBe(0)
    await expect(
      loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY),
    ).rejects.toMatchObject(notCached)
    expect(fetch).not.toHaveBeenCalled()
    expect(storage.ai().entries.has(href(ASSETS.face.url))).toBe(false)
    expect(await loader.bytesToDownload('face')).toBe(ASSETS.face.bytes)
    expect(await loader.isCached('face')).toBe(false)
  })

  it('an unreadable cached entry rejects with AiNotCachedError, is deleted, and nothing is fetched', async () => {
    for (const broken of ['match', 'body'] as const) {
      const { loader, storage, fetch } = setup()
      storage.ai().seed(ASSETS.face.url, BODIES.face)
      storage.ai().unreadable.set(href(ASSETS.face.url), broken)
      await expect(
        loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY),
      ).rejects.toMatchObject(notCached)
      expect(fetch).not.toHaveBeenCalled()
      expect(storage.ai().entries.has(href(ASSETS.face.url))).toBe(false)
    }
  })

  it('an evicted or never cached asset rejects with AiNotCachedError without a fetch', async () => {
    for (const caches of [new FakeCaches(), null]) {
      const { loader, fetch } = setup({ caches })
      await expect(
        loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY),
      ).rejects.toMatchObject(notCached)
      expect(fetch).not.toHaveBeenCalled()
    }
  })

  it('without Cache Storage, the copy kept in memory after a click is returned (C3 fallback)', async () => {
    const { loader, fetch } = setup({ caches: null })
    bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
    bytesEqual(await loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY), BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('an already aborted signal rejects with its reason', async () => {
    const { loader, storage } = setup()
    storage.ai().seed(ASSETS.face.url, BODIES.face)
    const controller = new AbortController()
    controller.abort()
    await expect(
      loader.loadAiAsset(ASSETS.face, undefined, controller.signal, CACHE_ONLY),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('an abort while the cache is read rejects with its reason', async () => {
    const { loader, storage } = setup()
    storage.ai().seed(ASSETS.face.url, BODIES.face)
    const controller = new AbortController()
    const read = loader.loadAiAsset(ASSETS.face, undefined, controller.signal, CACHE_ONLY)
    controller.abort()
    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('never joins or fails a download a click started for the same asset', async () => {
    const { loader, fetch, gate } = setup({ serve: () => ({ gateAt: 1, chunk: 1_000 }) })
    const clicked = loader.loadAiAsset(ASSETS.face)
    const g = await gate(0)
    await expect(
      loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY),
    ).rejects.toMatchObject(notCached)
    g.release()
    bytesEqual(await clicked, BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a click while a cache-only read is under way still downloads', async () => {
    const { loader, fetch } = setup()
    const quiet = loader.loadAiAsset(ASSETS.face, undefined, undefined, CACHE_ONLY)
    const clicked = loader.loadAiAsset(ASSETS.face)
    await expect(quiet).rejects.toMatchObject(notCached)
    bytesEqual(await clicked, BODIES.face)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('only same-origin manifest assets, never photo data', () => {
  it('refuses an asset that is not in the manifest, without a fetch', async () => {
    const { loader, fetch } = setup()
    const forged: AiAsset[] = [
      { ...ASSETS.face, url: '/models/face_landmarker-float16-1.task?img=abc' },
      { ...ASSETS.face, url: '/upload/photo.jpg' },
      { ...ASSETS.face, sha256: sha256(BODIES.pose) },
      { ...ASSETS.face, bytes: 1 },
    ]
    for (const asset of forged)
      await expect(loader.loadAiAsset(asset)).rejects.toMatchObject({ name: 'AiDownloadError' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a manifest entry that is not a same-origin path without a query', async () => {
    for (const url of [
      'https://cdn.example.com/face.task',
      '//cdn.example.com/face.task',
      'models/face.task',
      '/models/face.task?v=1',
      '/models/face.task#x',
      '/\\cdn.example.com/face.task',
      '/\t/cdn.example.com/face.task',
      '/models/face task',
    ]) {
      const storage = new FakeCaches()
      const net = fakeFetch()
      const assets = { ...ASSETS, face: { ...ASSETS.face, url } }
      const loader = createAiLoader({
        assets,
        caches: () => storage as unknown as CacheStorage,
        fetch: net.fn,
      })
      await expect(loader.loadAiAsset(assets.face)).rejects.toMatchObject({
        name: 'AiDownloadError',
      })
      expect(net.fn).not.toHaveBeenCalled()
    }
  })

  it('imports nothing at runtime but the manifest', () => {
    const source = readFileSync(join(import.meta.dirname, 'loader.ts'), 'utf8')
    const imports = [...source.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+'([^']+)'/gm)]
    const runtime = imports.filter((m) => !m[1]).map((m) => m[2])
    expect(runtime).toEqual(['virtual:ai-assets'])
    expect(source).not.toMatch(/\bimport\(/)
  })
})

describe('isCached and bytesToDownload', () => {
  it('isCached is true only when the model and both runtime files are cached; it never fetches', async () => {
    const { loader, storage, fetch } = setup()
    expect(await loader.isCached('face')).toBe(false)
    storage.ai().seed(ASSETS.face.url, BODIES.face)
    storage.ai().seed(ASSETS.runtimeLoader.url, BODIES.runtimeLoader)
    expect(await loader.isCached('face')).toBe(false)
    storage.ai().seed(ASSETS.runtimeWasm.url, BODIES.runtimeWasm)
    expect(await loader.isCached('face')).toBe(true)
    expect(await loader.isCached('pose')).toBe(false)
    storage.ai().entries.delete(href(ASSETS.runtimeLoader.url))
    expect(await loader.isCached('face')).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bytesToDownload counts only what is not cached', async () => {
    const { loader, storage, fetch } = setup()
    const all = ASSETS.runtimeLoader.bytes + ASSETS.runtimeWasm.bytes
    expect(await loader.bytesToDownload('face')).toBe(all + ASSETS.face.bytes)
    expect(await loader.bytesToDownload('pose')).toBe(all + ASSETS.pose.bytes)
    storage.ai().seed(ASSETS.runtimeWasm.url, BODIES.runtimeWasm)
    expect(await loader.bytesToDownload('pose')).toBe(
      ASSETS.runtimeLoader.bytes + ASSETS.pose.bytes,
    )
    await loader.loadAiAsset(ASSETS.runtimeLoader)
    await loader.loadAiAsset(ASSETS.face)
    expect(await loader.bytesToDownload('face')).toBe(0)
    expect(await loader.bytesToDownload('pose')).toBe(ASSETS.pose.bytes)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('pruneAiCache', () => {
  it('deletes entries whose URL is not in the manifest, and only in artistica-ai-v1', async () => {
    const storage = new FakeCaches()
    const ai = storage.ai()
    ai.seed(ASSETS.face.url, BODIES.face)
    ai.seed('/models/face_landmarker-float16-0.task', BODIES.face)
    ai.seed('/assets/vision_wasm_module_internal-00000000.wasm', BODIES.runtimeWasm)
    ai.seed(`${ASSETS.pose.url}?old`, BODIES.pose)
    const shell = await storage.open('artistica-shell-abc')
    shell.seed('/models/face_landmarker-float16-0.task', BODIES.face)
    const { loader } = setup({ caches: storage })
    await loader.pruneAiCache()
    expect([...ai.entries.keys()]).toEqual([href(ASSETS.face.url)])
    expect(shell.entries.size).toBe(1)
    expect(storage.stores.size).toBe(2)
  })

  it('runs on first use of the cache', async () => {
    const storage = new FakeCaches()
    storage.ai().seed('/models/old.task', BODIES.face)
    const { loader } = setup({ caches: storage })
    expect(await loader.isCached('face')).toBe(false)
    expect(storage.ai().entries.size).toBe(0)
  })

  it('does nothing without Cache Storage', async () => {
    const { loader } = setup({ caches: null })
    await expect(loader.pruneAiCache()).resolves.toBeUndefined()
  })
})

describe('without Cache Storage (blocked site data)', () => {
  for (const [name, storage] of [
    ['no caches global', () => null],
    [
      'caches.open throws',
      () => {
        const s = new FakeCaches()
        s.failOpen = true
        return s
      },
    ],
  ] as const) {
    it(`${name}: assets are downloaded and kept in memory for the session; isCached is false`, async () => {
      const { loader, fetch } = setup({ caches: storage() })
      expect(await loader.isCached('face')).toBe(false)
      for (const k of ['runtimeLoader', 'runtimeWasm', 'face'] as const)
        bytesEqual(await loader.loadAiAsset(ASSETS[k]), BODIES[k])
      bytesEqual(await loader.loadAiAsset(ASSETS.face), BODIES.face)
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(await loader.isCached('face')).toBe(false)
      expect(await loader.bytesToDownload('face')).toBe(0)
      expect(await loader.bytesToDownload('pose')).toBe(ASSETS.pose.bytes)
    })
  }
})

describe('the default loader', () => {
  it('uses the manifest, the global caches and the artistica-ai-v1 cache', async () => {
    expect(AI_CACHE).toBe('artistica-ai-v1')
    const storage = new FakeCaches()
    const net = fakeFetch()
    vi.stubGlobal('caches', storage)
    vi.stubGlobal('fetch', net.fn)
    expect(await isCached('pose')).toBe(false)
    expect(await bytesToDownload('pose')).toBe(
      AI_ASSETS.runtimeLoader.bytes + AI_ASSETS.runtimeWasm.bytes + AI_ASSETS.pose.bytes,
    )
    expect(storage.opened.every((n) => n === AI_CACHE)).toBe(true)
    expect(storage.opened.length).toBeGreaterThan(0)
    await expect(loadAiAsset({ ...AI_ASSETS.face, url: '/x.task' })).rejects.toMatchObject({
      name: 'AiDownloadError',
    })
    expect(net.fn).not.toHaveBeenCalled()
  })
})
