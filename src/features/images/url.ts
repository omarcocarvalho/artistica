import { ImportFailure } from './errors'
import { FETCH_TIMEOUT_MS, MAX_FILE_BYTES, PROBE_TIMEOUT_MS } from './limits'
import { sniffImage, type SniffedKind } from './sniff'

export interface FetchDeps {
  readonly fetch: typeof fetch
  isOnline(): boolean
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

async function probeReachable(href: string, f: typeof fetch): Promise<'reachable' | 'unreachable'> {
  try {
    await f(href, {
      method: 'HEAD',
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return 'reachable'
  } catch {
    return 'unreachable'
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

  let res: Response
  try {
    res = await deps.fetch(url.href, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (cause) {
    const timedOut =
      cause instanceof DOMException &&
      (cause.name === 'TimeoutError' || cause.name === 'AbortError')
    const online = deps.isOnline()
    const probe = timedOut || !online ? 'skipped' : await probeReachable(url.href, deps.fetch)
    throw new ImportFailure(classifyFetchFailure({ online, probe }), { cause })
  }

  if (res.type === 'opaque' || res.type === 'opaqueredirect') throw new ImportFailure('cors')
  if (!res.ok) throw new ImportFailure('network')
  if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE_BYTES)
    throw new ImportFailure('too-large')

  let blob: Blob
  try {
    blob = await res.blob()
  } catch (cause) {
    throw new ImportFailure('network', { cause })
  }
  if (blob.size > MAX_FILE_BYTES) throw new ImportFailure('too-large')
  const sniffed = sniffImage(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))
  if (sniffed === null) throw new ImportFailure('not-an-image')
  return { blob, name: nameFromUrl(url, sniffed.kind) }
}
