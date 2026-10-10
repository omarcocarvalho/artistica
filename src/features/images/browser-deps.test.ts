import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDecodeDeps } from './browser-deps'
import { MAX_DECODED_PIXELS, MAX_DECODED_PIXELS_TOUCH } from './limits'

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

function stubBrowser(userAgent: string) {
  const decode = vi.fn((_b: Blob, o?: ImageBitmapOptions) =>
    Promise.resolve({
      width: o?.resizeWidth ?? 4,
      height: o?.resizeHeight ?? 2,
      close: () => undefined,
    } as ImageBitmap),
  )
  vi.stubGlobal('navigator', { userAgent })
  vi.stubGlobal('createImageBitmap', decode)
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(new Blob(['jpeg'], { type: 'image/jpeg' }))
      },
    }),
  })
  return decode
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createBrowserDecodeDeps: resizeOnDecode', () => {
  it('probes once per deps and caches the answer', async () => {
    const decode = stubBrowser(SAFARI)
    const deps = createBrowserDecodeDeps()
    expect(await deps.resizeOnDecode()).toBe(true)
    expect(await deps.resizeOnDecode()).toBe(true)
    expect(decode).toHaveBeenCalledTimes(1)
  })

  it('is false without probing in an engine where it saves no memory', async () => {
    const decode = stubBrowser(CHROME)
    expect(await createBrowserDecodeDeps().resizeOnDecode()).toBe(false)
    expect(decode).not.toHaveBeenCalled()
  })
})

describe('createBrowserDecodeDeps: maxDecodedPixels (owner Q-H7)', () => {
  it('follows the primary pointer at each call', () => {
    stubBrowser(CHROME)
    let coarse = true
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }))
    const deps = createBrowserDecodeDeps()
    expect(deps.maxDecodedPixels()).toBe(MAX_DECODED_PIXELS_TOUCH)
    coarse = false
    expect(deps.maxDecodedPixels()).toBe(MAX_DECODED_PIXELS)
  })
})
