import { ImportFailure } from './errors'
import { FETCH_TIMEOUT_MS, MAX_FILE_BYTES, PROBE_TIMEOUT_MS } from './limits'
import { sniffImage, type SniffedKind } from './sniff'

export interface FetchDeps {
  readonly fetch: typeof fetch
  isOnline(): boolean
  /** Download limit; defaults to MAX_FILE_BYTES. Injectable for tests. */
  readonly maxBytes?: number
  /** Aborting it stops the download, which then fails as `network`. */
  readonly signal?: AbortSignal
}

/** Rejects with the signal's reason as soon as it aborts, even if `p` never settles. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason as Error)
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

/** An abort signal that fires when `outer` aborts or when `kick()` is not called for `ms`. */
function stallGuard(ms: number, outer: AbortSignal | undefined) {
  const ctl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = (): void => {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
  function onOuterAbort(): void {
    stop()
    ctl.abort(outer?.reason)
  }
  const kick = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stop()
      ctl.abort(new DOMException('No progress', 'TimeoutError'))
    }, ms)
  }
  if (outer?.aborted) ctl.abort(outer.reason)
  else {
    outer?.addEventListener('abort', onOuterAbort, { once: true })
    kick()
  }
  return { signal: ctl.signal, kick, stop }
}

/** Accepts `https://...`, `http://...` and bare hosts like `example.com/a.jpg` (which get https). */
export function parseUserUrl(input: string): URL | null {
  const text = input.trim()
  if (text === '' || /\s/.test(text)) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : /^[^/:]+\.[^/:]+/.test(text)
      ? `https://${text}`
      : null
  if (candidate === null) return null
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/**
 * `fetch` rejects with the same opaque TypeError for CORS and for network errors. If a no-cors
 * request to the same URL gets any answer, the host is reachable and the failure was CORS.
 */
export function classifyFetchFailure(i: {
  online: boolean
  probe: 'reachable' | 'unreachable' | 'skipped'
}): 'cors' | 'network' {
  return i.online && i.probe === 'reachable' ? 'cors' : 'network'
}

export function anySignal(signals: AbortSignal[]): {
  signal: AbortSignal
  dispose: () => void
} {
  if (typeof AbortSignal.any === 'function')
    return { signal: AbortSignal.any(signals), dispose: () => undefined }
  const ctl = new AbortController()
  const dispose = (): void => {
    for (const s of signals) s.removeEventListener('abort', onAbort)
  }
  function onAbort(this: AbortSignal): void {
    dispose()
    ctl.abort(this.reason)
  }
  const first = signals.find((s) => s.aborted)
  if (first) ctl.abort(first.reason)
  else for (const s of signals) s.addEventListener('abort', onAbort, { once: true })
  return { signal: ctl.signal, dispose }
}

function timeoutSignal(ms: number): { signal: AbortSignal; dispose: () => void } {
  const ctl = new AbortController()
  const timer = setTimeout(() => {
    ctl.abort(new DOMException('Probe timed out', 'TimeoutError'))
  }, ms)
  return {
    signal: ctl.signal,
    dispose: () => {
      clearTimeout(timer)
    },
  }
}

async function probeReachable(
  href: string,
  f: typeof fetch,
  outer: AbortSignal | undefined,
): Promise<'reachable' | 'unreachable'> {
  const timeout = timeoutSignal(PROBE_TIMEOUT_MS)
  const combined = outer ? anySignal([outer, timeout.signal]) : timeout
  const { signal } = combined
  try {
    await untilAborted(
      f(href, {
        method: 'HEAD',
        mode: 'no-cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal,
      }),
      signal,
    )
    return 'reachable'
  } catch {
    return 'unreachable'
  } finally {
    combined.dispose()
    timeout.dispose()
  }
}

const EXT: Record<SniffedKind, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  heic: 'heic',
}

export function nameFromUrl(url: URL, kind: SniffedKind): string {
  let last = url.pathname.split('/').filter(Boolean).pop() ?? ''
  try {
    last = decodeURIComponent(last)
  } catch {
    /* keep the raw segment */
  }
  const base = last === '' ? url.hostname : last
  return /\.[a-z0-9]{2,5}$/i.test(base) && last !== '' ? base : `${base}.${EXT[kind]}`
}

export async function fetchImageBlob(
  raw: string,
  deps: FetchDeps,
): Promise<{ blob: Blob; name: string }> {
  const url = parseUserUrl(raw)
  if (url === null) throw new ImportFailure('not-an-image')

  const guard = stallGuard(FETCH_TIMEOUT_MS, deps.signal)
  try {
    const { signal } = guard
    let res: Response
    try {
      if (signal.aborted) throw signal.reason
      res = await untilAborted(
        deps.fetch(url.href, {
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
          referrerPolicy: 'no-referrer',
          signal,
        }),
        signal,
      )
    } catch (cause) {
      const timedOut =
        cause instanceof DOMException &&
        (cause.name === 'TimeoutError' || cause.name === 'AbortError')
      const online = deps.isOnline()
      const probe =
        timedOut || !online ? 'skipped' : await probeReachable(url.href, deps.fetch, deps.signal)
      throw new ImportFailure(classifyFetchFailure({ online, probe }), { cause })
    }

    if (res.type === 'opaque' || res.type === 'opaqueredirect') throw new ImportFailure('cors')
    if (!res.ok) throw new ImportFailure('network')
    const max = deps.maxBytes ?? MAX_FILE_BYTES
    if (Number(res.headers.get('content-length') ?? 0) > max) throw new ImportFailure('too-large')

    let blob: Blob
    try {
      if (res.body === null) {
        blob = await untilAborted(res.blob(), signal)
        if (blob.size > max) throw new ImportFailure('too-large')
      } else {
        guard.kick()
        const reader = res.body.getReader()
        const chunks: Uint8Array<ArrayBuffer>[] = []
        let total = 0
        try {
          for (;;) {
            const { done, value } = await untilAborted(reader.read(), signal)
            if (done) break
            guard.kick()
            total += value.byteLength
            if (total > max) throw new ImportFailure('too-large')
            chunks.push(value)
          }
        } catch (e) {
          await reader.cancel().catch(() => undefined)
          throw e
        }
        blob = new Blob(chunks, { type: res.headers.get('content-type') ?? '' })
      }
    } catch (cause) {
      if (cause instanceof ImportFailure) throw cause
      throw new ImportFailure('network', { cause })
    }
    const sniffed = sniffImage(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))
    if (sniffed === null) throw new ImportFailure('not-an-image')
    return { blob, name: nameFromUrl(url, sniffed.kind) }
  } finally {
    guard.stop()
  }
}
