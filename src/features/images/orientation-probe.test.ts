import { describe, expect, it, vi } from 'vitest'
import type { CanvasLike } from './decode'
import { readJpegInfo } from './exif'
import { probeBrowserAppliesExif } from './orientation-probe'
import { skeletonJpeg } from './test-bytes'

const canvas = (): CanvasLike => ({
  width: 2,
  height: 1,
  paint: () => true,
  toBlob: () => Promise.resolve(new Blob([skeletonJpeg(2, 1) as BlobPart], { type: 'image/jpeg' })),
  toBitmap: () => Promise.reject(new Error('unused')),
  release: () => undefined,
})
const bmp = (w: number, h: number) =>
  ({ width: w, height: h, close: vi.fn() }) as unknown as ImageBitmap

describe('probeBrowserAppliesExif', () => {
  it('is true when a orientation-6 probe decodes upright (1 x 2)', async () => {
    const seen: Blob[] = []
    const ok = await probeBrowserAppliesExif({
      createCanvas: canvas,
      createImageBitmap: (b) => {
        seen.push(b)
        return Promise.resolve(bmp(1, 2))
      },
    })
    expect(ok).toBe(true)
    const bytes = new Uint8Array(await (seen.at(0) ?? new Blob()).arrayBuffer())
    expect(readJpegInfo(bytes)?.orientation).toBe(6)
  })
  it('is false when the browser leaves the pixels unrotated', async () => {
    expect(
      await probeBrowserAppliesExif({
        createCanvas: canvas,
        createImageBitmap: () => Promise.resolve(bmp(2, 1)),
      }),
    ).toBe(false)
  })
  it('is false if anything throws', async () => {
    expect(
      await probeBrowserAppliesExif({
        createCanvas: canvas,
        createImageBitmap: () => Promise.reject(new Error('x')),
      }),
    ).toBe(false)
  })
})
