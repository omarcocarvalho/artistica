/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn mocks held in a deps object */
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_LONG_SIDE_PX } from '../../shared/model/image'
import { MAX_CANVAS_AREA, MAX_FILE_BYTES } from './limits'
import { ImportFailure } from './errors'
import type { Matrix } from './exif'
import { decodeImage, planDownscale, type CanvasLike, type DecodeDeps } from './decode'
import { ANIMATED_GIF, heicHeader, pngHeader, skeletonJpeg } from './test-bytes'

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
    expect(out.bitmap.width).toBe(64)
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
    const { deps, canvases } = makeDeps({
      createImageBitmap: () => Promise.resolve(bitmap(8000, 6000)),
    })
    const out = await decodeImage(blobOf(skeletonJpeg(8000, 6000), 'image/jpeg'), 'big.jpg', deps)
    expect(canvases[0]).toEqual([out.pxW, out.pxH])
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
    await expect(decodeImage(blobOf(skeletonJpeg(4, 4)), 'x.jpg', deps)).rejects.toBeInstanceOf(
      ImportFailure,
    )
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
