import { describe, expect, it } from 'vitest'
import { applyStudy } from './apply-study'
import { noise } from './test-support/pixels'

interface Runtime {
  process?: { env: Record<string, string | undefined> }
  __vitest_worker__?: { config?: { coverage?: { enabled?: boolean } } }
}
const runtime = globalThis as Runtime
/** Local desktop target 60 ms (overview, Performance budgets); CI runners are slower and shared. */
const UNINSTRUMENTED_BOUND_MS = runtime.process?.env.CI ? 300 : 120
/** v8 coverage (CI runs `test:coverage`) makes this pixel loop about 4× slower. */
const COVERAGE_SLOWDOWN = 5
const BOUND_MS =
  UNINSTRUMENTED_BOUND_MS *
  (runtime.__vitest_worker__?.config?.coverage?.enabled ? COVERAGE_SLOWDOWN : 1)

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
