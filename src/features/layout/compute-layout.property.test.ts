import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeLayout } from './compute-layout'
import { itemsArb, pageSetupArb } from './test-support/arbitraries'
import { expectLayoutInvariants } from './test-support/invariants'

const RUNS = { numRuns: 200 }

describe('computeLayout properties', () => {
  it('satisfies every contract rule for any setup and items', () => {
    fc.assert(
      fc.property(pageSetupArb, itemsArb(14), (setup, items) => {
        expectLayoutInvariants(setup, items, computeLayout(setup, items))
      }),
      RUNS,
    )
  })

  it('is deterministic and independent of input order', () => {
    fc.assert(
      fc.property(pageSetupArb, itemsArb(10), fc.integer(), (setup, items, seed) => {
        const a = computeLayout(setup, items)
        expect(computeLayout(setup, items)).toEqual(a)
        // Deterministic Fisher–Yates driven by the seed (no Math.random).
        const shuffled = [...items]
        let x = seed | 0
        for (let i = shuffled.length - 1; i > 0; i--) {
          x = (Math.imul(x, 1103515245) + 12345) | 0
          const j = Math.abs(x) % (i + 1)
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] as [never, never]
        }
        expect(computeLayout(setup, shuffled)).toEqual(a)
      }),
      { numRuns: 100 },
    )
  })

  it('returns plain data that survives structuredClone (crosses the worker boundary)', () => {
    fc.assert(
      fc.property(pageSetupArb, itemsArb(6), (setup, items) => {
        const r = computeLayout(setup, items)
        expect(structuredClone(r)).toEqual(r)
      }),
      { numRuns: 50 },
    )
  })
})
