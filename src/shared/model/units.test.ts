import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MM_PER_INCH,
  PT_PER_MM,
  TARGET_DPI,
  defaultUnitForLocale,
  effectiveDpi,
  maxPrintMm,
  mmToUnit,
  roundForUnit,
  unitToMm,
} from './units'

describe('constants', () => {
  it('matches the physical definitions', () => {
    expect(MM_PER_INCH).toBe(25.4)
    expect(PT_PER_MM * 25.4).toBeCloseTo(72, 12)
    expect(TARGET_DPI).toBe(300)
  })
})

describe('mmToUnit / unitToMm', () => {
  it('converts known values', () => {
    expect(mmToUnit(25.4, 'in')).toBeCloseTo(1, 12)
    expect(unitToMm(8.5, 'in')).toBeCloseTo(215.9, 9)
    expect(mmToUnit(210, 'mm')).toBe(210)
    expect(unitToMm(210, 'mm')).toBe(210)
  })

  it('round-trips without meaningful error (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 5000, noNaN: true }), (mm) => {
        expect(unitToMm(mmToUnit(mm, 'in'), 'in')).toBeCloseTo(mm, 9)
      }),
    )
  })
})

describe('maxPrintMm / effectiveDpi', () => {
  it('prints 3000 px at 300 DPI across 254 mm', () => {
    expect(maxPrintMm(3000)).toBeCloseTo(254, 9)
    expect(maxPrintMm(3000, 150)).toBeCloseTo(508, 9)
  })

  it('is the inverse of maxPrintMm (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20000 }),
        fc.double({ min: 72, max: 600, noNaN: true }),
        (px, dpi) => {
          expect(effectiveDpi(px, maxPrintMm(px, dpi))).toBeCloseTo(dpi, 6)
        },
      ),
    )
  })

  it('has infinite DPI for a zero-length print', () => {
    expect(effectiveDpi(1000, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('defaultUnitForLocale (owner Q8, default)', () => {
  it('uses inches for US and Canadian English', () => {
    expect(defaultUnitForLocale('en-US')).toBe('in')
    expect(defaultUnitForLocale('en-CA')).toBe('in')
    expect(defaultUnitForLocale('en_us')).toBe('in')
    expect(defaultUnitForLocale('EN-ca')).toBe('in')
  })

  it('uses millimetres everywhere else', () => {
    const others = ['en', 'en-GB', 'en-AU', 'fr-CA', 'pt-BR', 'ja', 'de-DE', '', 'nonsense']
    for (const locale of others) {
      expect(defaultUnitForLocale(locale)).toBe('mm')
    }
  })
})

describe('roundForUnit', () => {
  it('rounds mm to 1 decimal and inches to 2', () => {
    expect(roundForUnit(5.04, 'mm')).toBe(5)
    expect(roundForUnit(5.06, 'mm')).toBe(5.1)
    expect(roundForUnit(0.2004, 'in')).toBe(0.2)
    expect(roundForUnit(8.5039, 'in')).toBe(8.5)
  })

  it('first rounding error is at most half a display step (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1200, noNaN: true }), (mm) => {
        const shownMm = roundForUnit(mmToUnit(mm, 'mm'), 'mm')
        expect(Math.abs(shownMm - mm)).toBeLessThanOrEqual(0.05 + 1e-9)
        const shownIn = roundForUnit(mmToUnit(mm, 'in'), 'in')
        expect(Math.abs(unitToMm(shownIn, 'in') - mm)).toBeLessThanOrEqual(0.005 * 25.4 + 1e-9)
      }),
    )
  })

  it('does not drift on repeated unit toggling (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1200, noNaN: true }), (mm) => {
        // Start from what the user sees, then bounce mm → in → mm → in a few times.
        let shownMm = roundForUnit(mm, 'mm')
        const firstIn = roundForUnit(mmToUnit(shownMm, 'in'), 'in')
        for (let i = 0; i < 5; i++) {
          const inches = roundForUnit(mmToUnit(shownMm, 'in'), 'in')
          expect(inches).toBe(firstIn)
          shownMm = roundForUnit(unitToMm(inches, 'in'), 'mm')
        }
        // The mm value that comes back is within the inch display step of where we started.
        expect(Math.abs(shownMm - roundForUnit(mm, 'mm'))).toBeLessThanOrEqual(
          0.005 * 25.4 + 0.05 + 1e-9,
        )
      }),
    )
  })
})
