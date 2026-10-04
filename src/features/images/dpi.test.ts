import { describe, expect, it } from 'vitest'
import { MIN_COMFORT_SHORT_SIDE_MM } from '../../shared/model/page-setup'
import { defaultFixedSize, dpiInfo, fixedSizeMm, withAxis } from './dpi'

describe('fixedSizeMm', () => {
  it('derives the other axis from the printed pixel aspect', () => {
    expect(fixedSizeMm({ pxW: 3000, pxH: 4000 }, { kind: 'fixed', axis: 'width', mm: 90 })).toEqual(
      { w: 90, h: 120 },
    )
    expect(
      fixedSizeMm({ pxW: 3000, pxH: 4000 }, { kind: 'fixed', axis: 'height', mm: 120 }),
    ).toEqual({ w: 90, h: 120 })
  })
})

describe('dpiInfo', () => {
  it('auto: flags images that cannot reach 300 DPI at the comfortable minimum', () => {
    const low = dpiInfo({ pxW: 480, pxH: 640 }, { kind: 'auto' })
    expect(Math.round(low.dpi)).toBe(203)
    expect(low.low).toBe(true)
    expect(dpiInfo({ pxW: 4000, pxH: 3000 }, { kind: 'auto' }).low).toBe(false)
    expect(MIN_COMFORT_SHORT_SIDE_MM).toBe(60) // the shared constant (A) is what the hint uses
    expect(dpiInfo({ pxW: 480, pxH: 640 }, { kind: 'auto' }).dpi).toBeCloseTo(
      (480 * 25.4) / MIN_COMFORT_SHORT_SIDE_MM,
      6,
    )
  })
  it('fixed: matches the mockup (480 x 640 at 90 mm wide is about 135 DPI)', () => {
    const info = dpiInfo({ pxW: 480, pxH: 640 }, { kind: 'fixed', axis: 'width', mm: 90 })
    expect(Math.round(info.dpi)).toBe(135)
    expect(info.low).toBe(true)
    expect(info.sharpUpToMm.w).toBeCloseTo(40.64, 1)
  })
  it('fixed: exactly 300 DPI is not low (no float noise)', () => {
    const mm = (3000 / 300) * 25.4
    expect(dpiInfo({ pxW: 3000, pxH: 2000 }, { kind: 'fixed', axis: 'width', mm }).low).toBe(false)
  })
})

describe('withAxis / defaultFixedSize', () => {
  it('switching axis keeps the physical size', () => {
    const next = withAxis(
      { pxW: 3000, pxH: 4000 },
      { kind: 'fixed', axis: 'width', mm: 90 },
      'height',
    )
    expect(next).toEqual({ kind: 'fixed', axis: 'height', mm: 120 })
  })
  it('default fixed size is at most 100 mm wide and never beyond the 300 DPI limit', () => {
    expect(defaultFixedSize({ pxW: 4000, pxH: 3000 })).toEqual({
      kind: 'fixed',
      axis: 'width',
      mm: 100,
    })
    const small = defaultFixedSize({ pxW: 480, pxH: 640 })
    expect(small.mm).toBeLessThan(41)
    expect(small.mm).toBeGreaterThanOrEqual(10)
  })
})
