import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { edgeParams } from './detail'

describe('edgeParams (M4-R16)', () => {
  it('maps 1, 50 and 100 to the pinned parameters', () => {
    expect(edgeParams(1)).toEqual({ blurPasses: 3, keepShare: 0.03, minChainPx: 48 })
    expect(edgeParams(50)).toEqual({ blurPasses: 2, keepShare: 0.114, minChainPx: 27 })
    expect(edgeParams(100)).toEqual({ blurPasses: 0, keepShare: 0.2, minChainPx: 6 })
  })

  it('follows the table formula at every integer detail', () => {
    for (let d = 1; d <= 100; d++) {
      const t = (d - 1) / 99
      expect(edgeParams(d)).toEqual({
        blurPasses: 3 - Math.floor(3 * t + 1e-12),
        keepShare: Math.round((0.03 + 0.17 * t) * 1000) / 1000,
        minChainPx: Math.round(48 - 42 * t),
      })
    }
    expect(edgeParams(34).blurPasses).toBe(2)
    expect(edgeParams(33).blurPasses).toBe(3)
    expect(edgeParams(67).blurPasses).toBe(1)
    expect(edgeParams(99).blurPasses).toBe(1)
  })

  it('clamps and rounds outside 1–100', () => {
    expect(edgeParams(0)).toEqual(edgeParams(1))
    expect(edgeParams(-40)).toEqual(edgeParams(1))
    expect(edgeParams(-Infinity)).toEqual(edgeParams(1))
    expect(edgeParams(101)).toEqual(edgeParams(100))
    expect(edgeParams(1e9)).toEqual(edgeParams(100))
    expect(edgeParams(Infinity)).toEqual(edgeParams(100))
    expect(edgeParams(49.6)).toEqual(edgeParams(50))
    expect(edgeParams(50.4)).toEqual(edgeParams(50))
    expect(edgeParams(1.4)).toEqual(edgeParams(1))
    expect(edgeParams(Number.NaN)).toEqual(edgeParams(50))
  })

  it('is monotonic', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 150, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (a, step) => {
          const lo = edgeParams(a)
          const hi = edgeParams(a + step)
          expect(hi.blurPasses).toBeLessThanOrEqual(lo.blurPasses)
          expect(hi.keepShare).toBeGreaterThanOrEqual(lo.keepShare)
          expect(hi.minChainPx).toBeLessThanOrEqual(lo.minChainPx)
        },
      ),
    )
  })
})
