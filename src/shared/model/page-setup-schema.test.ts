import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, MIN_SAFE_AREA_MM, normalizePageSetup } from './page-setup'
import { parsePageSetup } from './page-setup-schema'

describe('parsePageSetup', () => {
  it('keeps a valid page setup', () => {
    const setup = { ...DEFAULT_PAGE_SETUP, paper: 'Letter' as const, safeAreaMm: 8 }
    expect(parsePageSetup(setup)).toEqual(setup)
  })

  it.each([undefined, null, 'A4', 42, [1]])('gives the default for %s', (raw) => {
    expect(parsePageSetup(raw)).toEqual(DEFAULT_PAGE_SETUP)
  })

  it('defaults one bad field alone and strips unknown keys', () => {
    const out = parsePageSetup({
      ...DEFAULT_PAGE_SETUP,
      paper: 'A3',
      orientation: 'sideways',
      x: 1,
    })
    expect(out).toEqual({ ...DEFAULT_PAGE_SETUP, paper: 'A3' })
  })

  it('portrait-normalises the custom size and applies the page-setup rules', () => {
    const out = parsePageSetup({
      ...DEFAULT_PAGE_SETUP,
      customSize: { w: 300, h: 200 },
      safeAreaMm: 1,
    })
    expect(out.customSize).toEqual({ w: 200, h: 300 })
    expect(out.safeAreaMm).toBe(MIN_SAFE_AREA_MM)
  })

  it('stores a negative zero length as 0, so the page setup survives a JSON round trip', () => {
    const out = parsePageSetup({
      ...DEFAULT_PAGE_SETUP,
      gutter: { enabled: true, mm: -0 },
      bleed: { enabled: false, mm: -0 },
    })
    expect(Object.is(out.gutter.mm, 0)).toBe(true)
    expect(Object.is(out.bleed.mm, 0)).toBe(true)
  })

  it('never throws and always gives a normalised page setup (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const out = parsePageSetup(raw)
        expect(normalizePageSetup(out).notes).toEqual([])
        expect(out.customSize.w).toBeLessThanOrEqual(out.customSize.h)
      }),
    )
  })
})
