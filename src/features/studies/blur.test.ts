import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { blurSigmaPx, boxRadiiForGauss, gaussianBlurRGBA } from './blur'
import { channelMean, channelRange, noise, rgba, solid } from './test-support/pixels'

const variance = (radii: readonly number[]) =>
  radii.reduce((s, r) => s + ((2 * r + 1) ** 2 - 1) / 12, 0)

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

  it('is a no-op below 0.25 px', () => {
    const d = noise(20, 20, 1)
    const before = d.slice()
    gaussianBlurRGBA(d, 20, 20, 0.2)
    expect(d).toEqual(before)
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
        fc.double({ min: 0.3, max: 20, noNaN: true }),
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
    // move by at most 255 · 2 · reach / n per axis, plus rounding (0.5 per pass, 6 passes).
    fc.assert(
      fc.property(
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 24, max: 64 }),
        fc.integer({ min: 0, max: 1e6 }),
        fc.double({ min: 0.3, max: 3, noNaN: true }),
        (w, h, seed, sigma) => {
          const reach = boxRadiiForGauss(sigma).reduce((a, b) => a + b, 0)
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
