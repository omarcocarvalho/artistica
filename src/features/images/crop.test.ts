import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  HANDLES,
  arrowDelta,
  clampCrop,
  fullCrop,
  isFullCrop,
  isValidCrop,
  keyboardStep,
  largestCrop,
  moveCrop,
  resizeCrop,
} from './crop'

const dim = fc.integer({ min: 1, max: 6000 })
const ratioArb = fc.option(
  fc.constantFrom(1, 4 / 3, 3 / 2, 16 / 9, 3 / 4, 2 / 3, 9 / 16, 0.05, 20),
  { nil: null },
)
const num = (min: number, max: number) => fc.double({ min, max, noNaN: true })
const rectArb = fc.record({
  x: num(-100, 7000),
  y: num(-100, 7000),
  w: num(-10, 8000),
  h: num(-10, 8000),
})
const handleArb = fc.constantFrom(...HANDLES)
const delta = num(-3000, 3000)

describe('clampCrop', () => {
  it('always yields a valid crop, even for garbage input (property)', () => {
    fc.assert(
      fc.property(dim, dim, ratioArb, rectArb, (W, H, ratio, r) => {
        expect(isValidCrop(clampCrop(r, W, H, ratio), W, H, ratio)).toBe(true)
      }),
    )
  })
  it('survives NaN and infinities', () => {
    const r = clampCrop({ x: NaN, y: Infinity, w: NaN, h: -Infinity }, 100, 80, 1)
    expect(isValidCrop(r, 100, 80, 1)).toBe(true)
  })
  it('keeps a valid crop unchanged', () => {
    const r = { x: 10, y: 10, w: 40, h: 30 }
    expect(clampCrop(r, 100, 80, null)).toEqual(r)
  })
  it('handles a 1x1 image and extreme strips', () => {
    expect(isValidCrop(clampCrop({ x: 0, y: 0, w: 1, h: 1 }, 1, 1, null), 1, 1, null)).toBe(true)
    expect(isValidCrop(clampCrop({ x: 0, y: 0, w: 5, h: 5 }, 20, 2000, 1), 20, 2000, 1)).toBe(true)
    expect(
      isValidCrop(clampCrop({ x: 0, y: 0, w: 5, h: 5 }, 2000, 20, 1 / 20), 2000, 20, 1 / 20),
    ).toBe(true)
  })
})

describe('largestCrop / fullCrop', () => {
  it('is the full image for free, and a centred maximal rect for a ratio', () => {
    expect(largestCrop(400, 300, null)).toEqual(fullCrop(400, 300))
    expect(largestCrop(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 })
    expect(largestCrop(300, 400, 16 / 9).w).toBe(300)
  })
  it('detects the full crop', () => {
    expect(isFullCrop(fullCrop(10, 10), 10, 10)).toBe(true)
    expect(isFullCrop({ x: 1, y: 0, w: 9, h: 10 }, 10, 10)).toBe(false)
  })
})

describe('moveCrop', () => {
  it('moves and clamps to the image', () => {
    const r = { x: 10, y: 10, w: 40, h: 30 }
    expect(moveCrop(r, 5, -3, 100, 80)).toEqual({ x: 15, y: 7, w: 40, h: 30 })
    expect(moveCrop(r, 1000, 1000, 100, 80)).toEqual({ x: 60, y: 50, w: 40, h: 30 })
    expect(moveCrop(r, -1000, -1000, 100, 80)).toEqual({ x: 0, y: 0, w: 40, h: 30 })
  })
  it('stays valid and keeps its size (property)', () => {
    fc.assert(
      fc.property(dim, dim, ratioArb, rectArb, delta, delta, (W, H, ratio, raw, dx, dy) => {
        const start = clampCrop(raw, W, H, ratio)
        const m = moveCrop(start, dx, dy, W, H)
        expect(isValidCrop(m, W, H, ratio)).toBe(true)
        expect(m.w).toBe(start.w)
        expect(m.h).toBe(start.h)
      }),
    )
  })
})

describe('resizeCrop', () => {
  const start = { x: 20, y: 20, w: 40, h: 30 }
  it('free: east handle grows width only', () => {
    expect(resizeCrop(start, 'e', 10, 99, 200, 200, null)).toEqual({ x: 20, y: 20, w: 50, h: 30 })
  })
  it('free: north-west corner moves the corner and clamps at the image edge', () => {
    expect(resizeCrop(start, 'nw', -50, -50, 200, 200, null)).toEqual({ x: 0, y: 0, w: 60, h: 50 })
  })
  it('free: cannot shrink below the minimum', () => {
    const r = resizeCrop(start, 'e', -1000, 0, 200, 200, null)
    expect(r.w).toBe(16)
  })
  it('ratio: a corner drag keeps the aspect and anchors the opposite corner', () => {
    const sq = { x: 20, y: 20, w: 40, h: 40 }
    const r = resizeCrop(sq, 'se', 20, 5, 200, 200, 1)
    expect(r.x).toBe(20)
    expect(r.y).toBe(20)
    expect(r.w).toBeCloseTo(r.h, 9)
    expect(r.w).toBeCloseTo(60, 9)
  })
  it('ratio: a negative delta shrinks (keyboard shrink case)', () => {
    const sq = { x: 20, y: 20, w: 40, h: 40 }
    const r = resizeCrop(sq, 'se', -2, 0, 200, 200, 1)
    expect(r.w).toBeCloseTo(38, 9)
    expect(r.h).toBeCloseTo(38, 9)
  })
  it('ratio: an edge handle resizes around the centre of the other axis', () => {
    const r = resizeCrop({ x: 50, y: 50, w: 40, h: 40 }, 'e', 20, 0, 400, 400, 1)
    expect(r).toEqual({ x: 50, y: 40, w: 60, h: 60 })
  })
  it('ratio: stops at the image edge', () => {
    const r = resizeCrop({ x: 50, y: 50, w: 40, h: 40 }, 'se', 9999, 9999, 100, 100, 1)
    expect(r).toEqual({ x: 50, y: 50, w: 50, h: 50 })
  })
  it('stays valid for every handle, ratio and delta (property)', () => {
    fc.assert(
      fc.property(
        dim,
        dim,
        ratioArb,
        rectArb,
        handleArb,
        delta,
        delta,
        (W, H, ratio, raw, handle, dx, dy) => {
          const start = clampCrop(raw, W, H, ratio)
          expect(isValidCrop(resizeCrop(start, handle, dx, dy, W, H, ratio), W, H, ratio)).toBe(
            true,
          )
        },
      ),
    )
  })
  it('ignores NaN deltas', () => {
    expect(resizeCrop(start, 'se', NaN, NaN, 200, 200, null)).toEqual(start)
  })
})

describe('keyboard helpers', () => {
  it('maps arrows to deltas and ignores other keys', () => {
    expect(arrowDelta('ArrowLeft', 3)).toEqual({ dx: -3, dy: 0 })
    expect(arrowDelta('ArrowDown', 3)).toEqual({ dx: 0, dy: 3 })
    expect(arrowDelta('a', 3)).toBeNull()
  })
  it('steps by 0.5 % of the long side, at least 1 px', () => {
    expect(keyboardStep(4000, 3000)).toBe(20)
    expect(keyboardStep(10, 10)).toBe(1)
  })
})
