import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITS,
  MAX_COPIES,
  MAX_SOURCE_LONG_SIDE_PX,
  printedPixelSize,
  type ImageDescriptor,
  type ImageId,
  type Rotation,
} from './image'

const id = 'img-1' as ImageId
const make = (
  over: Partial<ImageDescriptor['edits']>,
  pxW = 4000,
  pxH = 3000,
): ImageDescriptor => ({
  id,
  contentHash: 'hash-1',
  pxW,
  pxH,
  edits: { ...DEFAULT_EDITS, ...over },
})

describe('constants', () => {
  it('has the contract defaults', () => {
    expect(DEFAULT_EDITS).toEqual({
      crop: null,
      cropAspect: 'free',
      rotation: 0,
      flipH: false,
      flipV: false,
      copies: 1,
      size: { kind: 'auto' },
    })
    expect(MAX_COPIES).toBe(50)
    expect(MAX_SOURCE_LONG_SIDE_PX).toBe(5100)
  })

  it('caps the long side at Tabloid length at 300 DPI', () => {
    expect(Math.round((431.8 / 25.4) * 300)).toBe(MAX_SOURCE_LONG_SIDE_PX)
  })
})

describe('printedPixelSize', () => {
  it('is the full image when there is no crop and no rotation', () => {
    expect(printedPixelSize(make({}))).toEqual({ pxW: 4000, pxH: 3000 })
  })

  it('uses the crop size', () => {
    expect(printedPixelSize(make({ crop: { x: 10, y: 20, w: 1000, h: 500 } }))).toEqual({
      pxW: 1000,
      pxH: 500,
    })
  })

  it('swaps width and height for 90 and 270 degrees', () => {
    expect(printedPixelSize(make({ rotation: 90 }))).toEqual({ pxW: 3000, pxH: 4000 })
    expect(printedPixelSize(make({ rotation: 270 }))).toEqual({ pxW: 3000, pxH: 4000 })
    expect(printedPixelSize(make({ rotation: 180 }))).toEqual({ pxW: 4000, pxH: 3000 })
  })

  it('ignores flips and copies', () => {
    expect(printedPixelSize(make({ flipH: true, flipV: true, copies: 7 }))).toEqual({
      pxW: 4000,
      pxH: 3000,
    })
  })

  it('keeps the pixel area and depends on rotation only through a swap (property)', () => {
    const rotations: Rotation[] = [0, 90, 180, 270]
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 6000 }),
        fc.constantFrom(...rotations),
        fc.boolean(),
        (pxW, pxH, rotation, flipH) => {
          const base = printedPixelSize(make({}, pxW, pxH))
          const out = printedPixelSize(make({ rotation, flipH }, pxW, pxH))
          expect(out.pxW * out.pxH).toBe(base.pxW * base.pxH)
          const swapped = rotation === 90 || rotation === 270
          expect(out).toEqual(swapped ? { pxW: base.pxH, pxH: base.pxW } : base)
        },
      ),
    )
  })

  it('rotating a crop twice by 90 equals 180 (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 5000 }), (w, h) => {
        const crop = { x: 0, y: 0, w, h }
        const r180 = printedPixelSize(make({ crop, rotation: 180 }, 6000, 6000))
        const r0 = printedPixelSize(make({ crop, rotation: 0 }, 6000, 6000))
        expect(r180).toEqual(r0)
      }),
    )
  })
})
