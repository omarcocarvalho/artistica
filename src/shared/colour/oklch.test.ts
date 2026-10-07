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
  it('maxChroma is in gamut and 1e-3 more is not (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.97, noNaN: true }),
        fc.double({ min: 0, max: 359.99, noNaN: true }),
        (L, h) => {
          const c = maxChroma(L, h)
          expect(c).toBeGreaterThanOrEqual(0)
          expect(inSrgbGamut(L, c, h)).toBe(true)
          expect(inSrgbGamut(L, c + 1e-3, h)).toBe(false)
        },
      ),
    )
  })
  it('is 0 at the ends of the lightness axis', () => {
    expect(maxChroma(0, 120)).toBe(0)
    expect(maxChroma(1, 120)).toBe(0)
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
