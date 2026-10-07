import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  inSrgbGamut,
  lightness8,
  linearRgbToOklab,
  linearToSrgb8,
  maxChroma,
  oklabToLinearRgb,
  oklchToOklab,
  oklchToRgb8,
  srgb8ToLinear,
} from './oklch'

const byte = fc.integer({ min: 0, max: 255 })
const lab8 = (r: number, g: number, b: number) =>
  linearRgbToOklab(srgb8ToLinear(r), srgb8ToLinear(g), srgb8ToLinear(b))
const chroma = (a: number, b: number) => Math.hypot(a, b)
const hueDeg = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360

describe('sRGB transfer', () => {
  it('round-trips every 8-bit level', () => {
    for (let c = 0; c <= 255; c++) expect(linearToSrgb8(srgb8ToLinear(c))).toBe(c)
  })
  it('has the standard end points and knee', () => {
    expect(srgb8ToLinear(0)).toBe(0)
    expect(srgb8ToLinear(255)).toBeCloseTo(1, 12)
    expect(srgb8ToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 12) // below the 0.04045 knee
    expect(srgb8ToLinear(128)).toBeCloseTo(0.2158605, 6)
    expect(srgb8ToLinear(11)).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 12) // above the knee
  })
  it('decodes a value that is not an integer level with the same curve', () => {
    expect(srgb8ToLinear(127.5)).toBeCloseTo(((127.5 / 255 + 0.055) / 1.055) ** 2.4, 12)
    expect(srgb8ToLinear(127.5)).toBeGreaterThan(srgb8ToLinear(127))
    expect(srgb8ToLinear(127.5)).toBeLessThan(srgb8ToLinear(128))
  })
  it('clamps out-of-range linear values', () => {
    expect(linearToSrgb8(-0.2)).toBe(0)
    expect(linearToSrgb8(1.7)).toBe(255)
  })
})

describe('OKLab', () => {
  it('matches the reference values', () => {
    const white = lab8(255, 255, 255)
    expect(white.L).toBeCloseTo(1, 4)
    expect(white.a).toBeCloseTo(0, 4)
    expect(white.b).toBeCloseTo(0, 4)
    expect(lab8(0, 0, 0).L).toBe(0)
    const red = lab8(255, 0, 0)
    expect(red.L).toBeCloseTo(0.62796, 4)
    expect(chroma(red.a, red.b)).toBeCloseTo(0.25768, 4)
    expect(hueDeg(red.a, red.b)).toBeCloseTo(29.23, 1)
    expect(lab8(0, 255, 0).L).toBeCloseTo(0.86644, 4)
    expect(lab8(0, 0, 255).L).toBeCloseTo(0.45201, 4)
  })
  it('matches high-precision reference values for the sRGB primaries', () => {
    const cases = [
      { rgb: [1, 0, 0], L: 0.6279553606145516, C: 0.25768330773615683, h: 29.2338851923426 },
      { rgb: [0, 1, 0], L: 0.8664396115356694, C: 0.2948272403370167, h: 142.49533888780996 },
      { rgb: [0, 0, 1], L: 0.4520137183853429, C: 0.31321437166460125, h: 264.052020638055 },
    ] as const
    for (const { rgb, L, C, h } of cases) {
      const [r, g, b] = rgb
      const lab = linearRgbToOklab(r, g, b)
      expect(lab.L).toBeCloseTo(L, 10)
      expect(chroma(lab.a, lab.b)).toBeCloseTo(C, 10)
      expect(hueDeg(lab.a, lab.b)).toBeCloseTo(h, 8)
    }
  })
  it('oklabToLinearRgb inverts linearRgbToOklab (property)', () => {
    const unit = fc.double({ min: 0, max: 1, noNaN: true })
    fc.assert(
      fc.property(unit, unit, unit, (r, g, b) => {
        const [r2, g2, b2] = oklabToLinearRgb(linearRgbToOklab(r, g, b))
        expect(Math.abs(r2 - r)).toBeLessThan(1e-6)
        expect(Math.abs(g2 - g)).toBeLessThan(1e-6)
        expect(Math.abs(b2 - b)).toBeLessThan(1e-6)
      }),
      { numRuns: 10_000 },
    )
  })
  it('gives greys zero chroma', () => {
    for (let c = 0; c <= 255; c += 17) {
      const g = lab8(c, c, c)
      expect(chroma(g.a, g.b)).toBeLessThan(1e-4)
    }
  })
  it('is increasing in lightness along the grey axis', () => {
    let last = -1
    for (let c = 0; c <= 255; c++) {
      const L = lab8(c, c, c).L
      expect(L).toBeGreaterThan(last)
      last = L
    }
  })
  it('round-trips sRGB → OKLab → sRGB within one level (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        const [lr, lg, lb] = oklabToLinearRgb(lab8(r, g, b))
        expect(Math.abs(linearToSrgb8(lr) - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(linearToSrgb8(lg) - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(linearToSrgb8(lb) - b)).toBeLessThanOrEqual(1)
      }),
      { numRuns: 10_000 },
    )
  })
  it('converts OKLCH polar coordinates', () => {
    const lab = oklchToOklab(0.5, 0.1, 90)
    expect(lab).toEqual({
      L: 0.5,
      a: expect.closeTo(0, 12) as number,
      b: expect.closeTo(0.1, 12) as number,
    })
  })
})

describe('lightness8', () => {
  it('equals linearRgbToOklab L (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        expect(lightness8(r, g, b)).toBeCloseTo(lab8(r, g, b).L, 12)
      }),
    )
  })
})

describe('gamut', () => {
  it('knows sRGB primaries are in gamut and wild chroma is not', () => {
    const red = lab8(255, 0, 0)
    expect(inSrgbGamut(red.L, chroma(red.a, red.b) - 1e-4, hueDeg(red.a, red.b))).toBe(true)
    expect(inSrgbGamut(0.5, 0.4, 200)).toBe(false)
    expect(inSrgbGamut(0.5, 0, 0)).toBe(true)
  })
  it('allows each linear channel 1e-6 outside [0, 1] and no more', () => {
    // A grey's linear channels all equal L³, so L picks the channel value exactly.
    expect(inSrgbGamut(Math.cbrt(1 + 5e-7), 0, 0)).toBe(true)
    expect(inSrgbGamut(Math.cbrt(1 + 2e-6), 0, 0)).toBe(false)
    expect(inSrgbGamut(-Math.cbrt(5e-7), 0, 0)).toBe(true)
    expect(inSrgbGamut(-Math.cbrt(2e-6), 0, 0)).toBe(false)
  })
  it('maxChroma is in gamut and 1e-5 more is not (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, minExcluded: true, maxExcluded: true, noNaN: true }),
        fc.double({ min: 0, max: 359.99, noNaN: true }),
        (L, h) => {
          const c = maxChroma(L, h)
          expect(c).toBeGreaterThanOrEqual(0)
          expect(inSrgbGamut(L, c, h)).toBe(true)
          expect(inSrgbGamut(L, c + 1e-5, h)).toBe(false)
        },
      ),
      { numRuns: 2_000 },
    )
  })
  it('maxChroma holds next to the ends of the lightness axis', () => {
    for (const L of [1e-9, 1 - 1e-9]) {
      for (let h = 0; h < 360; h += 15) {
        const c = maxChroma(L, h)
        expect(inSrgbGamut(L, c, h)).toBe(true)
        expect(inSrgbGamut(L, c + 1e-5, h)).toBe(false)
      }
    }
  })
  it('maxChroma reaches the most saturated sRGB colour', () => {
    const magenta = linearRgbToOklab(1, 0, 1)
    const c = maxChroma(magenta.L, hueDeg(magenta.a, magenta.b))
    expect(Math.abs(c - chroma(magenta.a, magenta.b))).toBeLessThan(1e-5)
  })
  it('is 0 at the ends of the lightness axis', () => {
    expect(maxChroma(0, 120)).toBe(0)
    expect(maxChroma(1, 120)).toBe(0)
    expect(maxChroma(-0.1, 120)).toBe(0)
    expect(maxChroma(1.5, 120)).toBe(0)
  })
})

describe('oklchToRgb8', () => {
  it('maps greys to equal channels and clamps', () => {
    const g = oklchToRgb8(0.6, 0, 0)
    expect(g.r).toBe(g.g)
    expect(g.g).toBe(g.b)
    const wild = oklchToRgb8(0.7, 0.4, 150)
    for (const c of [wild.r, wild.g, wild.b]) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
  it('lands within one level of the original when in gamut (property)', () => {
    fc.assert(
      fc.property(byte, byte, byte, (r, g, b) => {
        const lab = lab8(r, g, b)
        const out = oklchToRgb8(lab.L, chroma(lab.a, lab.b), hueDeg(lab.a, lab.b))
        expect(Math.abs(out.r - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.g - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(out.b - b)).toBeLessThanOrEqual(1)
      }),
    )
  })
})
