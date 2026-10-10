import { describe, expect, it, vi } from 'vitest'
import type { CanvasLike } from './decode'
import { probeResizeOnDecode, resizeOnDecodeSavesMemory } from './resize-probe'
import { skeletonJpeg } from './test-bytes'

const canvas = (w: number, h: number): CanvasLike => ({
  width: w,
  height: h,
  paint: () => true,
  toBlob: () => Promise.resolve(new Blob([skeletonJpeg(w, h) as BlobPart], { type: 'image/jpeg' })),
  toBitmap: () => Promise.reject(new Error('unused')),
  release: () => undefined,
})
const bmp = (w: number, h: number) =>
  ({ width: w, height: h, close: vi.fn() }) as unknown as ImageBitmap

describe('probeResizeOnDecode', () => {
  it('is true when a 4 x 2 JPEG decodes at the requested 2 x 1', async () => {
    const asked: (ImageBitmapOptions | undefined)[] = []
    const made: [number, number][] = []
    const ok = await probeResizeOnDecode({
      createCanvas: (w, h) => {
        made.push([w, h])
        return canvas(w, h)
      },
      createImageBitmap: (_b, o) => {
        asked.push(o)
        return Promise.resolve(bmp(o?.resizeWidth ?? 4, o?.resizeHeight ?? 2))
      },
    })
    expect(ok).toBe(true)
    expect(made).toEqual([[4, 2]])
    expect(asked).toEqual([{ resizeWidth: 2, resizeHeight: 1, resizeQuality: 'high' }])
  })
  it('is false when the browser ignores the options', async () => {
    expect(
      await probeResizeOnDecode({
        createCanvas: canvas,
        createImageBitmap: () => Promise.resolve(bmp(4, 2)),
      }),
    ).toBe(false)
  })
  it('closes the probe bitmap', async () => {
    const close = vi.fn()
    const b = { width: 2, height: 1, close } as unknown as ImageBitmap
    await probeResizeOnDecode({ createCanvas: canvas, createImageBitmap: () => Promise.resolve(b) })
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('is false if anything throws or the canvas makes no JPEG', async () => {
    expect(
      await probeResizeOnDecode({
        createCanvas: canvas,
        createImageBitmap: () => Promise.reject(new Error('x')),
      }),
    ).toBe(false)
    expect(
      await probeResizeOnDecode({
        createCanvas: (w, h) => ({ ...canvas(w, h), toBlob: () => Promise.resolve(null) }),
        createImageBitmap: () => Promise.resolve(bmp(2, 1)),
      }),
    ).toBe(false)
  })
})

describe('resizeOnDecodeSavesMemory', () => {
  it.each([
    [
      'Safari on macOS',
      true,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    ],
    [
      'Safari on iPhone',
      true,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'Chrome on iPhone (WebKit)',
      true,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
    ],
    [
      'Firefox on iPhone (WebKit)',
      true,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    ],
    [
      'Chrome on macOS',
      false,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    ],
    [
      'Chrome on Android',
      false,
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Edge on Windows',
      false,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    ],
    [
      'Firefox on Windows',
      false,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    ],
    [
      'Firefox on Android',
      false,
      'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    ],
  ])('%s → %s', (_name, expected, ua) => {
    expect(resizeOnDecodeSavesMemory(ua)).toBe(expected)
  })
})
