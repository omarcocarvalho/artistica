import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITS, MAX_COPIES, type ImageEdits } from '../../shared/model/image'
import { isValidCrop } from './crop'
import { cropAspectRatio, editsEqual, sanitizeEdits } from './edits'

describe('cropAspectRatio (source frame)', () => {
  it('is null for free and the source ratio for original', () => {
    expect(cropAspectRatio('free', 400, 300, 0)).toBeNull()
    expect(cropAspectRatio('original', 400, 300, 90)).toBeCloseTo(4 / 3)
  })
  it('follows the displayed orientation: portrait pictures get 3:4 for the 4:3 chip', () => {
    expect(cropAspectRatio('4:3', 4000, 3000, 0)).toBeCloseTo(4 / 3)
    expect(cropAspectRatio('4:3', 3000, 4000, 0)).toBeCloseTo(3 / 4)
  })
  it('inverts back into the source frame when rotated a quarter turn', () => {
    expect(cropAspectRatio('4:3', 4000, 3000, 90)).toBeCloseTo(4 / 3)
    expect(cropAspectRatio('4:3', 3000, 4000, 90)).toBeCloseTo(3 / 4)
    expect(cropAspectRatio('1:1', 3000, 4000, 270)).toBe(1)
  })
})

describe('sanitizeEdits', () => {
  it('clamps and rounds copies', () => {
    const f = (copies: number) => sanitizeEdits({ ...DEFAULT_EDITS, copies }, 100, 100).copies
    expect(f(0)).toBe(1)
    expect(f(99)).toBe(MAX_COPIES)
    expect(f(2.6)).toBe(3)
    expect(f(NaN)).toBe(1)
  })
  it('turns a fixed aspect with no crop into the largest centred crop', () => {
    const e = sanitizeEdits({ ...DEFAULT_EDITS, cropAspect: '1:1' }, 400, 300)
    expect(e.crop).toEqual({ x: 50, y: 0, w: 300, h: 300 })
  })
  it('canonicalises a free full-image crop to null', () => {
    const e = sanitizeEdits({ ...DEFAULT_EDITS, crop: { x: 0, y: 0, w: 400, h: 300 } }, 400, 300)
    expect(e.crop).toBeNull()
  })
  it('limits fixed sizes and drops invalid ones', () => {
    const big = sanitizeEdits(
      { ...DEFAULT_EDITS, size: { kind: 'fixed', axis: 'width', mm: 99999 } },
      10,
      10,
    )
    expect(big.size).toEqual({ kind: 'fixed', axis: 'width', mm: 1200 })
    const bad = sanitizeEdits(
      { ...DEFAULT_EDITS, size: { kind: 'fixed', axis: 'width', mm: NaN } },
      10,
      10,
    )
    expect(bad.size).toEqual({ kind: 'auto' })
  })
  it('always returns a valid crop and copies in range, and is idempotent (property)', () => {
    const editsArb = fc.record({
      crop: fc.option(
        fc.record({
          x: fc.double({ min: -50, max: 5000, noNaN: true }),
          y: fc.double({ min: -50, max: 5000, noNaN: true }),
          w: fc.double({ min: -5, max: 6000, noNaN: true }),
          h: fc.double({ min: -5, max: 6000, noNaN: true }),
        }),
        { nil: null },
      ),
      cropAspect: fc.constantFrom('free', 'original', '1:1', '4:3', '3:2', '16:9'),
      rotation: fc.constantFrom(0, 90, 180, 270),
      flipH: fc.boolean(),
      flipV: fc.boolean(),
      copies: fc.double({ min: -5, max: 200, noNaN: true }),
      size: fc.constantFrom(
        { kind: 'auto' } as const,
        { kind: 'fixed', axis: 'height', mm: 90 } as const,
      ),
    }) as fc.Arbitrary<ImageEdits>
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 6000 }),
        editsArb,
        (W, H, e) => {
          const once = sanitizeEdits(e, W, H)
          expect(
            Number.isInteger(once.copies) && once.copies >= 1 && once.copies <= MAX_COPIES,
          ).toBe(true)
          const ratio = cropAspectRatio(once.cropAspect, W, H, once.rotation)
          if (once.crop) expect(isValidCrop(once.crop, W, H, ratio)).toBe(true)
          const twice = sanitizeEdits(once, W, H)
          expect(twice.copies).toBe(once.copies)
          expect(twice.crop === null).toBe(once.crop === null)
          if (once.crop && twice.crop) {
            for (const k of ['x', 'y', 'w', 'h'] as const)
              expect(twice.crop[k]).toBeCloseTo(once.crop[k], 6)
          }
        },
      ),
    )
  })
})

describe('editsEqual', () => {
  it('compares deeply', () => {
    expect(editsEqual(DEFAULT_EDITS, { ...DEFAULT_EDITS })).toBe(true)
    expect(editsEqual(DEFAULT_EDITS, { ...DEFAULT_EDITS, flipH: true })).toBe(false)
    expect(
      editsEqual(
        { ...DEFAULT_EDITS, crop: { x: 1, y: 1, w: 2, h: 2 } },
        { ...DEFAULT_EDITS, crop: { x: 1, y: 1, w: 2, h: 2 } },
      ),
    ).toBe(true)
  })
})
