import { describe, expect, it } from 'vitest'
import { applyStudy } from './apply-study'
import { noise } from './test-support/pixels'

/**
 * The desktop budget is 60 ms (overview, Performance budgets). The bound is the CI one, 5× that:
 * CI runners and busy desktops are slower and shared, and the log line records the real figure.
 */
const BOUND_MS = 300

function medianMs(blurPct: number): number {
  const study = { blurPct, values: { count: 5, hue: 55, neutral: false } }
  applyStudy(noise(1000, 1000, 99), 1000, 1000, study)
  const times: number[] = []
  for (let run = 0; run < 3; run++) {
    const d = noise(1000, 1000, run)
    const t0 = performance.now()
    applyStudy(d, 1000, 1000, study)
    times.push(performance.now() - t0)
  }
  return [...times].sort((a, b) => a - b)[1] ?? Infinity
}

describe('performance', () => {
  for (const blurPct of [40, 100]) {
    it(`blur ${String(blurPct)}% + values on a 1 MP tile`, () => {
      const median = medianMs(blurPct)
      console.log(
        `applyStudy 1 MP blur ${String(blurPct)}% + values: ${median.toFixed(1)} ms (median of 3)`,
      )
      expect(median).toBeLessThan(BOUND_MS)
    }, 20_000)
  }
})
