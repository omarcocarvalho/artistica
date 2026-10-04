import { describe, expect, it, vi } from 'vitest'
import { ImportFailure } from './errors'
import { MAX_FILE_BYTES } from './limits'
import { skeletonJpeg } from './test-bytes'
import {
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

describe('nameFromUrl', () => {
  it('uses the last path segment, falls back to the host and adds a missing extension', () => {
    expect(nameFromUrl(new URL('https://a.com/x/heron.png'), 'png')).toBe('heron.png')
    expect(nameFromUrl(new URL('https://a.com/'), 'webp')).toBe('a.com.webp')
    expect(nameFromUrl(new URL('https://a.com/photo'), 'jpeg')).toBe('photo.jpg')
  })
})
