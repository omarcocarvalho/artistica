import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CropRect, ImageEdits, Rotation } from '../../../shared/model/image'
import type { RectMm } from '../../layout/types'
import { drawTilesFor } from '../../render/page-model/build-page-models'
import { applyMatrix, orientMatrix, planTilePixels } from '../../render/pixels/tile-plan'
import { descriptor, placement } from '../../render/test-support/fixtures'
import { frameOf, frameToPage } from '../place'
import type { FrameSize, PathCmd } from '../types'
import { applyAffine, cropKey, fromCrop, fromRotated, meetsCrop, sourceToFrame } from './map'

const rotations = fc.constantFrom<Rotation>(0, 90, 180, 270)
const unit = fc.double({ min: 0, max: 1, noNaN: true })
const quarter = (r: Rotation): boolean => r === 90 || r === 270

function img(pxW: number, pxH: number, edits: Partial<ImageEdits> = {}) {
  return descriptor('a', pxW, pxH, edits)
}

/** A source size and a crop inside it (or null), in fractional px of at least 1 px each way. */
const sourceAndCrop = fc
  .record({
    pxW: fc.integer({ min: 1, max: 6000 }),
    pxH: fc.integer({ min: 1, max: 6000 }),
    full: fc.boolean(),
    fx: unit,
    fy: unit,
    fw: unit,
    fh: unit,
  })
  .map(({ pxW, pxH, full, fx, fy, fw, fh }) => {
    const x = fx * (pxW - 1)
    const y = fy * (pxH - 1)
    const crop: CropRect | null = full
      ? null
      : { x, y, w: 1 + fw * (pxW - x - 1), h: 1 + fh * (pxH - y - 1) }
    return { pxW, pxH, crop }
  })

/** The frame of the printed picture: its aspect after crop and rotation, at some scale. */
function printedFrame(
  cropW: number,
  cropH: number,
  rotation: Rotation,
  mmPerPx: number,
): FrameSize {
  return quarter(rotation)
    ? { w: cropH * mmPerPx, h: cropW * mmPerPx }
    : { w: cropW * mmPerPx, h: cropH * mmPerPx }
}

describe('sourceToFrame', () => {
  it('sourceToFrame agrees with orientMatrix for every rotation, flip and crop (property)', () => {
    fc.assert(
      fc.property(
        sourceAndCrop,
        rotations,
        fc.boolean(),
        fc.boolean(),
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        unit,
        unit,
        ({ pxW, pxH, crop }, rotation, flipH, flipV, mmPerPx, su, sv) => {
          const c = crop ?? { x: 0, y: 0, w: pxW, h: pxH }
          const frame = printedFrame(c.w, c.h, rotation, mmPerPx)
          const m = sourceToFrame(img(pxW, pxH, { crop, rotation, flipH, flipV }), frame)
          const p = { x: su * pxW, y: sv * pxH }
          const got = applyAffine(m, { op: 'M', ...p })
          const want = applyMatrix(
            orientMatrix(rotation, flipH, flipV, c.w, c.h, frame.w, frame.h, 0),
            p.x - c.x,
            p.y - c.y,
          )
          expect(Math.abs(got.x - want.x)).toBeLessThan(1e-9)
          expect(Math.abs(got.y - want.y)).toBeLessThan(1e-9)
        },
      ),
    )
  })

  type Corner = 'TL' | 'TR' | 'BR' | 'BL'
  // Where the crop's top-left, top-right, bottom-right and bottom-left corners land on the frame,
  // worked out by hand: rotation is clockwise, then flipH swaps left and right, flipV top and bottom.
  const corners: readonly (readonly [Rotation, boolean, boolean, readonly Corner[]])[] = [
    [0, false, false, ['TL', 'TR', 'BR', 'BL']],
    [0, true, false, ['TR', 'TL', 'BL', 'BR']],
    [0, false, true, ['BL', 'BR', 'TR', 'TL']],
    [0, true, true, ['BR', 'BL', 'TL', 'TR']],
    [90, false, false, ['TR', 'BR', 'BL', 'TL']],
    [90, true, false, ['TL', 'BL', 'BR', 'TR']],
    [90, false, true, ['BR', 'TR', 'TL', 'BL']],
    [90, true, true, ['BL', 'TL', 'TR', 'BR']],
    [180, false, false, ['BR', 'BL', 'TL', 'TR']],
    [180, true, false, ['BL', 'BR', 'TR', 'TL']],
    [180, false, true, ['TR', 'TL', 'BL', 'BR']],
    [180, true, true, ['TL', 'TR', 'BR', 'BL']],
    [270, false, false, ['BL', 'TL', 'TR', 'BR']],
    [270, true, false, ['BR', 'TR', 'TL', 'BL']],
    [270, false, true, ['TL', 'BL', 'BR', 'TR']],
    [270, true, true, ['TR', 'BR', 'BL', 'TL']],
  ]

  it.each(corners)(
    "the crop's corners land on the frame's corners (rotation %i, flipH %s, flipV %s)",
    (rotation, flipH, flipV, want) => {
      const crop = { x: 100, y: 50, w: 400, h: 300 }
      const frame = quarter(rotation) ? { w: 30, h: 40 } : { w: 40, h: 30 }
      const m = sourceToFrame(img(1000, 800, { crop, rotation, flipH, flipV }), frame)
      const at: Record<Corner, readonly [number, number]> = {
        TL: [0, 0],
        TR: [frame.w, 0],
        BR: [frame.w, frame.h],
        BL: [0, frame.h],
      }
      const source = [
        [100, 50],
        [500, 50],
        [500, 350],
        [100, 350],
      ] as const
      source.forEach(([x, y], i) => {
        const got = applyAffine(m, { op: 'M', x, y })
        const corner = want[i]
        if (corner === undefined) throw new Error('missing corner')
        expect(got.x).toBeCloseTo(at[corner][0], 9)
        expect(got.y).toBeCloseTo(at[corner][1], 9)
      })
    },
  )

  it('uses the full image when there is no crop', () => {
    const m = sourceToFrame(img(200, 100), { w: 20, h: 10 })
    expect(applyAffine(m, { op: 'L', x: 200, y: 100 })).toEqual({ op: 'L', x: 20, y: 10 })
    expect(applyAffine(m, { op: 'L', x: 50, y: 25 })).toEqual({ op: 'L', x: 5, y: 2.5 })
  })

  it('uses the crop the tile prints when the stored crop overhangs the image', () => {
    const image = img(1000, 800, { crop: { x: 900, y: -10, w: 300, h: 200 } })
    const m = sourceToFrame(image, { w: 10, h: 20 })
    expect(applyAffine(m, { op: 'M', x: 900, y: 0 })).toEqual({ op: 'M', x: 0, y: 0 })
    expect(applyAffine(m, { op: 'M', x: 1000, y: 200 })).toEqual({ op: 'M', x: 10, y: 20 })
  })

  it('then frameToPage lands on the pixel the tile prints there, turned or not (property)', () => {
    const anyTrim = fc.record({
      x: fc.double({ min: -500, max: 500, noNaN: true }),
      y: fc.double({ min: -500, max: 500, noNaN: true }),
      w: fc.double({ min: 5, max: 400, noNaN: true }),
      h: fc.double({ min: 5, max: 400, noNaN: true }),
    })
    fc.assert(
      fc.property(
        sourceAndCrop,
        rotations,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        anyTrim,
        fc.constantFrom(0, 3),
        unit,
        unit,
        ({ pxW, pxH, crop }, rotation, flipH, flipV, turned, trim: RectMm, bleedMm, su, sv) => {
          const image = img(pxW, pxH, { crop, rotation, flipH, flipV })
          const tile = drawTilesFor(image, placement('a', [trim], { turned }), bleedMm)[0]
          if (tile === undefined) throw new Error('no tile')
          const plan = planTilePixels(tile, { dpi: 72 })
          const p = { x: tile.crop.x + su * tile.crop.w, y: tile.crop.y + sv * tile.crop.h }
          const onCanvas = applyMatrix(
            plan.matrix,
            ((p.x - plan.src.x) * plan.scaledW) / plan.src.w,
            ((p.y - plan.src.y) * plan.scaledH) / plan.src.h,
          )
          const want = {
            x: trim.x + ((onCanvas.x - plan.bleedPx) * trim.w) / plan.outW,
            y: trim.y + ((onCanvas.y - plan.bleedPx) * trim.h) / plan.outH,
          }
          const frame = frameOf(trim, turned)
          const inFrame = applyAffine(sourceToFrame(image, frame), { op: 'M', ...p })
          const got = frameToPage(inFrame, trim, turned)
          const eps = 1e-9 * (1 + Math.abs(trim.x) + Math.abs(trim.y) + trim.w + trim.h)
          expect(Math.abs(got.x - want.x)).toBeLessThan(eps)
          expect(Math.abs(got.y - want.y)).toBeLessThan(eps)
        },
      ),
    )
  })
})

describe('applyAffine', () => {
  const m = [2, 3, 5, 7, 11, 13] as const
  it('maps M and L points as x = a·x + c·y + e, y = b·x + d·y + f', () => {
    expect(applyAffine(m, { op: 'M', x: 1, y: 10 })).toEqual({ op: 'M', x: 63, y: 86 })
    expect(applyAffine(m, { op: 'L', x: -1, y: 0 })).toEqual({ op: 'L', x: 9, y: 10 })
  })
  it('maps every point of a cubic with the same map', () => {
    const c: PathCmd = { op: 'C', x1: 1, y1: 10, x2: -1, y2: 0, x: 0, y: 1 }
    expect(applyAffine(m, c)).toEqual({ op: 'C', x1: 63, y1: 86, x2: 9, y2: 10, x: 16, y: 20 })
  })
})

describe('fromRotated', () => {
  // A 3 × 2 source grid of labelled pixels, and the same grid turned clockwise by hand.
  const source = ['abc', 'def']
  const turned: Record<Rotation, readonly string[]> = {
    0: ['abc', 'def'],
    90: ['da', 'eb', 'fc'],
    180: ['fed', 'cba'],
    270: ['cf', 'be', 'ad'],
  }
  function centres(grid: readonly string[]): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>()
    grid.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        out.set(row.charAt(c), { x: (c + 0.5) / row.length, y: (r + 0.5) / grid.length })
      }
    })
    return out
  }

  it.each([0, 90, 180, 270] as const)(
    "fromRotated inverts the rotated bitmap's pixel mapping (%i°)",
    (rotation) => {
      const want = centres(source)
      for (const [label, p] of centres(turned[rotation])) {
        const got = fromRotated(p, rotation)
        const w = want.get(label)
        if (w === undefined) throw new Error(`no label ${label}`)
        expect(got.x).toBeCloseTo(w.x, 12)
        expect(got.y).toBeCloseTo(w.y, 12)
      }
    },
  )

  it('agrees with the rotation in orientMatrix (property)', () => {
    fc.assert(
      fc.property(rotations, unit, unit, (rotation, u, v) => {
        const q = applyMatrix(orientMatrix(rotation, false, false, 1, 1, 1, 1, 0), u, v)
        const back = fromRotated(q, rotation)
        expect(Math.abs(back.x - u)).toBeLessThan(1e-12)
        expect(Math.abs(back.y - v)).toBeLessThan(1e-12)
      }),
    )
  })
})

describe('fromCrop', () => {
  const toCrop = (p: { x: number; y: number }, c: CropRect, pxW: number, pxH: number) => ({
    x: (p.x * pxW - c.x) / c.w,
    y: (p.y * pxH - c.y) / c.h,
  })

  it('maps a point of the cropped picture to the source', () => {
    expect(fromCrop({ x: 0.5, y: 1 }, { x: 100, y: 50, w: 400, h: 300 }, 1000, 800)).toEqual({
      x: 0.3,
      y: 0.4375,
    })
  })
  it('is the identity without a crop', () => {
    expect(fromCrop({ x: 0.25, y: 0.75 }, null, 1000, 800)).toEqual({ x: 0.25, y: 0.75 })
  })
  it('fromCrop round trip (property)', () => {
    fc.assert(
      fc.property(sourceAndCrop, unit, unit, ({ pxW, pxH, crop }, x, y) => {
        const c = crop ?? { x: 0, y: 0, w: pxW, h: pxH }
        const back = toCrop(fromCrop({ x, y }, crop, pxW, pxH), c, pxW, pxH)
        expect(Math.abs(back.x - x)).toBeLessThan(1e-12)
        expect(Math.abs(back.y - y)).toBeLessThan(1e-12)
      }),
    )
  })
})

describe('meetsCrop', () => {
  const cropped = img(1000, 800, { crop: { x: 100, y: 50, w: 400, h: 300 } })
  it.each([
    ['wholly left of', { x: 0, y: 100, w: 99, h: 10 }, false],
    ['wholly right of', { x: 501, y: 100, w: 10, h: 10 }, false],
    ['wholly above', { x: 200, y: 0, w: 10, h: 49 }, false],
    ['wholly below', { x: 200, y: 351, w: 10, h: 10 }, false],
    ['touching the left edge of', { x: 0, y: 100, w: 100, h: 10 }, true],
    ['touching the right edge of', { x: 500, y: 100, w: 10, h: 10 }, true],
    ['touching the top edge of', { x: 200, y: 0, w: 10, h: 50 }, true],
    ['touching the bottom edge of', { x: 200, y: 350, w: 10, h: 10 }, true],
    ['inside', { x: 200, y: 100, w: 10, h: 10 }, true],
    ['around', { x: 0, y: 0, w: 1000, h: 800 }, true],
    ['a vertical line inside', { x: 200, y: 100, w: 0, h: 10 }, true],
  ] as const)('a box %s the crop: %j → %s', (_, box, want) => {
    expect(meetsCrop(box, cropped)).toBe(want)
  })
  it('meets the whole image when there is no crop', () => {
    expect(meetsCrop({ x: 900, y: 700, w: 10, h: 10 }, img(1000, 800))).toBe(true)
    expect(meetsCrop({ x: 1001, y: 700, w: 10, h: 10 }, img(1000, 800))).toBe(false)
  })
})

describe('cropKey', () => {
  it('is "full" without a crop', () => {
    expect(cropKey(null)).toBe('full')
  })
  it('rounds a fractional crop to whole px', () => {
    expect(cropKey({ x: 10.4, y: 0.6, w: 99.5, h: 50 })).toBe('10,1,100,50')
  })
})
