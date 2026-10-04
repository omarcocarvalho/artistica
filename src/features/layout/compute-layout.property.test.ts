import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeLayout } from './compute-layout'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { itemsArb, pageSetupArb } from './test-support/arbitraries'
import { realisticItems } from './test-support/fixtures'
import { expectLayoutInvariants, TOL } from './test-support/invariants'
import type { LayoutResult } from './types'

const smallestImage = (r: LayoutResult): number =>
  Math.min(
    ...r.pages.flatMap((p) =>
      p.placements.flatMap((pl) => pl.tiles.map((t) => Math.min(t.w, t.h))),
    ),
  )

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

  it('auto orientation is no worse than either forced one (realistic photos)', () => {
    // Random arbitraries almost never make the orientations differ; realistic mixes do.
    fc.assert(
      fc.property(
        fc.constantFrom(
          'A3' as const,
          'A4' as const,
          'A5' as const,
          'A6' as const,
          'Letter' as const,
        ),
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 1000 }),
        (paper, n, seed) => {
          const items = realisticItems(n, seed)
          const setup = { ...DEFAULT_PAGE_SETUP, paper }
          const auto = computeLayout(setup, items)
          for (const orientation of ['portrait', 'landscape'] as const) {
            const forced = computeLayout({ ...setup, orientation }, items)
            expect(auto.pages.length).toBeLessThanOrEqual(forced.pages.length)
            if (auto.pages.length === forced.pages.length) {
              expect(smallestImage(auto)).toBeGreaterThanOrEqual(smallestImage(forced) - TOL)
            }
          }
        },
      ),
      { numRuns: 60 },
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
