import { describe, expect, it } from 'vitest'
import { sizeRange, widthAtTarget } from './sizing'
import { item } from './test-support/fixtures'

const A4_CONTENT = { w: 190, h: 277 } // A4 with the default setup

describe('sizeRange (auto)', () => {
  it('ranges from the 60 mm comfort short side to the 300-DPI cap', () => {
    expect(sizeRange(item('a', 1.5, 200), 6, A4_CONTENT)).toEqual({
      lo: 90, // short side 60 → width 90
      hi: 200,
      fitW: 277,
      scaledToFit: false,
    })
    expect(sizeRange(item('a', 2 / 3, 150), 6, A4_CONTENT).lo).toBe(60)
  })

  it('caps the maximum at the content box', () => {
    expect(sizeRange(item('a', 1, 1000), 6, A4_CONTENT).hi).toBe(190)
  })

  it('collapses to the comfort minimum for low-DPI images', () => {
    const r = sizeRange(item('a', 1.5, 30), 6, A4_CONTENT)
    expect(r.lo).toBe(90)
    expect(r.hi).toBe(90)
  })

  it('clamps the comfort minimum to a small content box', () => {
    const r = sizeRange(item('a', 1, 1000), 6, { w: 40, h: 50 })
    expect(r.lo).toBe(40)
    expect(r.hi).toBe(40)
  })

  it('treats a non-positive or non-finite fixed size as auto', () => {
    expect(
      sizeRange(item('a', 1, 200, { kind: 'fixed', axis: 'width', mm: 0 }), 6, A4_CONTENT).lo,
    ).toBe(60)
    expect(
      sizeRange(item('a', 1, 200, { kind: 'fixed', axis: 'width', mm: Number.NaN }), 6, A4_CONTENT)
        .hi,
    ).toBe(190)
  })
})

describe('sizeRange (fixed)', () => {
  it('uses the width as set', () => {
    expect(
      sizeRange(item('a', 1.5, 1000, { kind: 'fixed', axis: 'width', mm: 120 }), 6, A4_CONTENT),
    ).toEqual({
      lo: 120,
      hi: 120,
      fitW: 277,
      scaledToFit: false,
    })
  })
  it('derives the width from a set height, keeping the aspect', () => {
    expect(
      sizeRange(item('a', 1.5, 1000, { kind: 'fixed', axis: 'height', mm: 100 }), 6, A4_CONTENT).lo,
    ).toBe(150)
  })
  it('scales a size that does not fit down to the largest that does, and says so', () => {
    const r = sizeRange(
      item('a', 1, 1000, { kind: 'fixed', axis: 'width', mm: 500 }),
      6,
      A4_CONTENT,
    )
    expect(r).toEqual({ lo: 190, hi: 190, fitW: 190, scaledToFit: true })
  })
})

describe('widthAtTarget', () => {
  const r = { lo: 90, hi: 150, fitW: 277, scaledToFit: false }
  it('grows the short side to the target, within the range', () => {
    expect(widthAtTarget(r, 1.5, 0)).toBe(90)
    expect(widthAtTarget(r, 1.5, 80)).toBe(120)
    expect(widthAtTarget(r, 1.5, 500)).toBe(150)
  })
})
