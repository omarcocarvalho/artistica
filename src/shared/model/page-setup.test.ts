import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CROP_MARK_LENGTH_MM,
  CROP_MARK_OFFSET_MM,
  DEFAULT_PAGE_SETUP,
  MIN_COMFORT_SHORT_SIDE_MM,
  MIN_SAFE_AREA_MM,
  contentBoxMm,
  gutterMm,
  normalizePageSetup,
  outerReserveMm,
  paperSizeMm,
  type PageSetup,
} from './page-setup'

const pageSetupArb: fc.Arbitrary<PageSetup> = fc.record({
  paper: fc.constantFrom('A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Tabloid', 'Custom'),
  customSize: fc
    .tuple(
      fc.double({ min: 50, max: 1200, noNaN: true }),
      fc.double({ min: 50, max: 1200, noNaN: true }),
    )
    .map(([a, b]) => ({ w: Math.min(a, b), h: Math.max(a, b) })),
  orientation: fc.constantFrom('auto', 'portrait', 'landscape'),
  safeAreaMm: fc.oneof(fc.double({ min: -5, max: 40, noNaN: true }), fc.constant(Number.NaN)),
  gutter: fc.record({ enabled: fc.boolean(), mm: fc.double({ min: 0, max: 40, noNaN: true }) }),
  cropMarks: fc.boolean(),
  bleed: fc.record({ enabled: fc.boolean(), mm: fc.double({ min: 0, max: 20, noNaN: true }) }),
})

describe('constants', () => {
  it('exports the comfort minimum used by layout and images', () => {
    expect(MIN_COMFORT_SHORT_SIDE_MM).toBe(60)
    expect(MIN_SAFE_AREA_MM).toBe(3)
  })
})

describe('DEFAULT_PAGE_SETUP', () => {
  it('matches decisions D2/D3 and the contract', () => {
    expect(DEFAULT_PAGE_SETUP).toEqual({
      paper: 'A4',
      customSize: { w: 210, h: 297 },
      orientation: 'auto',
      safeAreaMm: 5,
      gutter: { enabled: true, mm: 6 },
      cropMarks: true,
      bleed: { enabled: false, mm: 3 },
    })
  })

  it('is already normalised', () => {
    expect(normalizePageSetup(DEFAULT_PAGE_SETUP)).toEqual({ setup: DEFAULT_PAGE_SETUP, notes: [] })
  })
})

describe('normalizePageSetup', () => {
  it('raises a too-small safe area', () => {
    const r = normalizePageSetup({ ...DEFAULT_PAGE_SETUP, safeAreaMm: 1 })
    expect(r.setup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
    expect(r.notes).toEqual(['safe-area-raised-to-minimum'])
  })

  it('treats a NaN safe area as below the minimum', () => {
    const r = normalizePageSetup({ ...DEFAULT_PAGE_SETUP, safeAreaMm: Number.NaN })
    expect(r.setup.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
  })

  it('enables the gutter when bleed is on', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: false, mm: 8 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 8 })
    expect(r.notes).toEqual(['gutter-enabled-for-bleed'])
  })

  it('raises the gutter to twice the bleed and never lowers the bleed', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: true, mm: 4 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(r.setup.bleed).toEqual({ enabled: true, mm: 3 })
    expect(r.notes).toEqual(['gutter-raised-for-bleed'])
  })

  it('reports both gutter notes when a disabled gutter is also too small', () => {
    const r = normalizePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: false, mm: 1 },
      bleed: { enabled: true, mm: 3 },
    })
    expect(r.setup.gutter).toEqual({ enabled: true, mm: 6 })
    expect(r.notes).toEqual(['gutter-enabled-for-bleed', 'gutter-raised-for-bleed'])
  })

  it('leaves the gutter alone when bleed is off', () => {
    const input = { ...DEFAULT_PAGE_SETUP, gutter: { enabled: false, mm: 0 } }
    expect(normalizePageSetup(input).setup.gutter).toEqual({ enabled: false, mm: 0 })
  })

  it('is idempotent and reports nothing the second time (property)', () => {
    fc.assert(
      fc.property(pageSetupArb, (setup) => {
        const once = normalizePageSetup(setup)
        const twice = normalizePageSetup(once.setup)
        expect(twice.setup).toEqual(once.setup)
        expect(twice.notes).toEqual([])
      }),
    )
  })

  it('always satisfies the invariants and never touches other fields (property)', () => {
    fc.assert(
      fc.property(pageSetupArb, (setup) => {
        const { setup: out } = normalizePageSetup(setup)
        expect(out.safeAreaMm).toBeGreaterThanOrEqual(MIN_SAFE_AREA_MM)
        if (out.bleed.enabled) {
          expect(out.gutter.enabled).toBe(true)
          expect(out.gutter.mm).toBeGreaterThanOrEqual(2 * out.bleed.mm)
        }
        expect(out.bleed).toEqual(setup.bleed)
        expect(out.paper).toBe(setup.paper)
        expect(out.customSize).toEqual(setup.customSize)
        expect(out.orientation).toBe(setup.orientation)
        expect(out.cropMarks).toBe(setup.cropMarks)
        // The gutter only ever grows.
        if (setup.gutter.enabled) expect(out.gutter.mm).toBeGreaterThanOrEqual(setup.gutter.mm)
      }),
    )
  })
})

describe('paperSizeMm', () => {
  it('returns the preset size for presets and customSize for Custom', () => {
    expect(paperSizeMm(DEFAULT_PAGE_SETUP)).toEqual({ w: 210, h: 297 })
    expect(paperSizeMm({ ...DEFAULT_PAGE_SETUP, paper: 'Letter' })).toEqual({ w: 215.9, h: 279.4 })
    expect(
      paperSizeMm({ ...DEFAULT_PAGE_SETUP, paper: 'Custom', customSize: { w: 100, h: 150 } }),
    ).toEqual({ w: 100, h: 150 })
  })
})

describe('outerReserveMm / gutterMm', () => {
  it('adds bleed and crop-mark space (D2)', () => {
    expect(CROP_MARK_LENGTH_MM + CROP_MARK_OFFSET_MM).toBe(5)
    expect(outerReserveMm(DEFAULT_PAGE_SETUP)).toBe(5)
    expect(outerReserveMm({ ...DEFAULT_PAGE_SETUP, cropMarks: false })).toBe(0)
    expect(outerReserveMm({ ...DEFAULT_PAGE_SETUP, bleed: { enabled: true, mm: 3 } })).toBe(8)
    expect(
      outerReserveMm({ ...DEFAULT_PAGE_SETUP, cropMarks: false, bleed: { enabled: true, mm: 3 } }),
    ).toBe(3)
  })

  it('reads the gutter only when enabled', () => {
    expect(gutterMm(DEFAULT_PAGE_SETUP)).toBe(6)
    expect(gutterMm({ ...DEFAULT_PAGE_SETUP, gutter: { enabled: false, mm: 6 } })).toBe(0)
  })
})

describe('contentBoxMm', () => {
  it('insets the page by safe area + reserve', () => {
    expect(contentBoxMm(DEFAULT_PAGE_SETUP, { w: 210, h: 297 })).toEqual({
      x: 10,
      y: 10,
      w: 190,
      h: 277,
    })
  })

  it('never has a negative size, even on a tiny page (property)', () => {
    fc.assert(
      fc.property(
        pageSetupArb,
        fc.double({ min: 0, max: 1200, noNaN: true }),
        fc.double({ min: 0, max: 1200, noNaN: true }),
        (setup, w, h) => {
          const box = contentBoxMm(normalizePageSetup(setup).setup, { w, h })
          expect(box.w).toBeGreaterThanOrEqual(0)
          expect(box.h).toBeGreaterThanOrEqual(0)
          expect(box.x).toBeGreaterThanOrEqual(MIN_SAFE_AREA_MM)
        },
      ),
    )
  })
})
