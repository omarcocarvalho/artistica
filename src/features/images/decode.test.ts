/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn mocks held in a deps object */
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_LONG_SIDE_PX } from '../../shared/model/image'
import { MAX_CANVAS_AREA, MAX_FILE_BYTES, PREVIEW_LONG_SIDE_PX } from './limits'
import { ImportFailure } from './errors'
import type { Matrix } from './exif'
import {
  decodeFullImage,
  decodeImage,
  planDownscale,
  type CanvasLike,
  type DecodeDeps,
} from './decode'
import { ANIMATED_GIF, heicHeader, pngHeader, skeletonJpeg, webpHeader } from './test-bytes'

function bitmap(width: number, height: number) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap & {
    close: ReturnType<typeof vi.fn>
  }
}

interface Paint {
  size: [number, number]
  matrix: Matrix
}
function makeDeps(over: Partial<DecodeDeps> = {}) {
  const paints: Paint[] = []
  const canvases: [number, number][] = []
  const decoded: { options: ImageBitmapOptions | undefined }[] = []
  const deps: DecodeDeps = {
    createImageBitmap: vi.fn((_blob: Blob, options?: ImageBitmapOptions) => {
      decoded.push({ options })
      return Promise.resolve(bitmap(64, 48))
    }),
    createCanvas: (w, h) => {
      canvases.push([w, h])
      const c: CanvasLike = {
        width: w,
        height: h,
        paint: (_b, matrix) => {
          paints.push({ size: [w, h], matrix })
          return true
        },
        toBlob: () => Promise.resolve(new Blob(['t'])),
        toBitmap: () => Promise.resolve(bitmap(w, h)),
        release: vi.fn(),
      }
      return c
    },
    browserAppliesExif: () => Promise.resolve(false),
    loadHeicConverter: () => Promise.resolve((b: Blob) => Promise.resolve(b)),
    createObjectURL: () => 'blob:thumb',
    ...over,
  }
  return { deps, paints, canvases, decoded }
}

const blobOf = (bytes: Uint8Array, type = '') => new Blob([bytes as BlobPart], { type })

describe('planDownscale', () => {
  it('never upscales and respects both caps (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30000 }),
        fc.integer({ min: 1, max: 30000 }),
        (w, h) => {
          const p = planDownscale(w, h)
          expect(p.w).toBeLessThanOrEqual(w)
          expect(p.h).toBeLessThanOrEqual(h)
          if (p.scale < 1) expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(MAX_SOURCE_LONG_SIDE_PX)
          expect(p.w * p.h).toBeLessThanOrEqual(MAX_CANVAS_AREA)
          expect(p.w).toBeGreaterThanOrEqual(1)
          expect(p.h).toBeGreaterThanOrEqual(1)
        },
      ),
    )
  })
  it('leaves small images alone and keeps the aspect for big ones', () => {
    expect(planDownscale(4000, 3000)).toEqual({ w: 4000, h: 3000, scale: 1 })
    const p = planDownscale(10000, 5000)
    expect(p.w).toBe(5100)
    expect(Math.abs(p.w / p.h - 2)).toBeLessThan(0.01)
  })
  it('caps 3:2 images below 16.7 MP even when the long side is allowed', () => {
    const p = planDownscale(5100, 3400)
    expect(p.w * p.h).toBeLessThanOrEqual(MAX_CANVAS_AREA)
  })
})

describe('decodeImage', () => {
  it('flattens a PNG onto white by repainting it (identity matrix)', async () => {
    const { deps, paints } = makeDeps()
    const out = await decodeImage(blobOf(pngHeader(64, 48), 'image/png'), 'a.png', deps)
    expect(paints).toEqual([{ size: [64, 48], matrix: [1, 0, 0, 1, 0, 0] }, expect.anything()])
    expect(out.pxW).toBe(64)
    expect(out.thumbUrl).toBe('blob:thumb')
  })

  it('uses a decoded orientation-1 JPEG as is (only the thumbnail is painted)', async () => {
    const { deps, paints, decoded } = makeDeps()
    const out = await decodeImage(blobOf(skeletonJpeg(64, 48), 'image/jpeg'), 'a.jpg', deps)
    expect(paints).toHaveLength(1)
    expect(decoded[0]?.options).toEqual({ imageOrientation: 'from-image' })
    expect(out.preview.width).toBe(64)
  })

  it('applies EXIF itself when the browser does not (orientation 6)', async () => {
    const { deps, paints, decoded } = makeDeps()
    const out = await decodeImage(blobOf(skeletonJpeg(64, 48, 6), 'image/jpeg'), 'a.jpg', deps)
    expect(decoded[0]?.options).toEqual({ imageOrientation: 'none' })
    expect(paints[0]).toEqual({ size: [48, 64], matrix: [0, 1, -1, 0, 48, 0] })
    expect([out.pxW, out.pxH, out.originalPxW, out.originalPxH]).toEqual([48, 64, 48, 64])
  })

  it('trusts the browser when the probe says it applies EXIF', async () => {
    const { deps, paints, decoded } = makeDeps({ browserAppliesExif: () => Promise.resolve(true) })
    await decodeImage(blobOf(skeletonJpeg(64, 48, 6), 'image/jpeg'), 'a.jpg', deps)
    expect(decoded[0]?.options).toEqual({ imageOrientation: 'from-image' })
    expect(paints).toHaveLength(1)
  })

  it('downscales large images and keeps the original size', async () => {
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(bitmap(8000, 6000)),
    })
    const out = await decodeImage(blobOf(skeletonJpeg(8000, 6000), 'image/jpeg'), 'big.jpg', deps)
    expect([out.pxW, out.pxH]).toEqual([planDownscale(8000, 6000).w, planDownscale(8000, 6000).h])
    expect(Math.max(out.pxW, out.pxH)).toBeLessThanOrEqual(5100)
    expect([out.originalPxW, out.originalPxH]).toEqual([8000, 6000])
  })

  it('refuses absurd declared sizes before decoding', async () => {
    const { deps } = makeDeps()
    await expect(decodeImage(blobOf(pngHeader(30000, 30000)), 'x.png', deps)).rejects.toMatchObject(
      { code: 'too-large' },
    )
    expect(deps.createImageBitmap).not.toHaveBeenCalled()
  })

  it('refuses files over the size limit', async () => {
    const { deps } = makeDeps()
    const b = blobOf(skeletonJpeg(4, 4))
    Object.defineProperty(b, 'size', { value: MAX_FILE_BYTES + 1 })
    await expect(decodeImage(b, 'x.jpg', deps)).rejects.toMatchObject({ code: 'too-large' })
  })

  it('rejects unknown bytes as unsupported-format without decoding', async () => {
    const { deps } = makeDeps()
    await expect(
      decodeImage(blobOf(Uint8Array.from([37, 80, 68, 70, 45])), 'notes.pdf', deps),
    ).rejects.toMatchObject({ code: 'unsupported-format' })
    expect(deps.createImageBitmap).not.toHaveBeenCalled()
  })

  it('maps a decoder rejection to decode-failed and closes nothing it did not open', async () => {
    const { deps } = makeDeps({ createImageBitmap: () => Promise.reject(new Error('bad')) })
    const result = decodeImage(blobOf(skeletonJpeg(4, 4)), 'x.jpg', deps)
    await expect(result).rejects.toBeInstanceOf(ImportFailure)
    await expect(result).rejects.toMatchObject({ code: 'decode-failed' })
  })

  it('closes the bitmap when the thumbnail fails', async () => {
    const decodedBitmap = bitmap(64, 48)
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decodedBitmap),
      createCanvas: (w, h) => ({
        width: w,
        height: h,
        paint: () => true,
        toBlob: () => Promise.resolve(null),
        toBitmap: () => Promise.resolve(bitmap(w, h)),
        release: () => undefined,
      }),
    })
    await expect(decodeImage(blobOf(skeletonJpeg(64, 48)), 'x.jpg', deps)).rejects.toMatchObject({
      code: 'decode-failed',
    })
    expect(decodedBitmap.close).toHaveBeenCalled()
  })

  it('flags animated GIFs', async () => {
    const { deps } = makeDeps()
    const out = await decodeImage(blobOf(ANIMATED_GIF, 'image/gif'), 'a.gif', deps)
    expect(out.animatedGif).toBe(true)
  })
})

describe('decodeImage: HEIC', () => {
  const heic = () => blobOf(heicHeader('heic'), 'image/heic')

  it('uses the native decoder when it works and never loads the WASM converter', async () => {
    const { deps } = makeDeps()
    const load = vi.fn(deps.loadHeicConverter)
    await decodeImage(heic(), 'a.heic', { ...deps, loadHeicConverter: load })
    expect(load).not.toHaveBeenCalled()
  })

  it('falls back to the converter only when native decoding rejects', async () => {
    let calls = 0
    const convert = vi.fn((b: Blob) => Promise.resolve(b))
    const { deps } = makeDeps({
      createImageBitmap: () =>
        calls++ === 0 ? Promise.reject(new Error('unsupported')) : Promise.resolve(bitmap(64, 48)),
      loadHeicConverter: () => Promise.resolve(convert),
    })
    const out = await decodeImage(heic(), 'a.heic', deps)
    expect(convert).toHaveBeenCalledTimes(1)
    expect(out.pxW).toBe(64)
  })

  it('reports decode-failed when the converter cannot be loaded', async () => {
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.reject(new Error('unsupported')),
      loadHeicConverter: () => Promise.reject(new Error('offline')),
    })
    await expect(decodeImage(heic(), 'a.heic', deps)).rejects.toMatchObject({
      code: 'decode-failed',
    })
  })

  it('detects HEIC by bytes even with an empty MIME type and a wrong name', async () => {
    const { deps } = makeDeps()
    const load = vi.fn(deps.loadHeicConverter)
    let n = 0
    await decodeImage(blobOf(heicHeader('mif1'), ''), 'IMG_1.jpg', {
      ...deps,
      loadHeicConverter: load,
      createImageBitmap: () =>
        n++ === 0 ? Promise.reject(new Error('x')) : Promise.resolve(bitmap(8, 8)),
    })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not route a JPEG named .heic to the HEIC path', async () => {
    const { deps, decoded } = makeDeps()
    const load = vi.fn(deps.loadHeicConverter)
    await decodeImage(blobOf(skeletonJpeg(64, 48), 'image/heic'), 'photo.HEIC', {
      ...deps,
      loadHeicConverter: load,
    })
    expect(load).not.toHaveBeenCalled()
    expect(decoded[0]?.options).toEqual({ imageOrientation: 'from-image' })
  })

  it('falls back to the label only when the bytes are unknown', async () => {
    let n = 0
    const { deps } = makeDeps({
      createImageBitmap: () =>
        n++ === 0 ? Promise.reject(new Error('x')) : Promise.resolve(bitmap(8, 8)),
    })
    const load = vi.fn(deps.loadHeicConverter)
    await decodeImage(
      blobOf(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/heic'),
      'a.heic',
      { ...deps, loadHeicConverter: load },
    )
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('decodeImage: memory and size-limit paths', () => {
  it.each([
    ['WebP', () => blobOf(webpHeader(), 'image/webp'), 'a.webp'],
    ['HEIC', () => blobOf(heicHeader('heic'), 'image/heic'), 'a.heic'],
  ])('rejects an oversized %s after decoding and closes the bitmap', async (_n, make, name) => {
    const huge = bitmap(15000, 15000)
    const { deps, canvases } = makeDeps({ createImageBitmap: () => Promise.resolve(huge) })
    await expect(decodeImage(make(), name, deps)).rejects.toMatchObject({ code: 'too-large' })
    expect(huge.close).toHaveBeenCalled()
    expect(canvases).toHaveLength(0)
  })

  it('closes the decoded bitmap after repainting a PNG', async () => {
    const decoded = bitmap(64, 48)
    const { deps } = makeDeps({ createImageBitmap: () => Promise.resolve(decoded) })
    await decodeImage(blobOf(pngHeader(64, 48), 'image/png'), 'a.png', deps)
    expect(decoded.close).toHaveBeenCalled()
  })

  it('closes the decoded bitmap after repainting an orientation-6 JPEG', async () => {
    const decoded = bitmap(64, 48)
    const { deps } = makeDeps({ createImageBitmap: () => Promise.resolve(decoded) })
    await decodeImage(blobOf(skeletonJpeg(64, 48, 6), 'image/jpeg'), 'a.jpg', deps)
    expect(decoded.close).toHaveBeenCalled()
  })

  it('closes the decoded bitmap after painting, before the repainted copy is made', async () => {
    const events: string[] = []
    const decoded = bitmap(64, 48)
    decoded.close.mockImplementation(() => events.push('close original'))
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createCanvas: (w, h) => ({
        width: w,
        height: h,
        paint: () => {
          events.push('paint')
          return true
        },
        toBlob: () => Promise.resolve(new Blob(['t'])),
        toBitmap: () => {
          events.push('toBitmap')
          return Promise.resolve(bitmap(w, h))
        },
        release: () => undefined,
      }),
    })
    await decodeImage(blobOf(pngHeader(64, 48), 'image/png'), 'a.png', deps)
    expect(events.slice(0, 3)).toEqual(['paint', 'close original', 'toBitmap'])
    expect(decoded.close).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['paint fails', { paint: false, toBitmap: true }],
    ['toBitmap rejects', { paint: true, toBitmap: false }],
  ])('closes the decoded bitmap exactly once when %s', async (_n, works) => {
    const decoded = bitmap(64, 48)
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createCanvas: (w, h) => ({
        width: w,
        height: h,
        paint: () => works.paint,
        toBlob: () => Promise.resolve(new Blob(['t'])),
        toBitmap: () =>
          works.toBitmap ? Promise.resolve(bitmap(w, h)) : Promise.reject(new Error('oom')),
        release: () => undefined,
      }),
    })
    await expect(
      decodeImage(blobOf(pngHeader(64, 48), 'image/png'), 'a.png', deps),
    ).rejects.toMatchObject({ code: 'decode-failed' })
    expect(decoded.close).toHaveBeenCalledTimes(1)
  })

  it('closes both bitmaps when the thumbnail fails after a repaint', async () => {
    const decoded = bitmap(64, 48)
    const repainted = bitmap(64, 48)
    let n = 0
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createCanvas: (w, h) => {
        const isThumb = n++ > 0
        return {
          width: w,
          height: h,
          paint: () => true,
          toBlob: () => Promise.resolve(isThumb ? null : new Blob(['t'])),
          toBitmap: () => Promise.resolve(repainted),
          release: () => undefined,
        }
      },
    })
    await expect(
      decodeImage(blobOf(pngHeader(64, 48), 'image/png'), 'a.png', deps),
    ).rejects.toMatchObject({ code: 'decode-failed' })
    expect(decoded.close).toHaveBeenCalledTimes(1)
    expect(repainted.close).toHaveBeenCalledTimes(1)
  })
})

describe('decodeImage: preview bitmap and compressed source', () => {
  it('keeps only a preview of a 24 MP photo, sized like the capped image, and closes the decode', async () => {
    const decoded = bitmap(5712, 4284)
    const { deps, canvases, paints } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
    })
    const blob = blobOf(skeletonJpeg(5712, 4284), 'image/jpeg')
    const out = await decodeImage(blob, 'big.jpg', deps)
    const full = planDownscale(5712, 4284)
    expect([out.pxW, out.pxH]).toEqual([full.w, full.h])
    expect([out.originalPxW, out.originalPxH]).toEqual([5712, 4284])
    expect([out.preview.width, out.preview.height]).toEqual([2048, 1536])
    expect(canvases).not.toContainEqual([full.w, full.h])
    expect(canvases[0]).toEqual([2048, 1536])
    expect(paints[0]?.matrix).toEqual([2048 / 5712, 0, 0, 1536 / 4284, 0, 0])
    expect(decoded.close).toHaveBeenCalledTimes(1)
    expect(out.source).toBe(blob)
  })

  it('makes the preview of an EXIF-rotated photo upright and never upscales a small one', async () => {
    const { deps, paints } = makeDeps({
      createImageBitmap: () => Promise.resolve(bitmap(3000, 1000)),
    })
    const out = await decodeImage(blobOf(skeletonJpeg(3000, 1000, 6), 'image/jpeg'), 'r.jpg', deps)
    expect([out.pxW, out.pxH]).toEqual([1000, 3000])
    expect([out.preview.width, out.preview.height]).toEqual([683, 2048])
    expect(paints[0]?.matrix).toEqual([0, 2048 / 3000, -683 / 1000, 0, 683, 0])

    const small = makeDeps({ createImageBitmap: () => Promise.resolve(bitmap(1000, 800)) })
    const png = await decodeImage(blobOf(pngHeader(1000, 800), 'image/png'), 's.png', small.deps)
    expect([png.preview.width, png.preview.height]).toEqual([1000, 800])
  })

  it('caps the preview long side at PREVIEW_LONG_SIDE_PX (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 14000 }),
        fc.integer({ min: 1, max: 14000 }),
        async (w, h) => {
          const { deps } = makeDeps({ createImageBitmap: () => Promise.resolve(bitmap(w, h)) })
          const out = await decodeImage(blobOf(pngHeader(w, h), 'image/png'), 'p.png', deps)
          expect(Math.max(out.preview.width, out.preview.height)).toBeLessThanOrEqual(
            PREVIEW_LONG_SIDE_PX,
          )
          expect(out.preview.width).toBeLessThanOrEqual(out.pxW)
          expect(out.preview.height).toBeLessThanOrEqual(out.pxH)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('makes the thumbnail from the preview, not from a full-size bitmap', async () => {
    const { deps, paints } = makeDeps({
      createImageBitmap: () => Promise.resolve(bitmap(5712, 4284)),
    })
    await decodeImage(blobOf(skeletonJpeg(5712, 4284), 'image/jpeg'), 'big.jpg', deps)
    expect(paints[1]?.matrix).toEqual([256 / 2048, 0, 0, 192 / 1536, 0, 0])
  })

  it('closes the preview when the thumbnail fails', async () => {
    const preview = bitmap(2048, 1536)
    const decoded = bitmap(5712, 4284)
    let n = 0
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createCanvas: (w, h) => {
        const isThumb = n++ > 0
        return {
          width: w,
          height: h,
          paint: () => true,
          toBlob: () => Promise.resolve(isThumb ? null : new Blob(['t'])),
          toBitmap: () => Promise.resolve(preview),
          release: () => undefined,
        }
      },
    })
    await expect(
      decodeImage(blobOf(skeletonJpeg(5712, 4284), 'image/jpeg'), 'big.jpg', deps),
    ).rejects.toMatchObject({ code: 'decode-failed' })
    expect(decoded.close).toHaveBeenCalledTimes(1)
    expect(preview.close).toHaveBeenCalledTimes(1)
  })

  it('keeps the HEIC file as the source when the browser decodes it natively', async () => {
    const { deps } = makeDeps()
    const heic = blobOf(heicHeader('heic'), 'image/heic')
    expect((await decodeImage(heic, 'a.heic', deps)).source).toBe(heic)
  })

  it('keeps the converted JPEG as the source when HEIC needed the WASM converter', async () => {
    const converted = blobOf(skeletonJpeg(64, 48), 'image/jpeg')
    let calls = 0
    const { deps } = makeDeps({
      createImageBitmap: () =>
        calls++ === 0 ? Promise.reject(new Error('unsupported')) : Promise.resolve(bitmap(64, 48)),
      loadHeicConverter: () => Promise.resolve(() => Promise.resolve(converted)),
    })
    const out = await decodeImage(blobOf(heicHeader('heic'), 'image/heic'), 'a.heic', deps)
    expect(out.source).toBe(converted)
  })
})

describe('decodeFullImage', () => {
  it('decodes a source again to exactly the capped, upright size and makes nothing else', async () => {
    const decoded = bitmap(5712, 4284)
    const createObjectURL = vi.fn(() => 'blob:x')
    const { deps, canvases } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createObjectURL,
    })
    const blob = blobOf(skeletonJpeg(5712, 4284), 'image/jpeg')
    const imported = await decodeImage(
      blob,
      'big.jpg',
      makeDeps({
        createImageBitmap: () => Promise.resolve(bitmap(5712, 4284)),
      }).deps,
    )
    const full = await decodeFullImage(imported.source, 'big.jpg', deps)
    expect([full.width, full.height]).toEqual([imported.pxW, imported.pxH])
    expect(canvases).toEqual([[imported.pxW, imported.pxH]])
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(decoded.close).toHaveBeenCalledTimes(1)
  })

  it('applies EXIF orientation like the import did', async () => {
    const { deps } = makeDeps({ createImageBitmap: () => Promise.resolve(bitmap(64, 48)) })
    const full = await decodeFullImage(blobOf(skeletonJpeg(64, 48, 6), 'image/jpeg'), 'r.jpg', deps)
    expect([full.width, full.height]).toEqual([48, 64])
  })

  it('returns an upright, uncapped JPEG decode as is', async () => {
    const decoded = bitmap(4032, 3024)
    const { deps, canvases } = makeDeps({ createImageBitmap: () => Promise.resolve(decoded) })
    const full = await decodeFullImage(blobOf(skeletonJpeg(4032, 3024)), 'a.jpg', deps)
    expect(full).toBe(decoded)
    expect(canvases).toEqual([])
    expect(decoded.close).not.toHaveBeenCalled()
  })

  it('decodes a converted HEIC source without the WASM converter', async () => {
    const load = vi.fn(() => Promise.resolve((b: Blob) => Promise.resolve(b)))
    const { deps } = makeDeps({ loadHeicConverter: load })
    await decodeFullImage(blobOf(skeletonJpeg(64, 48), 'image/jpeg'), 'a.heic', deps)
    expect(load).not.toHaveBeenCalled()
  })

  it('closes the decode and reports decode-failed when the repaint fails', async () => {
    const decoded = bitmap(5712, 4284)
    const { deps } = makeDeps({
      createImageBitmap: () => Promise.resolve(decoded),
      createCanvas: (w, h) => ({
        width: w,
        height: h,
        paint: () => true,
        toBlob: () => Promise.resolve(null),
        toBitmap: () => Promise.reject(new Error('oom')),
        release: () => undefined,
      }),
    })
    await expect(
      decodeFullImage(blobOf(skeletonJpeg(5712, 4284)), 'a.jpg', deps),
    ).rejects.toMatchObject({ code: 'decode-failed' })
    expect(decoded.close).toHaveBeenCalledTimes(1)
  })
})
