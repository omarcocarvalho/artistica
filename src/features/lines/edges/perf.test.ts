import { describe, expect, it } from 'vitest'
import { MAX_EDGE_VERTICES, edgeOutline } from './outline'
import { noise } from './test-support/synthetic'

/**
 * The desktop budget is 300 ms (overview, Performance budgets). The bound is the CI one: CI
 * runners are slower and shared, and the log line records the real figure.
 */
const BOUND_MS = 2000

describe('performance', () => {
  it('a 1024 × 768 noise image at detail 100', () => {
    const [w, h] = [1024, 768]
    edgeOutline(noise(w, h, 99), w, h, 100)
    const times: number[] = []
    for (let run = 0; run < 3; run++) {
      const img = noise(w, h, run)
      const t0 = performance.now()
      const out = edgeOutline(img, w, h, 100)
      times.push(performance.now() - t0)
      const kept = out.reduce((s, p) => s + p.length, 0)
      expect(kept).toBeLessThanOrEqual(MAX_EDGE_VERTICES)
      expect(kept).toBeGreaterThan(MAX_EDGE_VERTICES - 50)
    }
    const median = [...times].sort((a, b) => a - b)[1] ?? Infinity
    console.log(`edgeOutline 1024 × 768 noise, detail 100: ${median.toFixed(1)} ms (median of 3)`)
    expect(median).toBeLessThan(BOUND_MS)
  }, 30_000)
})
