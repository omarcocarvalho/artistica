import { AI_ASSETS, type AiAsset, type AiAssets } from 'virtual:ai-assets'
import type { AiLoader, Progress } from './schedule'
import type { AiModel } from './store'

export const AI_CACHE = 'artistica-ai-v1'

export class AiDownloadError extends Error {
  override readonly name = 'AiDownloadError'
}

export class AiIntegrityError extends Error {
  override readonly name = 'AiIntegrityError'
}

export interface AiLoaderDeps {
  readonly assets: AiAssets
  readonly caches: () => CacheStorage | undefined
  readonly fetch: typeof fetch
}

export interface AiAssetLoader extends AiLoader {
  pruneAiCache(): Promise<void>
}

interface Download {
  readonly bytes: Promise<ArrayBuffer>
  readonly controller: AbortController
  readonly listeners: Set<(p: Progress) => void>
  waiters: number
}

const isSameOriginPath = (url: string) => /^\/(?!\/)[\w.~/-]*$/.test(url)

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function matches(asset: AiAsset, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return bytes.length === asset.bytes && (await sha256Hex(bytes)) === asset.sha256
}

export function createAiLoader(deps: AiLoaderDeps): AiAssetLoader {
  const { runtimeLoader, runtimeWasm, face, pose } = deps.assets
  const manifest: readonly AiAsset[] = [runtimeLoader, runtimeWasm, face, pose]
  const memory = new Map<string, ArrayBuffer>()
  const downloads = new Map<string, Download>()
  let firstPrune: Promise<void> | undefined

  const isManifestAsset = (asset: AiAsset) =>
    isSameOriginPath(asset.url) &&
    manifest.some(
      (m) => m.url === asset.url && m.bytes === asset.bytes && m.sha256 === asset.sha256,
    )

  const modelAssets = (model: AiModel) => [runtimeLoader, runtimeWasm, deps.assets[model]]

  async function rawCache(): Promise<Cache | null> {
    const storage = deps.caches()
    if (!storage) return null
    try {
      return await storage.open(AI_CACHE)
    } catch {
      return null
    }
  }

  async function prune(cache: Cache): Promise<void> {
    for (const request of await cache.keys()) {
      const known = manifest.some((m) => new URL(m.url, request.url).href === request.url)
      if (!known) await cache.delete(request)
    }
  }

  async function openCache(): Promise<Cache | null> {
    const cache = await rawCache()
    if (cache) {
      firstPrune ??= prune(cache).catch(() => undefined)
      await firstPrune
    }
    return cache
  }

  async function readCached(asset: AiAsset): Promise<ArrayBuffer | null> {
    const kept = memory.get(asset.url)
    if (kept) return kept
    const cache = await openCache()
    if (!cache) return null
    const bytes = await cache
      .match(asset.url)
      .then(async (r) => (r ? new Uint8Array(await r.arrayBuffer()) : undefined))
      .catch(() => null)
    if (bytes === undefined) return null
    if (bytes && (await matches(asset, bytes))) return bytes.buffer
    await cache.delete(asset.url).catch(() => false)
    return null
  }

  async function store(asset: AiAsset, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const cache = await openCache()
    const response = new Response(bytes, {
      headers: { 'content-type': 'application/octet-stream' },
    })
    const stored = cache
      ? await cache.put(asset.url, response).then(
          () => true,
          () => false,
        )
      : false
    if (!stored) memory.set(asset.url, bytes.buffer)
  }

  async function fetchVerified(
    asset: AiAsset,
    signal: AbortSignal,
    report: (p: Progress) => void,
  ): Promise<ArrayBuffer> {
    let response: Response
    try {
      response = await deps.fetch(asset.url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        signal,
      })
    } catch (error) {
      if (signal.aborted) throw abortReason(signal)
      throw new AiDownloadError(`Download failed: ${asset.url}`, { cause: error })
    }
    if (response.status !== 200 || !response.body) {
      throw new AiDownloadError(`Download failed (${String(response.status)}): ${asset.url}`)
    }
    const bytes = new Uint8Array(asset.bytes)
    let loaded = 0
    const reader = response.body.getReader()
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (error) {
          if (signal.aborted) throw abortReason(signal)
          throw new AiDownloadError(`Download failed: ${asset.url}`, { cause: error })
        }
        if (signal.aborted) throw abortReason(signal)
        if (chunk.done) break
        if (loaded + chunk.value.length > asset.bytes) {
          throw new AiIntegrityError(`Larger than expected: ${asset.url}`)
        }
        bytes.set(chunk.value, loaded)
        loaded += chunk.value.length
        report({ loaded, total: asset.bytes })
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined)
      throw error
    }
    if (!(await matches(asset, bytes))) {
      throw new AiIntegrityError(`Checksum mismatch: ${asset.url}`)
    }
    throwIfAborted(signal)
    await store(asset, bytes)
    return bytes.buffer
  }

  function start(asset: AiAsset): Download {
    const hub: Omit<Download, 'bytes'> = {
      controller: new AbortController(),
      listeners: new Set(),
      waiters: 0,
    }
    const { signal } = hub.controller
    const bytes = (async () => {
      const cached = await readCached(asset)
      if (cached) return cached
      if (signal.aborted) throw abortReason(signal)
      return fetchVerified(asset, signal, (p) => {
        for (const listener of hub.listeners) listener(p)
      })
    })()
    const download: Download = Object.assign(hub, { bytes })
    const forget = () => {
      if (downloads.get(asset.url) === download) downloads.delete(asset.url)
    }
    bytes.then(forget, forget)
    return download
  }

  function join(
    asset: AiAsset,
    shared: Download,
    onProgress: ((p: Progress) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<ArrayBuffer> {
    shared.waiters++
    const listener =
      onProgress &&
      ((p: Progress) => {
        onProgress(p)
      })
    if (listener) shared.listeners.add(listener)
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const leave = () => {
        if (listener) shared.listeners.delete(listener)
        signal?.removeEventListener('abort', onAbort)
      }
      function onAbort(this: AbortSignal) {
        leave()
        shared.waiters--
        if (shared.waiters === 0) {
          if (downloads.get(asset.url) === shared) downloads.delete(asset.url)
          shared.controller.abort(abortReason(this))
        }
        reject(abortReason(this))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      shared.bytes.finally(leave).then(resolve, reject)
    })
  }

  function loadAiAsset(
    asset: AiAsset,
    onProgress?: (p: Progress) => void,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!isManifestAsset(asset)) {
      return Promise.reject(new AiDownloadError(`Not an AI asset: ${asset.url}`))
    }
    if (signal?.aborted) return Promise.reject(abortReason(signal))
    let shared = downloads.get(asset.url)
    if (!shared) {
      shared = start(asset)
      downloads.set(asset.url, shared)
    }
    return join(asset, shared, onProgress, signal)
  }

  async function isCached(model: AiModel): Promise<boolean> {
    const cache = await openCache()
    if (!cache) return false
    const hits = await Promise.all(modelAssets(model).map((a) => cache.match(a.url)))
    return hits.every((r) => r !== undefined)
  }

  async function bytesToDownload(model: AiModel): Promise<number> {
    const cache = await openCache()
    let total = 0
    for (const asset of modelAssets(model)) {
      if (memory.has(asset.url)) continue
      if (cache && (await cache.match(asset.url))) continue
      total += asset.bytes
    }
    return total
  }

  async function pruneAiCache(): Promise<void> {
    const cache = await rawCache()
    if (cache) await prune(cache)
  }

  return { loadAiAsset, isCached, bytesToDownload, pruneAiCache }
}

const defaultLoader = createAiLoader({
  assets: AI_ASSETS,
  caches: () => ('caches' in globalThis ? globalThis.caches : undefined),
  fetch: (input, init) => globalThis.fetch(input, init),
})

export function loadAiAsset(
  asset: AiAsset,
  onProgress?: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return defaultLoader.loadAiAsset(asset, onProgress, signal)
}

export function isCached(model: AiModel): Promise<boolean> {
  return defaultLoader.isCached(model)
}

export function bytesToDownload(model: AiModel): Promise<number> {
  return defaultLoader.bytesToDownload(model)
}

export function pruneAiCache(): Promise<void> {
  return defaultLoader.pruneAiCache()
}

export const AI_LOADER: AiLoader = { loadAiAsset, isCached, bytesToDownload }
