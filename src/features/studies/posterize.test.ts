import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { lightness8, type Rgb8 } from '../../shared/colour/oklch'
import { LIGHTNESS_BINS, VALUE_CLIP, lightnessRange, posterizeRGBA, valueIndex } from './posterize'
import { valueRamp } from './ramp'
import { distinctColours, key, lightnessRampImage } from './test-support/lightness'
import { noise, solid } from './test-support/pixels'

const SEPIA = (count: number) => valueRamp({ count, hue: 55, neutral: false })

describe('valueIndex', () => {
  const range = { lo: 0.2, hi: 0.8 }
  it('puts each edge at lo + j(hi − lo)/N, an edge pixel going up', () => {
    for (const n of [2, 3, 5, 20]) {
      for (let j = 1; j < n; j++) {
        const edge = range.lo + (j * (range.hi - range.lo)) / n
        expect(valueIndex(edge - 1e-9, range, n)).toBe(j - 1)
        expect(valueIndex(edge + 1e-9, range, n)).toBe(j)
      }
    }
  })
  it('sends a value exactly on an edge to the upper value', () => {
    expect(valueIndex(0.5, { lo: 0, hi: 1 }, 2)).toBe(1)
    expect(valueIndex(0.25, { lo: 0, hi: 1 }, 4)).toBe(1)
  })
  it('clamps below lo and above hi', () => {
    expect(valueIndex(0, range, 5)).toBe(0)
    expect(valueIndex(1, range, 5)).toBe(4)
    expect(valueIndex(range.hi, range, 5)).toBe(4)
  })
  it('maps a degenerate range to the middle value', () => {
    expect(valueIndex(0.5, { lo: 0.5, hi: 0.5 }, 5)).toBe(2)
    expect(valueIndex(0.5, { lo: 0.5, hi: 0.5 + 1e-7 }, 4)).toBe(2)
  })
})

describe('lightnessRange', () => {
  it('spans a full ramp image', () => {
    const r = lightnessRange(lightnessRampImage(1000, 2, 0.3, 0.9), 1000, 2)
    expect(r.lo).toBeCloseTo(0.3, 1.5)
    expect(r.hi).toBeCloseTo(0.9, 1.5)
  })
  it('clips the brightest and darkest 1% before splitting', () => {
    // 98% mid-grey ramp between 0.4 and 0.6, 1% black and 1% white specks.
    const w = 100
    const h = 100
    const base = lightnessRampImage(w, h, 0.4, 0.6)
    for (let i = 0; i < w * h; i++) {
      if (i % 100 === 0) base.set([0, 0, 0], i * 4)
      if (i % 100 === 50) base.set([255, 255, 255], i * 4)
    }
    const r = lightnessRange(base, w, h)
    expect(r.lo).toBeGreaterThan(0.39)
    expect(r.hi).toBeLessThan(0.61)
    expect(VALUE_CLIP).toBe(0.01)
  })
  it('keeps the extremes when they are more than 1% of the pixels', () => {
    const w = 100
    const h = 100
    const base = lightnessRampImage(w, h, 0.4, 0.6)
    for (let i = 0; i < w * h; i++) {
      if (i % 50 === 0) base.set([0, 0, 0], i * 4)
      if (i % 50 === 25) base.set([255, 255, 255], i * 4)
    }
    const r = lightnessRange(base, w, h)
    expect(r.lo).toBe(0)
    expect(r.hi).toBe(1)
  })
  it('clips floor(1%) of the pixels at each end', () => {
    // 150 px: floor(1.5) = 1 pixel clipped at each end.
    const speckled = (specks: number): Uint8ClampedArray => {
      const d = lightnessRampImage(150, 1, 0.4, 0.6)
      for (let i = 0; i < specks; i++) {
        d.set([0, 0, 0], i * 4 * 7)
        d.set([255, 255, 255], (i * 7 + 3) * 4)
      }
      return d
    }
    const one = lightnessRange(speckled(1), 150, 1)
    expect(one.lo).toBeGreaterThan(0.39)
    expect(one.hi).toBeLessThan(0.61)
    expect(lightnessRange(speckled(2), 150, 1)).toEqual({ lo: 0, hi: 1 })
  })
  it('a dark photo still uses every value (owner Q11, default)', () => {
    const dark = lightnessRampImage(500, 2, 0.15, 0.35)
    const ramp = SEPIA(5)
    posterizeRGBA(dark, 500, 2, ramp, lightnessRange(dark, 500, 2))
    expect(distinctColours(dark).size).toBe(5)
  })
  it('ends on 1/1024 bin edges', () => {
    expect(LIGHTNESS_BINS).toBe(1024)
    const r = lightnessRange(noise(32, 32, 5), 32, 32)
    expect(Number.isInteger(r.lo * 1024)).toBe(true)
    expect(Number.isInteger(r.hi * 1024)).toBe(true)
  })
  it('is degenerate when every kept pixel falls in one bin', () => {
    const r = lightnessRange(solid(4, 4, [119, 119, 119]), 4, 4)
    expect(r.hi).toBe(r.lo)
    const bin = Math.floor(lightness8(119, 119, 119) * LIGHTNESS_BINS)
    expect(r.lo).toBe((bin + 0.5) / LIGHTNESS_BINS)
  })
  it('returns 0..1 for an empty image', () => {
    expect(lightnessRange(new Uint8ClampedArray(0), 0, 0)).toEqual({ lo: 0, hi: 1 })
  })
})

describe('posterizeRGBA', () => {
  it('outputs exactly N ramp colours on a full gradient (spec §7)', () => {
    for (let n = 2; n <= 20; n++) {
      const d = lightnessRampImage(2000, 1)
      const ramp = SEPIA(n)
      posterizeRGBA(d, 2000, 1, ramp, lightnessRange(d, 2000, 1))
      const colours = distinctColours(d)
      expect(colours.size).toBe(n)
      expect([...colours].sort()).toEqual(ramp.map(key).sort())
    }
  })

  it('two values split at the midpoint (notan)', () => {
    const d = lightnessRampImage(1000, 1, 0.3, 0.9)
    const range = lightnessRange(d, 1000, 1)
    const ramp = SEPIA(2)
    const src = d.slice()
    posterizeRGBA(d, 1000, 1, ramp, range)
    const mid = (range.lo + range.hi) / 2
    for (let i = 0; i < 1000; i++) {
      const L = lightness8(src[i * 4] ?? 0, src[i * 4 + 1] ?? 0, src[i * 4 + 2] ?? 0)
      const want: Rgb8 | undefined = L < mid ? ramp[0] : ramp[1]
      expect([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]).toEqual([want?.r, want?.g, want?.b])
    }
  })

  it('a flat image maps to one middle value', () => {
    const d = solid(10, 10, [90, 120, 60])
    const ramp = SEPIA(5)
    posterizeRGBA(d, 10, 10, ramp, lightnessRange(d, 10, 10))
    expect([...distinctColours(d)]).toEqual([key(ramp[2] ?? { r: 0, g: 0, b: 0 })])
  })

  it('keeps darker pixels on darker values (monotone, property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), fc.integer({ min: 2, max: 20 }), (seed, n) => {
        const d = noise(16, 16, seed)
        const src = d.slice()
        const ramp = SEPIA(n)
        const index = new Map(ramp.map((c, i) => [key(c), i]))
        posterizeRGBA(d, 16, 16, ramp, lightnessRange(d, 16, 16))
        const pairs = Array.from({ length: 256 }, (_, i) => ({
          L: lightness8(src[i * 4] ?? 0, src[i * 4 + 1] ?? 0, src[i * 4 + 2] ?? 0),
          k: index.get(`${String(d[i * 4])},${String(d[i * 4 + 1])},${String(d[i * 4 + 2])}`) ?? -1,
        })).sort((a, b) => a.L - b.L)
        for (let i = 1; i < pairs.length; i++) {
          expect(pairs[i]?.k ?? -1).toBeGreaterThanOrEqual(pairs[i - 1]?.k ?? 99)
        }
        expect(pairs.every((p) => p.k >= 0)).toBe(true)
      }),
    )
  })

  it('sets alpha to 255', () => {
    const d = solid(3, 3, [200, 10, 10])
    d[3] = 0
    posterizeRGBA(d, 3, 3, SEPIA(3), { lo: 0, hi: 1 })
    expect(d[3]).toBe(255)
  })

  it('writes in place and allocates no pixel-sized buffer', () => {
    const w = 256
    const h = 256
    const d = lightnessRampImage(w, h)
    const ramp = SEPIA(5)
    const range = lightnessRange(d, w, h)
    const before = d
    const typed = [Float32Array, Float64Array, Uint8ClampedArray, Uint8Array, Uint32Array]
    const made: number[] = []
    let copyCalls = -1
    const typedProto = Object.getPrototypeOf(Uint8Array.prototype) as Uint8Array
    const copies = [
      vi.spyOn(typedProto, 'slice'),
      vi.spyOn(typedProto, 'map'),
      vi.spyOn(typedProto, 'filter'),
      vi.spyOn(Array, 'from'),
    ]
    try {
      for (const T of typed) {
        Object.defineProperty(globalThis, T.name, {
          configurable: true,
          value: new Proxy(T, {
            construct(target, args: unknown[]): object {
              made.push(typeof args[0] === 'number' ? args[0] : Infinity)
              return Reflect.construct(target, args) as object
            },
          }),
        })
      }
      posterizeRGBA(d, w, h, ramp, range)
      lightnessRange(d, w, h)
    } finally {
      copyCalls = copies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)
      for (const spy of copies) spy.mockRestore()
      for (const T of typed)
        Object.defineProperty(globalThis, T.name, { configurable: true, value: T })
    }
    expect(d).toBe(before)
    expect(made.every((n) => n <= LIGHTNESS_BINS)).toBe(true)
    expect(copyCalls).toBe(0)
    expect(distinctColours(d).size).toBe(5)
  })
})
