import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CUSTOM_PAPER_LIMITS } from '../../shared/model/paper'
import { clampMm, normalizeCustomSize, NOTE_KEYS, stepMmFor } from './page-setup-logic'

const { minMm, maxMm } = CUSTOM_PAPER_LIMITS

describe('normalizeCustomSize', () => {
  it('keeps a valid portrait size', () => {
    expect(normalizeCustomSize({ w: 200, h: 250 })).toEqual({ w: 200, h: 250 })
  })
  it('swaps so that width <= height (portrait-normalised)', () => {
    expect(normalizeCustomSize({ w: 300, h: 200 })).toEqual({ w: 200, h: 300 })
  })
  it('clamps to the limits', () => {
    expect(normalizeCustomSize({ w: 1, h: 99999 })).toEqual({ w: minMm, h: maxMm })
  })
  it('replaces non-finite values with the minimum', () => {
    expect(normalizeCustomSize({ w: Number.NaN, h: 200 })).toEqual({ w: minMm, h: 200 })
  })
  it('always returns a finite, in-range, portrait-normalised, idempotent size', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), (w, h) => {
        const out = normalizeCustomSize({ w, h })
        expect(Number.isFinite(out.w) && Number.isFinite(out.h)).toBe(true)
        expect(out.w).toBeGreaterThanOrEqual(minMm)
        expect(out.h).toBeLessThanOrEqual(maxMm)
        expect(out.w).toBeLessThanOrEqual(out.h)
        expect(normalizeCustomSize(out)).toEqual(out)
      }),
    )
  })
})

describe('clampMm', () => {
  it('clamps and rejects non-finite input by returning the minimum', () => {
    expect(clampMm(5, 3, 30)).toBe(5)
    expect(clampMm(-2, 3, 30)).toBe(3)
    expect(clampMm(500, 3, 30)).toBe(30)
    expect(clampMm(Number.NaN, 3, 30)).toBe(3)
    expect(clampMm(Number.POSITIVE_INFINITY, 3, 30)).toBe(3)
  })
})

describe('stepMmFor', () => {
  it('steps 0.5 mm in mm and 0.01 in (0.254 mm) in inches', () => {
    expect(stepMmFor('mm')).toBe(0.5)
    expect(stepMmFor('in')).toBeCloseTo(0.254, 10)
  })
})

describe('NOTE_KEYS', () => {
  it('maps every PageSetupNote to a pageSetup key', () => {
    expect(NOTE_KEYS['gutter-enabled-for-bleed']).toBe('notes.gutterEnabledForBleed')
    expect(NOTE_KEYS['gutter-raised-for-bleed']).toBe('notes.gutterRaisedForBleed')
    expect(NOTE_KEYS['safe-area-raised-to-minimum']).toBe('notes.safeAreaRaisedToMinimum')
  })
})
