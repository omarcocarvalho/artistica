import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportFailure } from './errors'
import { FETCH_TIMEOUT_MS, MAX_FILE_BYTES, PROBE_TIMEOUT_MS } from './limits'
import { skeletonJpeg } from './test-bytes'
import {
  anySignal,
  classifyFetchFailure,
  fetchImageBlob,
  nameFromUrl,
  parseUserUrl,
  type FetchDeps,
} from './url'

const jpegResponse = (init?: ResponseInit) => new Response(skeletonJpeg(8, 8).slice(), init)

function deps(over: Partial<FetchDeps> & { fetch: typeof fetch }): FetchDeps {
  return { isOnline: () => true, ...over }
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    return e instanceof ImportFailure ? e.code : `other:${String(e)}`
  }
  return 'resolved'
}

describe('parseUserUrl', () => {
  it('accepts http(s) and adds https to bare hosts', () => {
    expect(parseUserUrl('https://a.com/x.jpg')?.href).toBe('https://a.com/x.jpg')
    expect(parseUserUrl('  example-gallery.com/photos/heron.jpg ')?.href).toBe(
      'https://example-gallery.com/photos/heron.jpg',
    )
    expect(parseUserUrl('example.com:8080/a.png')?.href).toBe('https://example.com:8080/a.png')
  })
  it('rejects other schemes, data URLs, words and spaces', () => {
    for (const s of [
      '',
      'hello',
      'hello world',
      'ftp://a.com/x.jpg',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      'file:///etc/passwd',
    ]) {
      expect(parseUserUrl(s), s).toBeNull()
    }
  })
})

describe('classifyFetchFailure', () => {
  it('is cors only when the host answered a no-cors probe', () => {
    expect(classifyFetchFailure({ online: true, probe: 'reachable' })).toBe('cors')
    expect(classifyFetchFailure({ online: true, probe: 'unreachable' })).toBe('network')
    expect(classifyFetchFailure({ online: false, probe: 'skipped' })).toBe('network')
    expect(classifyFetchFailure({ online: false, probe: 'reachable' })).toBe('network')
  })
})

describe('fetchImageBlob', () => {
  it('fetches with CORS, no credentials and no referrer, and names the file from the URL', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(jpegResponse())
    const out = await fetchImageBlob('example.com/a/My%20Heron', deps({ fetch: f }))
    expect(out.name).toBe('My Heron.jpg')
    expect(out.blob.size).toBeGreaterThan(0)
    const [url, init] = f.mock.calls[0] ?? []
    expect(url).toBe('https://example.com/a/My%20Heron')
    expect(init).toMatchObject({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it('CORS block: first fetch rejects, a no-cors HEAD to the same URL resolves -> cors', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null))
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('cors')
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1]?.[0]).toBe('https://x.com/a.jpg')
    expect(f.mock.calls[1]?.[1]).toMatchObject({ method: 'HEAD', mode: 'no-cors' })
  })

  it('unreachable host -> network', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('network')
  })

  it('offline -> network without a probe', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(
      await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, isOnline: () => false }))),
    ).toBe('network')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('timeouts are network, never cors', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('t', 'TimeoutError'))
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('network')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('an opaque response is cors', async () => {
    const opaque = { type: 'opaque', ok: false, status: 0 } as unknown as Response
    const f = vi.fn<typeof fetch>().mockResolvedValue(opaque)
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('cors')
  })

  it('HTTP errors are network', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 404 }))
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('network')
  })

  it('an HTML page behind an image URL is not-an-image', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
      )
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe(
      'not-an-image',
    )
  })

  it('trusts magic bytes over a wrong content-type', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jpegResponse({ headers: { 'content-type': 'application/octet-stream' } }))
    expect(await code(fetchImageBlob('https://x.com/photo', deps({ fetch: f })))).toBe('resolved')
  })

  it('refuses a declared size over the limit before downloading', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jpegResponse({ headers: { 'content-length': String(MAX_FILE_BYTES + 1) } }),
      )
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('too-large')
  })

  it('an invalid URL never reaches fetch', async () => {
    const f = vi.fn<typeof fetch>()
    expect(await code(fetchImageBlob('hello world', deps({ fetch: f })))).toBe('not-an-image')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('streaming size limit', () => {
  it('aborts and cancels a body without Content-Length once it exceeds the limit', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(40))
      },
      cancel,
    })
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    expect(
      await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, maxBytes: 100 }))),
    ).toBe('too-large')
    expect(cancel).toHaveBeenCalled()
  })
  it('accepts a streamed body within the limit', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(jpegResponse())
    expect(
      await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, maxBytes: 100_000 }))),
    ).toBe('resolved')
  })
})

describe('connection drops', () => {
  it('a body stream that errors mid-download is network', async () => {
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent) {
          c.error(new TypeError('network error'))
          return
        }
        sent = true
        c.enqueue(skeletonJpeg(8, 8).slice(0, 16))
      },
    })
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))).toBe('network')
  })
})

/** A fetch whose body yields `chunks` one by one, `gapMs` apart; aborting its signal errors it. */
function slowFetch(chunks: Uint8Array[], gapMs: number, headersAfterMs = 0) {
  return vi.fn<typeof fetch>((_input, init) => {
    const signal = init?.signal
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        reject(signal?.reason as Error)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        let i = 0
        const stream = new ReadableStream<Uint8Array>({
          pull: (c) =>
            new Promise<void>((done) => {
              setTimeout(() => {
                const next = chunks[i++]
                if (next === undefined) c.close()
                else c.enqueue(next)
                done()
              }, gapMs)
            }),
        })
        resolve(new Response(stream))
      }, headersAfterMs)
    })
  })
}

describe('stall timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  const jpegChunks = () => {
    const bytes = skeletonJpeg(8, 8)
    const size = Math.ceil(bytes.length / 6)
    return Array.from({ length: 6 }, (_, i) => bytes.slice(i * size, (i + 1) * size))
  }

  it('steady progress never times out, however long the whole download takes', async () => {
    vi.useFakeTimers()
    const f = slowFetch(jpegChunks(), FETCH_TIMEOUT_MS - 1_000)
    const result = code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * 8)
    expect(await result).toBe('resolved')
  })

  it('no headers for the timeout is network', async () => {
    vi.useFakeTimers()
    const f = slowFetch(jpegChunks(), 0, FETCH_TIMEOUT_MS * 10)
    const result = code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1)
    expect(f.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe('network')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a body that stops sending chunks for the timeout is network', async () => {
    vi.useFakeTimers()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(skeletonJpeg(8, 8).slice(0, 16))
      },
    })
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    const result = code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS)
    expect(await result).toBe('network')
  })

  it('aborting the caller signal stops the download', async () => {
    const caller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(skeletonJpeg(8, 8).slice(0, 16))
      },
    })
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    const result = code(
      fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, signal: caller.signal })),
    )
    await vi.waitFor(() => {
      expect(f).toHaveBeenCalled()
    })
    expect(f.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    caller.abort()
    expect(await result).toBe('network')
    expect(f.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('an already aborted caller signal never reaches the network', async () => {
    const f = vi.fn<typeof fetch>()
    const signal = AbortSignal.abort()
    expect(await code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, signal })))).toBe(
      'network',
    )
    expect(f).not.toHaveBeenCalled()
  })
})

const settledWithin = <T>(p: Promise<T>, ms: number): Promise<T | 'pending'> =>
  Promise.race([
    p,
    new Promise<'pending'>((r) =>
      setTimeout(() => {
        r('pending')
      }, ms),
    ),
  ])

/** First call fails like a CORS block; the no-cors probe after it never answers on its own. */
function corsThenHangingProbe() {
  return vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockImplementationOnce(() => new Promise<Response>(() => undefined))
}

function withoutAbortSignalAny(): () => void {
  const original = Object.getOwnPropertyDescriptor(AbortSignal, 'any')
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
  return () => {
    if (original) Object.defineProperty(AbortSignal, 'any', original)
  }
}

describe('the CORS probe', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  for (const variant of ['AbortSignal.any', 'the manual combiner'] as const) {
    describe(`with ${variant}`, () => {
      let restore = (): void => undefined
      afterEach(() => {
        restore()
        restore = () => undefined
      })

      it("aborting the import's signal stops a probe in flight at once", async () => {
        if (variant === 'the manual combiner') restore = withoutAbortSignalAny()
        const caller = new AbortController()
        const f = corsThenHangingProbe()
        const result = code(
          fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, signal: caller.signal })),
        )
        await vi.waitFor(() => {
          expect(f).toHaveBeenCalledTimes(2)
        })
        const probeSignal = f.mock.calls[1]?.[1]?.signal
        expect(probeSignal?.aborted).toBe(false)
        caller.abort()
        expect(probeSignal?.aborted).toBe(true)
        expect(await settledWithin(result, 50)).toBe('network')
      })

      it('a probe with no answer still gives up after PROBE_TIMEOUT_MS', async () => {
        if (variant === 'the manual combiner') restore = withoutAbortSignalAny()
        vi.useFakeTimers()
        const caller = new AbortController()
        const f = corsThenHangingProbe()
        const result = code(
          fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f, signal: caller.signal })),
        )
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1)
        const probeSignal = f.mock.calls[1]?.[1]?.signal
        expect(probeSignal?.aborted).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(probeSignal?.aborted).toBe(true)
        expect(await result).toBe('network')
        expect(caller.signal.aborted).toBe(false)
      })
    })
  }

  it('a probe without an import signal still gives up after PROBE_TIMEOUT_MS', async () => {
    vi.useFakeTimers()
    const f = corsThenHangingProbe()
    const result = code(fetchImageBlob('https://x.com/a.jpg', deps({ fetch: f })))
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    expect(await result).toBe('network')
  })
})

describe('anySignal', () => {
  let restore = (): void => undefined
  afterEach(() => {
    restore()
    restore = () => undefined
  })

  it('the manual combiner aborts with the first reason, starts aborted for an aborted input, and stops listening once disposed', () => {
    restore = withoutAbortSignalAny()
    const a = new AbortController()
    const b = new AbortController()
    const removeA = vi.spyOn(a.signal, 'removeEventListener')
    const one = anySignal([a.signal, b.signal])
    b.abort('b first')
    a.abort('a later')
    expect(one.signal.aborted).toBe(true)
    expect(one.signal.reason).toBe('b first')
    expect(anySignal([AbortSignal.abort('done'), new AbortController().signal]).signal.reason).toBe(
      'done',
    )
    const c = new AbortController()
    const removeC = vi.spyOn(c.signal, 'removeEventListener')
    const two = anySignal([c.signal])
    two.dispose()
    expect(removeC).toHaveBeenCalledWith('abort', expect.any(Function))
    c.abort()
    expect(two.signal.aborted).toBe(false)
    expect(removeA).toHaveBeenCalled()
  })
})

describe('nameFromUrl', () => {
  it('uses the last path segment, falls back to the host and adds a missing extension', () => {
    expect(nameFromUrl(new URL('https://a.com/x/heron.png'), 'png')).toBe('heron.png')
    expect(nameFromUrl(new URL('https://a.com/'), 'webp')).toBe('a.com.webp')
    expect(nameFromUrl(new URL('https://a.com/photo'), 'jpeg')).toBe('photo.jpg')
  })
})
