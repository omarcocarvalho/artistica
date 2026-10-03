import { describe, expect, it } from 'vitest'
import * as t from './tolerances'

describe('tolerances', () => {
  it('keeps the epsilons ordered: float error << EPS_MM < score eps < search tolerance', () => {
    expect(t.EPS_MM).toBeLessThan(t.SCORE_SHORT_SIDE_EPS_MM)
    expect(t.SCORE_SHORT_SIDE_EPS_MM).toBeLessThan(t.SEARCH_TOLERANCE_MM)
    expect(t.SCORE_FILL_EPS).toBeGreaterThan(0)
  })
  it('lets the bisection cap exceed the steps needed for a 1200 mm span', () => {
    expect(t.MAX_SEARCH_STEPS).toBeGreaterThan(Math.log2(1200 / t.SEARCH_TOLERANCE_MM))
    expect(t.LADDER_STEPS).toBeGreaterThan(1)
    expect(t.MIN_CONTENT_SIDE_MM).toBe(1)
    expect(t.SUGGEST_REFERENCE_ASPECT).toBe(1.5)
  })
})
