import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  blurSigmaPx,
  boxRadiiForGauss,
  EXACT_GAUSSIAN_BELOW_SIGMA,
  gaussianBlurRGBA,
  gaussianTaps,
  MIN_SIGMA_PX,
} from './blur'
import { channelMean, channelRange, noise, rgba, solid } from './test-support/pixels'

const variance = (radii: readonly number[]) =>
  radii.reduce((s, r) => s + ((2 * r + 1) ** 2 - 1) / 12, 0)

const tapsSum = (t: Float64Array) => t.reduce((s, v, k) => s + (k === 0 ? v : 2 * v), 0)
const tapsVariance = (t: Float64Array) => t.reduce((s, v, k) => s + 2 * k * k * v, 0)

/** Variance of the kernel a blur applies, read off the slope of a blurred hard edge in one row. */
function edgeSpread(sigma: number, w = 160): { mass: number; spread: number; maxStep: number } {
  const d = rgba(w, 1, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]))
  gaussianBlurRGBA(d, w, 1, sigma)
  const slope = Array.from({ length: w - 1 }, (_, x) => (d[(x + 1) * 4] ?? 0) - (d[x * 4] ?? 0))
  const mass = slope.reduce((a, b) => a + b, 0)
  const mean = slope.reduce((a, s, x) => a + s * x, 0) / mass
  const spread = slope.reduce((a, s, x) => a + s * (x - mean) ** 2, 0) / mass
  return { mass, spread, maxStep: Math.max(...slope) }
}

describe('blurSigmaPx (M2-R6)', () => {
  it('scales with the short side, linearly in percent', () => {
    expect(blurSigmaPx(100, 400, 300)).toBeCloseTo(15, 12) // 5% of 300
    expect(blurSigmaPx(40, 300, 400)).toBeCloseTo(6, 12) // 40% of 5% of 300
    expect(blurSigmaPx(20, 3000, 4000)).toBeCloseTo(10 * blurSigmaPx(20, 300, 400), 12)
    expect(blurSigmaPx(50, 400, 300)).toBeCloseTo(blurSigmaPx(100, 400, 300) / 2, 12)
  })
})

describe('boxRadiiForGauss', () => {
  it('three boxes approximate the Gaussian variance', () => {
    // Widening one box from wl to wl + 2 adds (wl + 1) / 3 to the variance, so the nearest
    // choice is off by at most half that step: within 5% of σ² once σ ≥ 7.
    const halfStep = (radii: readonly number[]) => (Math.min(...radii) + 1) / 3
    for (const sigma of [1, 1.7, 2.5, 4, 6, 15, 40, 120]) {
      const radii = boxRadiiForGauss(sigma)
      expect(radii).toHaveLength(3)
      for (const r of radii) expect(Number.isInteger(r) && r >= 0).toBe(true)
      expect(Math.abs(variance(radii) - sigma ** 2)).toBeLessThanOrEqual(halfStep(radii) + 1e-9)
    }
    fc.assert(
      fc.property(fc.double({ min: 0.8, max: 300, noNaN: true }), (sigma) => {
        const radii = boxRadiiForGauss(sigma)
        expect(Math.abs(variance(radii) - sigma ** 2)).toBeLessThanOrEqual(halfStep(radii) + 1e-9)
        if (sigma >= 7) {
          expect(Math.abs(variance(radii) - sigma ** 2) / sigma ** 2).toBeLessThan(0.05)
        }
      }),
    )
  })
  it('never returns negative radii for tiny sigmas', () => {
    for (const sigma of [0.25, 0.4, 0.6, 0.9]) {
      for (const r of boxRadiiForGauss(sigma)) expect(r).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('gaussianBlurRGBA', () => {
  it('keeps a constant image constant', () => {
    const d = solid(37, 23, [120, 30, 200])
    gaussianBlurRGBA(d, 37, 23, 9)
    expect(d).toEqual(solid(37, 23, [120, 30, 200]))
  })

  it('is a no-op below the floor, where a hard edge would move by less than half a level', () => {
    const d = noise(20, 20, 1)
    const before = d.slice()
    gaussianBlurRGBA(d, 20, 20, MIN_SIGMA_PX * 0.99)
    expect(d).toEqual(before)
    expect(edgeSpread(MIN_SIGMA_PX * 0.99).maxStep).toBe(255)
    expect(edgeSpread(0.07).maxStep).toBeLessThan(255)
  })

  it('softens a hard edge at every σ above the floor', () => {
    for (let sigma = 0.07; sigma < 5; sigma += 0.01) {
      const { mass, maxStep } = edgeSpread(sigma)
      expect(mass).toBe(255)
      expect(maxStep).toBeLessThan(255)
    }
  })

  it('softens a hard edge visibly at 1% on a 90 × 60 mm print tile (709 px short side)', () => {
    const w = 1063
    const h = 709
    const sigma = blurSigmaPx(1, w, h)
    const d = rgba(w, h, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]))
    gaussianBlurRGBA(d, w, h, sigma)
    const row = Math.floor(h / 2) * w * 4
    let maxStep = 0
    for (let x = 0; x + 1 < w; x++) {
      maxStep = Math.max(maxStep, (d[row + (x + 1) * 4] ?? 0) - (d[row + x * 4] ?? 0))
    }
    expect(maxStep).toBeLessThan(235)
    expect(maxStep).toBeGreaterThan(150)
  })

  it('small σ: the kernel is a normalised Gaussian whose variance is exactly σ²', () => {
    for (let sigma = MIN_SIGMA_PX; sigma < EXACT_GAUSSIAN_BELOW_SIGMA; sigma += 0.013) {
      const t = gaussianTaps(sigma)
      expect(t.length).toBe(Math.max(1, Math.ceil(3 * sigma)) + 1)
      expect(tapsSum(t)).toBeCloseTo(1, 12)
      expect(Math.abs(tapsVariance(t) - sigma ** 2) / sigma ** 2).toBeLessThan(1e-9)
      for (let k = 1; k < t.length; k++) {
        expect(t[k]).toBeGreaterThan(0)
        expect(t[k]).toBeLessThan(t[k - 1] ?? 0)
      }
    }
  })

  it('small σ: a blurred edge spreads by σ², within 8-bit rounding', () => {
    for (const sigma of [0.3, 0.45, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 2.8, 3.4, 3.8]) {
      const { mass, spread } = edgeSpread(sigma)
      expect(mass).toBe(255)
      expect(Math.abs(spread - sigma ** 2)).toBeLessThan(0.03 * sigma ** 2 + 0.01)
    }
  })

  it('has no jump in effective σ where the exact Gaussian hands over to the boxes', () => {
    const c = EXACT_GAUSSIAN_BELOW_SIGMA
    expect(variance(boxRadiiForGauss(c))).toBeCloseTo(c ** 2, 9)
    const below = edgeSpread(c - 1e-6).spread
    const above = edgeSpread(c).spread
    expect(Math.abs(Math.sqrt(below) - Math.sqrt(above)) / c).toBeLessThan(0.01)
    for (let sigma = c; sigma < 60; sigma += 0.01) {
      expect(Math.abs(Math.sqrt(variance(boxRadiiForGauss(sigma))) / sigma - 1)).toBeLessThan(0.05)
    }
  })

  it('small σ: keeps a constant image constant and leaves alpha alone, in place', () => {
    for (const sigma of [0.1, 0.5, 1.5, 3.5]) {
      const d = solid(29, 17, [255, 0, 131])
      for (let i = 3; i < d.length; i += 4) d[i] = (i * 13) % 256
      const alpha = d.filter((_, i) => i % 4 === 3)
      const same = d
      gaussianBlurRGBA(d, 29, 17, sigma)
      expect(d).toBe(same)
      for (let i = 0; i < d.length; i += 4)
        expect([d[i], d[i + 1], d[i + 2]]).toEqual([255, 0, 131])
      expect(d.filter((_, i) => i % 4 === 3)).toEqual(alpha)
    }
  })

  it('large σ: applies all three boxes, so a hard edge spreads by the composed kernel', () => {
    // One row: the vertical passes are the identity, and the edge's slope is the composed kernel.
    for (const sigma of [EXACT_GAUSSIAN_BELOW_SIGMA, 6, 13]) {
      const w = 240
      const d = rgba(w, 1, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]))
      gaussianBlurRGBA(d, w, 1, sigma)
      const slope = Array.from({ length: w - 1 }, (_, x) => (d[(x + 1) * 4] ?? 0) - (d[x * 4] ?? 0))
      const mass = slope.reduce((a, b) => a + b, 0)
      const mean = slope.reduce((a, s, x) => a + s * x, 0) / mass
      const spread = slope.reduce((a, s, x) => a + s * (x - mean) ** 2, 0) / mass
      const expected = variance(boxRadiiForGauss(sigma))
      expect(mass).toBe(255)
      expect(Math.abs(spread - expected) / expected).toBeLessThan(0.05)
    }
  })

  it('blurs R, G and B the same way', () => {
    const w = 19
    const h = 13
    const d = noise(w, h, 6)
    const rotated = rgba(w, h, (x, y) => {
      const i = (y * w + x) * 4
      return [d[i + 1] ?? 0, d[i + 2] ?? 0, d[i] ?? 0]
    })
    const before = d.slice()
    gaussianBlurRGBA(d, w, h, 2)
    gaussianBlurRGBA(rotated, w, h, 2)
    for (let i = 0; i < d.length; i += 4) {
      expect([rotated[i], rotated[i + 1], rotated[i + 2]]).toEqual([d[i + 1], d[i + 2], d[i]])
    }
    for (const c of [0, 1, 2]) {
      expect(channelRange(d, c).max - channelRange(d, c).min).toBeLessThan(
        channelRange(before, c).max - channelRange(before, c).min,
      )
    }
  })

  it('never touches alpha', () => {
    const d = noise(16, 16, 2)
    for (let i = 3; i < d.length; i += 4) d[i] = i % 7 === 0 ? 10 : 255
    const alpha = d.filter((_, i) => i % 4 === 3)
    gaussianBlurRGBA(d, 16, 16, 3)
    expect(d.filter((_, i) => i % 4 === 3)).toEqual(alpha)
  })

  it('never widens the range of a channel (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 1e6 }),
        fc.double({ min: 0.05, max: 20, noNaN: true }),
        (w, h, seed, sigma) => {
          const d = noise(w, h, seed)
          const before = [0, 1, 2].map((c) => channelRange(d, c))
          gaussianBlurRGBA(d, w, h, sigma)
          ;[0, 1, 2].forEach((c, k) => {
            const r = channelRange(d, c)
            expect(r.min).toBeGreaterThanOrEqual(before[k]?.min ?? 0)
            expect(r.max).toBeLessThanOrEqual(before[k]?.max ?? 255)
          })
        },
      ),
    )
  })

  it('keeps the average brightness (spec §7) when the border is constant', () => {
    // A noisy centre inside a constant ring wider than the total box reach: clamping changes nothing.
    const sigma = 4
    const reach = boxRadiiForGauss(sigma).reduce((a, b) => a + b, 0)
    const w = 80
    const h = 60
    const inner = noise(w, h, 3)
    const d = rgba(w, h, (x, y) => {
      const border = x < reach || y < reach || x >= w - reach || y >= h - reach
      const i = (y * w + x) * 4
      return border ? [128, 128, 128] : [inner[i] ?? 0, inner[i + 1] ?? 0, inner[i + 2] ?? 0]
    })
    const before = [0, 1, 2].map((c) => channelMean(d, c))
    gaussianBlurRGBA(d, w, h, sigma)
    ;[0, 1, 2].forEach((c, k) => {
      expect(Math.abs(channelMean(d, c) - (before[k] ?? 0))).toBeLessThanOrEqual(0.5)
    })
  })

  it('moves the average only through the edges, for any image (property)', () => {
    // Clamp-to-edge re-weights at most `reach` pixels at each end of every line, so the mean can
    // move by at most 255 · 2 · reach / n per axis, plus rounding (0.5 per pass, at most 6 passes).
    const reachOf = (sigma: number) =>
      sigma < EXACT_GAUSSIAN_BELOW_SIGMA
        ? gaussianTaps(sigma).length - 1
        : boxRadiiForGauss(sigma).reduce((a, b) => a + b, 0)
    fc.assert(
      fc.property(
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 0, max: 1e6 }),
        fc.double({ min: 0.1, max: 6, noNaN: true }),
        (w, h, seed, sigma) => {
          const reach = reachOf(sigma)
          const bound = 255 * 2 * reach * (1 / w + 1 / h) + 3
          const d = noise(w, h, seed)
          const before = channelMean(d, 0)
          gaussianBlurRGBA(d, w, h, sigma)
          expect(Math.abs(channelMean(d, 0) - before)).toBeLessThanOrEqual(bound)
        },
      ),
    )
  })

  it('handles 1-pixel-wide and 1-pixel-tall images', () => {
    const col = rgba(1, 9, (_, y) => [y * 30, 0, 0])
    gaussianBlurRGBA(col, 1, 9, 2)
    expect(channelRange(col, 0).max).toBeLessThanOrEqual(240)
    expect(channelRange(col, 0).min).toBeGreaterThanOrEqual(0)
    expect(col[0]).toBeGreaterThan(0)
    const row = rgba(9, 1, (x) => [x * 30, 0, 0])
    gaussianBlurRGBA(row, 9, 1, 2)
    expect(row[0]).toBeGreaterThan(0) // the edge took its neighbours in
  })

  it('actually blurs: a hard edge becomes a ramp', () => {
    const w = 64
    const d = rgba(w, 4, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]))
    gaussianBlurRGBA(d, w, 4, 4)
    const row = Array.from({ length: w }, (_, x) => d[x * 4] ?? 0)
    expect(row[0]).toBe(0)
    expect(row[w - 1]).toBe(255)
    expect(row[w / 2 - 1]).toBeGreaterThan(60)
    expect(row[w / 2]).toBeLessThan(195)
    for (let x = 1; x < w; x++) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1] ?? 0) // monotone
  })

  it('blurs columns the same way as rows', () => {
    const w = 23
    const h = 41
    const d = noise(w, h, 5)
    const t = rgba(h, w, (x, y) => {
      const i = (x * w + y) * 4
      return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]
    })
    gaussianBlurRGBA(d, w, h, 2.5)
    gaussianBlurRGBA(t, h, w, 2.5)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4] ?? 0
        const b = t[(x * h + y) * 4] ?? 0
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1) // pass order may differ by one level
      }
    }
    expect(channelRange(d, 0).max - channelRange(d, 0).min).toBeLessThan(200)
  })

  it('is symmetric: blurring a mirrored image gives the mirrored result', () => {
    const w = 31
    const h = 17
    const d = noise(w, h, 9)
    const m = rgba(w, h, (x, y) => {
      const i = (y * w + (w - 1 - x)) * 4
      return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]
    })
    gaussianBlurRGBA(d, w, h, 3)
    gaussianBlurRGBA(m, w, h, 3)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4] ?? 0
        const b = m[(y * w + (w - 1 - x)) * 4] ?? 0
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1) // rounding may differ by one level
      }
    }
  })
})
